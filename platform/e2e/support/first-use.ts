import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  createClinicResource,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  type OnboardedAdmin,
} from "./accounts";
import { addPortalDoctor, type PortalDoctor } from "./appointment-portal";
import { seedFullDayAvailability } from "./availability";
import { getTestPrisma } from "./db";
import { API_BASE_URL } from "./env";
import { loginAndGoTo, ONBOARDING_ADDRESS, ONBOARDING_SPECIALTY } from "./ui";
import { uniqueName } from "./users";

export const CORAL = "rgb(255, 111, 89)";
export const TEAL = "rgb(12, 126, 117)";
export const WHITE = "rgb(255, 255, 255)";

export const LINK_READY_TEXT =
  "Tus pacientes ya pueden reservar desde el link.";
export const LINK_DOWN_TITLE = "El link de reservas todavía no funciona";
export const NO_PLAN_MESSAGE = "Tu plan no permite hacer uso de esta función";
export const LONG_WORD = "x".repeat(80);

export interface FirstClinicBody {
  name: string;
  address: string;
  specialty: string;
}

export function newFirstClinicBody(
  overrides: Partial<FirstClinicBody> = {},
): FirstClinicBody {
  return {
    name: uniqueName("Consultorio Paredes"),
    address: ONBOARDING_ADDRESS,
    specialty: ONBOARDING_SPECIALTY,
    ...overrides,
  };
}

export function postFirstClinic(context: APIRequestContext, body: object) {
  return context.post(`${API_BASE_URL}/account/first-clinic`, { data: body });
}

export interface OwnerWithClinic {
  owner: OnboardedAdmin;
  organizationId: string;
  clinicId: string;
  body: FirstClinicBody;
}

export async function createOwnerWithFirstClinic(
  options: { emailPrefix?: string; body?: Partial<FirstClinicBody> } = {},
): Promise<OwnerWithClinic> {
  const owner = await createOnboardedAdmin({
    emailPrefix: options.emailPrefix ?? "owner-first-clinic",
  });
  const body = newFirstClinicBody(options.body);
  const response = await postFirstClinic(owner.context, body);
  if (response.status() !== 201) {
    throw new Error(
      `POST /account/first-clinic falló (${response.status()}): ${await response.text()}`,
    );
  }
  const created = (await response.json()) as {
    organizationId: string;
    clinicId: string;
  };

  return { owner, ...created, body };
}

export async function readAccountFootprint(accountId: string) {
  const prisma = await getTestPrisma();
  const [
    resources,
    organizations,
    clinics,
    memberships,
    doctorProfiles,
    specialties,
    invitations,
    subscriptions,
  ] = await Promise.all([
    prisma.resource.count({ where: { accountId } }),
    prisma.organization.count({ where: { accountId } }),
    prisma.clinic.count({ where: { resource: { accountId } } }),
    prisma.userResourceMembership.count({ where: { accountId } }),
    prisma.doctorProfile.count({ where: { membership: { accountId } } }),
    prisma.specialty.count({ where: { organization: { accountId } } }),
    prisma.userInvitation.count({ where: { membership: { accountId } } }),
    prisma.subscription.count({ where: { accountId } }),
  ]);

  return {
    resources,
    organizations,
    clinics,
    memberships,
    doctorProfiles,
    specialties,
    invitations,
    subscriptions,
  };
}

interface OwnerMembershipRow {
  resourceId: string;
  role: string;
  deletedAt: Date | null;
  doctorProfile: {
    id: string;
    specialties: { name: string; organizationId: string }[];
  } | null;
}

export async function readFirstClinicRecords(
  accountId: string,
  ownerId: string,
) {
  const prisma = await getTestPrisma();
  const organization = await prisma.organization.findFirst({
    where: { accountId },
  });
  const clinic = await prisma.clinic.findFirst({
    where: { resource: { accountId } },
  });
  const memberships = (await prisma.userResourceMembership.findMany({
    where: { userId: ownerId, accountId },
    select: {
      resourceId: true,
      role: true,
      deletedAt: true,
      doctorProfile: {
        select: {
          id: true,
          specialties: { select: { name: true, organizationId: true } },
        },
      },
    },
  })) as OwnerMembershipRow[];

  return {
    organization,
    clinic,
    organizationMembership: memberships.find(
      (membership) => membership.resourceId === organization?.resourceId,
    ),
    clinicMembership: memberships.find(
      (membership) => membership.resourceId === clinic?.resourceId,
    ),
    membershipCount: memberships.length,
  };
}

export interface LegacyClinic {
  owner: OnboardedAdmin;
  organizationId: string;
  clinicId: string;
  clinicName: string;
}

// Dueño de antes: organización y sede creadas por api; desde #110 atiende en la sede sin especialidad ni horario.
export async function createLegacyOwnerClinic(
  options: { emailPrefix?: string; clinicName?: string } = {},
): Promise<LegacyClinic> {
  const owner = await createOnboardedAdmin({
    emailPrefix: options.emailPrefix ?? "owner-legacy",
  });
  const organizationId = await createOrganizationResource(
    owner,
    uniqueName("ORG-legacy"),
  );
  const clinicName = options.clinicName ?? uniqueName("Sede legacy");
  const clinicId = await createClinicResource(owner, organizationId, {
    name: clinicName,
  });

  return { owner, organizationId, clinicId, clinicName };
}

