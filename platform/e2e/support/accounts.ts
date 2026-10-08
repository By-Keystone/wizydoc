import {
  request as apiRequestFactory,
  type APIRequestContext,
} from "@playwright/test";
import { API_BASE_URL, PLATFORM_BASE_URL } from "./env";
import { getTestPrisma } from "./db";
import { createConfirmedUser, uniqueName } from "./users";
import { trackApiContext } from "./test";

export type SeedMembershipRole = "ADMIN" | "DOCTOR" | "USER";

/** Cookie jar propia por actor: reutilizar un contexto entre identidades mezcla sus sesiones. */
export async function createApiContext(): Promise<APIRequestContext> {
  const context = await apiRequestFactory.newContext({
    baseURL: API_BASE_URL,
    extraHTTPHeaders: { Origin: PLATFORM_BASE_URL },
  });
  return trackApiContext(context);
}

export interface OnboardedAdmin {
  context: APIRequestContext;
  email: string;
  userId: string;
  accountId: string;
  name: string;
  lastName: string;
  phone: string;
}

export interface CreateOnboardedAdminOptions {
  accountName?: string;
  name?: string;
  lastName?: string;
  phone?: string;
  emailPrefix?: string;
}

/** `POST /account` deja al usuario ADMIN de su propia organización en cuanto la crea. */
export async function createOnboardedAdmin(
  options: CreateOnboardedAdminOptions = {},
): Promise<OnboardedAdmin> {
  const context = await createApiContext();
  const { email, userId, name, lastName, phone } = await createConfirmedUser(
    context,
    {
      emailPrefix: options.emailPrefix ?? "admin",
      name: options.name,
      lastName: options.lastName,
      phone: options.phone,
    },
  );

  const response = await context.post(`${API_BASE_URL}/account`, {
    data: { accountName: options.accountName ?? uniqueName("Consultorio") },
  });
  if (!response.ok()) {
    throw new Error(
      `POST /account falló (${response.status()}): ${await response.text()}`,
    );
  }

  const { accountId } = (await response.json()) as { accountId: string };

  return { context, email, userId, accountId, name, lastName, phone };
}

/** `POST /organization` no devuelve cuerpo, así que el `resourceId` se lee de la base. */
export async function createOrganizationResource(
  admin: OnboardedAdmin,
  name: string = uniqueName("Organización"),
): Promise<string> {
  const response = await admin.context.post(`${API_BASE_URL}/organization`, {
    data: { name },
  });
  if (!response.ok()) {
    throw new Error(
      `POST /organization falló (${response.status()}): ${await response.text()}`,
    );
  }

  const prisma = await getTestPrisma();
  const organization = await prisma.organization.findFirst({
    where: { accountId: admin.accountId, name },
  });
  if (!organization) {
    throw new Error(`No se encontró la organización "${name}" recién creada`);
  }

  return organization.resourceId;
}

export interface CreateClinicResourceOptions {
  name?: string;
  phone?: string;
  address?: string;
}

/** `POST /clinic` responde 201 sin cuerpo (bug ajeno, se reporta y no se toca): el `resourceId` se lee de la base. */
export async function createClinicResource(
  admin: OnboardedAdmin,
  organizationId: string,
  options: CreateClinicResourceOptions = {},
): Promise<string> {
  const name = options.name ?? uniqueName("Sede");

  const response = await admin.context.post(`${API_BASE_URL}/clinic`, {
    data: {
      name,
      phone: options.phone ?? "+51999888777",
      address: options.address ?? "Av. Siempre Viva 123",
      organizationId,
    },
  });
  if (!response.ok()) {
    throw new Error(
      `POST /clinic falló (${response.status()}): ${await response.text()}`,
    );
  }

  const prisma = await getTestPrisma();
  const clinic = await prisma.clinic.findFirst({
    where: {
      name,
      resource: {
        accountId: admin.accountId,
        parentResourceId: organizationId,
      },
    },
  });
  if (!clinic) {
    throw new Error(`No se encontró la sede "${name}" recién creada`);
  }

  return clinic.resourceId;
}

