import type { Page } from "@playwright/test";
import {
  createClinicResource,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  type OnboardedAdmin,
  type SeedMembershipRole,
} from "./accounts";
import { getTestPrisma } from "./db";
import { setDoctorTreatment, type Treatment } from "./doctor-treatment";
import { PLATFORM_BASE_URL } from "./env";
import { loginViaUi } from "./ui";
import { uniqueName } from "./users";

export interface ProfileWorld {
  admin: OnboardedAdmin;
  organizationId: string;
  organizationName: string;
  clinicId: string;
  clinicName: string;
  specialtyId: string;
  specialtyName: string;
}

export interface ProfileUser {
  email: string;
  userId: string;
  accountId: string;
  name: string;
  lastName: string;
}

export type ProfileWorkspace =
  | { kind: "workspaces" }
  | { kind: "clinic"; clinicId: string }
  | { kind: "organization"; organizationId: string };

export async function createProfileWorld(label: string): Promise<ProfileWorld> {
  const admin = await createOnboardedAdmin({ emailPrefix: `admin-${label}` });
  const organizationName = uniqueName(`ORG-${label}`);
  const organizationId = await createOrganizationResource(
    admin,
    organizationName,
  );
  const clinicName = uniqueName(`Sede-${label}`);
  const clinicId = await createClinicResource(admin, organizationId, {
    name: clinicName,
  });
  const specialtyName = uniqueName(`Especialidad-${label}`);
  const specialtyId = await createSpecialty(
    admin,
    organizationId,
    specialtyName,
  );

  return {
    admin,
    organizationId,
    organizationName,
    clinicId,
    clinicName,
    specialtyId,
    specialtyName,
  };
}

export function adminAsProfileUser(world: ProfileWorld): ProfileUser {
  return {
    email: world.admin.email,
    userId: world.admin.userId,
    accountId: world.admin.accountId,
    name: world.admin.name,
    lastName: world.admin.lastName,
  };
}

export interface AddMemberOptions {
  label: string;
  clinicId?: string;
  name?: string;
  lastName?: string;
  phone?: string;
}

export async function addMember(
  world: ProfileWorld,
  role: SeedMembershipRole,
  options: AddMemberOptions,
): Promise<ProfileUser> {
  const member = await createMemberWithRole({
    accountId: world.admin.accountId,
    resourceId: options.clinicId ?? world.clinicId,
    role,
    createdBy: world.admin.userId,
    emailPrefix: `${role.toLowerCase()}-${options.label}`,
    name: options.name,
    lastName: options.lastName,
    phone: options.phone,
  });

  return {
    email: member.email,
    userId: member.userId,
    accountId: world.admin.accountId,
    name: member.name,
    lastName: member.lastName,
  };
}

export interface AddDoctorOptions extends AddMemberOptions {
  specialtyIds?: string[];
  treatment?: Treatment;
}

export async function addDoctor(
  world: ProfileWorld,
  options: AddDoctorOptions,
): Promise<ProfileUser> {
  const clinicId = options.clinicId ?? world.clinicId;
  const doctor = await addMember(world, "DOCTOR", { ...options, clinicId });

  await addDoctorProfile(doctor.userId, clinicId, options.specialtyIds ?? []);
  if (options.treatment) {
    await setDoctorTreatment(doctor.userId, options.treatment);
  }

  return doctor;
}

export async function addDoctorProfile(
  userId: string,
  clinicId: string,
  specialtyIds: string[],
): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.doctorProfile.create({
    data: {
      userId,
      clinicId,
      specialties: { connect: specialtyIds.map((id) => ({ id })) },
    },
  });
}

/** Sede extra de la misma organización, con el médico ya como DOCTOR de ella. */
export async function addDoctorToSecondClinic(
  world: ProfileWorld,
  doctor: ProfileUser,
  clinicName: string,
  specialtyIds: string[],
): Promise<string> {
  const clinicId = await createClinicResourceViaPrisma(
    world.admin,
    world.organizationId,
    { name: clinicName },
  );
  const prisma = await getTestPrisma();
  await prisma.userResourceMembership.create({
    data: {
      userId: doctor.userId,
      resourceId: clinicId,
      accountId: world.admin.accountId,
      role: "DOCTOR",
      createdBy: world.admin.userId,
    },
  });
  await addDoctorProfile(doctor.userId, clinicId, specialtyIds);

  return clinicId;
}

export async function readStoredUser(userId: string) {
  const prisma = await getTestPrisma();
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}

export async function loginAndOpenProfile(
  page: Page,
  user: ProfileUser,
  workspace: ProfileWorkspace = { kind: "workspaces" },
): Promise<void> {
  await loginViaUi(
    page,
    user.email,
    new RegExp(`/account/${user.accountId}/select$`),
  );

  if (workspace.kind === "workspaces") {
    await page.goto(`/account/${user.accountId}/me`);
    return;
  }

  const isClinic = workspace.kind === "clinic";
  const resourceId = isClinic ? workspace.clinicId : workspace.organizationId;
  await page.context().addCookies([
    {
      name: "resource_id",
      value: resourceId,
      url: PLATFORM_BASE_URL,
      sameSite: "Lax",
    },
    {
      name: "resource_type",
      value: isClinic ? "CLINIC" : "ORGANIZATION",
      url: PLATFORM_BASE_URL,
      sameSite: "Lax",
    },
  ]);
  await page.goto(
    `/account/${user.accountId}/${isClinic ? "clinic" : "organization"}/${resourceId}/me`,
  );
}