export async function addListedDoctor(
  owner: OnboardedAdmin,
  organizationId: string,
  clinicId: string,
): Promise<{ doctor: PortalDoctor; specialtyName: string }> {
  const specialtyName = uniqueName("Otra especialidad");
  const specialtyId = await createSpecialty(
    owner,
    organizationId,
    specialtyName,
  );
  const doctor = await addPortalDoctor({
    label: "listado",
    clinicId,
    admin: owner,
    specialtyId,
  });

  return { doctor, specialtyName };
}

export const clinicDashboardPath = (accountId: string, clinicId: string) =>
  `/account/${accountId}/clinic/${clinicId}/dashboard`;

export async function openClinicDashboard(
  page: Page,
  actor: { email: string; accountId: string; clinicId: string },
): Promise<void> {
  await loginAndGoTo(
    page,
    actor.email,
    clinicDashboardPath(actor.accountId, actor.clinicId),
  );
  await expect(page.getByText(/Este es el panel de /)).toBeVisible();
  // El clic de «Iniciar sesión» deja el ratón sobre lo que el tema resalta al pasar por encima.
  await page.mouse.move(0, 0);
}

export const firstSteps = (page: Page) =>
  page.getByRole("region", { name: /^Te (falta|faltan) \d pasos? para / });

export const stepNamed = (page: Page, title: string) =>
  firstSteps(page).getByRole("listitem").filter({ hasText: title });

export const stepLink = (step: Locator, name: string) =>
  step.getByRole("link", { name, exact: true });

export const linkNotice = (page: Page) =>
  page.getByRole("status").filter({
    has: page.getByRole("heading", { name: LINK_DOWN_TITLE }),
  });

export const copyLinkButton = (page: Page) =>
  page.getByRole("button", { name: "Copiar link de reservas", exact: true });

export const viewAsPatientLink = (page: Page) =>
  page.getByRole("link", { name: /^Ver como paciente/ });

export async function expectBackground(target: Locator, color: string) {
  await expect(target).toHaveCSS("background-color", color);
}

export async function visibleCoralElements(page: Page): Promise<string[]> {
  return page.evaluate((coral) => {
    return [...document.querySelectorAll("body *")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return (
          style.backgroundColor === coral &&
          style.visibility !== "hidden" &&
          box.width > 0 &&
          box.height > 0
        );
      })
      .map((element) => (element.textContent ?? "").trim());
  }, CORAL);
}

export async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

export type LinkCaseName =
  | "guide-only"
  | "guide-only-no-specialty"
  | "link-and-guide"
  | "link-only-listed"
  | "link-only-bystander"
  | "notice-only";

export interface LinkCase {
  email: string;
  accountId: string;
  clinicId: string;
  clinicName: string;
}

// Cada caso es una fila de L-4; el nombre y la especialidad largos prueban el celular.
export async function buildLinkCase(
  name: LinkCaseName,
  labels: { clinicName?: string; specialty?: string } = {},
): Promise<LinkCase> {
  const clinicName = labels.clinicName ?? uniqueName("Sede L4");
  const specialty = labels.specialty ?? ONBOARDING_SPECIALTY;

  if (name === "guide-only" || name === "link-only-listed") {
    const { owner, clinicId } = await createOwnerWithFirstClinic({
      emailPrefix: `l4-${name}`,
      body: { name: clinicName, specialty },
    });
    if (name === "link-only-listed") {
      await seedFullDayAvailability(owner.userId, clinicId);
    }
    return {
      email: owner.email,
      accountId: owner.accountId,
      clinicId,
      clinicName,
    };
  }

  if (name === "notice-only") {
    const owner = await createOnboardedAdmin({ emailPrefix: `l4-${name}` });
    const organizationId = await createOrganizationResource(
      owner,
      uniqueName("ORG-L4"),
    );
    const clinicId = await createClinicResourceViaPrisma(
      owner,
      organizationId,
      {
        name: clinicName,
      },
    );
    return {
      email: owner.email,
      accountId: owner.accountId,
      clinicId,
      clinicName,
    };
  }

  const { owner, organizationId, clinicId } = await createLegacyOwnerClinic({
    emailPrefix: `l4-${name}`,
    clinicName,
  });
  const ownerCase: LinkCase = {
    email: owner.email,
    accountId: owner.accountId,
    clinicId,
    clinicName,
  };
  if (name === "guide-only-no-specialty") return ownerCase;

  await addListedDoctor(owner, organizationId, clinicId);
  if (name === "link-and-guide") return ownerCase;

  const bystander = await createMemberWithRole({
    accountId: owner.accountId,
    resourceId: clinicId,
    role: "USER",
    createdBy: owner.userId,
    emailPrefix: "l4-usuario",
  });
  return { ...ownerCase, email: bystander.email };
}