/** Bypassa `POST /clinic` (el plan Gratis limita a una sede) para crear una segunda sede de control. */
export async function createClinicResourceViaPrisma(
  admin: OnboardedAdmin,
  organizationId: string,
  options: CreateClinicResourceOptions = {},
): Promise<string> {
  const prisma = await getTestPrisma();

  const resource = await prisma.resource.create({
    data: {
      type: "CLINIC",
      accountId: admin.accountId,
      createdBy: admin.userId,
      parentResourceId: organizationId,
    },
  });

  await prisma.clinic.create({
    data: {
      resourceId: resource.id,
      name: options.name ?? uniqueName("Sede"),
      phone: options.phone ?? "+51999888777",
      address: options.address ?? "Av. Siempre Viva 123",
    },
  });

  return resource.id;
}

export interface SeededMember {
  context: APIRequestContext;
  email: string;
  userId: string;
  membershipId: string;
  name: string;
  lastName: string;
  phone: string;
}

export interface CreateMemberWithRoleParams {
  accountId: string;
  resourceId: string;
  role: SeedMembershipRole;
  createdBy: string;
  name?: string;
  lastName?: string;
  phone?: string;
  emailPrefix?: string;
}

/** Replica accountId y onboardingCompleted como en producción: si no, un 403 por rol se confunde con un 403 por falta de cuenta. */
export async function createMemberWithRole(
  params: CreateMemberWithRoleParams,
): Promise<SeededMember> {
  const context = await createApiContext();
  const { email, userId, name, lastName, phone } = await createConfirmedUser(
    context,
    {
      emailPrefix: params.emailPrefix ?? params.role.toLowerCase(),
      name: params.name,
      lastName: params.lastName,
      phone: params.phone,
    },
  );

  const prisma = await getTestPrisma();
  const membership = await prisma.userResourceMembership.create({
    data: {
      userId,
      resourceId: params.resourceId,
      accountId: params.accountId,
      role: params.role,
      createdBy: params.createdBy,
    },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { accountId: params.accountId, onboardingCompleted: true },
  });

  return {
    context,
    email,
    userId,
    membershipId: membership.id,
    name,
    lastName,
    phone,
  };
}

/** `POST /:resourceId/specialty` no devuelve id: se lee de `GET /:resourceId/specialties`. */
export async function createSpecialty(
  admin: OnboardedAdmin,
  organizationId: string,
  name: string = uniqueName("Especialidad"),
): Promise<string> {
  const response = await admin.context.post(
    `${API_BASE_URL}/${organizationId}/specialty`,
    {
      data: { name },
    },
  );
  if (!response.ok()) {
    throw new Error(
      `POST /:resourceId/specialty falló (${response.status()}): ${await response.text()}`,
    );
  }

  const listResponse = await admin.context.get(
    `${API_BASE_URL}/${organizationId}/specialties`,
  );
  if (!listResponse.ok()) {
    throw new Error(
      `GET /:resourceId/specialties falló (${listResponse.status()}): ${await listResponse.text()}`,
    );
  }
  const { specialties } = (await listResponse.json()) as {
    specialties: { id: string; name: string }[];
  };
  const specialty = specialties.find((s) => s.name === name);
  if (!specialty) {
    throw new Error(`No se encontró la especialidad "${name}" recién creada`);
  }

  return specialty.id;
}

export interface InviteUserViaApiParams {
  email: string;
  name: string;
  lastName: string;
  phone: string;
  role: SeedMembershipRole;
  resourceId: string;
  specialtyIds?: string[];
}

/** Invita a un usuario de verdad, vía `POST /user/invite` (no por Prisma). */
export async function inviteUserViaApi(
  admin: OnboardedAdmin,
  params: InviteUserViaApiParams,
) {
  const response = await admin.context.post(`${API_BASE_URL}/user/invite`, {
    data: params,
  });
  if (!response.ok()) {
    throw new Error(
      `POST /user/invite falló (${response.status()}): ${await response.text()}`,
    );
  }
  return response;
}
