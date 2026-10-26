import type { Page } from "@playwright/test";
import {
  createClinicResource,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  type OnboardedAdmin,
  type SeededMember,
  type SeedMembershipRole,
} from "./accounts";
import { getTestPrisma } from "./db";
import { API_BASE_URL, PLATFORM_BASE_URL } from "./env";
import {
  type PatientSpec,
  type SeededPatient,
  seedAppointment,
  seedPatientInClinic,
  setAccountPlan,
} from "./patients";
import { addDoctorProfile, findDoctorProfileId } from "./profile";
import { uniqueName } from "./users";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const LIMA_TIME_ZONE = "America/Lima";

export interface ScopeResource {
  id: string;
  name: string;
}

export interface PatientCrossVisits {
  visitAtClinicA: Date;
  visitAtClinicB: Date;
  missedAtClinicC: Date;
  upcomingAtClinicC: Date;
}

export interface PatientScopeWorld {
  admin: OnboardedAdmin;
  organizationOne: ScopeResource;
  organizationTwo: ScopeResource;
  clinicA: ScopeResource;
  clinicB: ScopeResource;
  clinicC: ScopeResource;
  doctorProfileIds: { clinicA: string; clinicB: string; clinicC: string };
  doctorNames: { clinicA: string; clinicB: string; clinicC: string };
  pa: SeededPatient;
  pb: SeededPatient;
  pc: SeededPatient;
  px: SeededPatient & { visits: PatientCrossVisits };
}

const daysFromNow = (days: number) =>
  new Date(Date.now() + days * MILLISECONDS_PER_DAY);

const shortDateFormatter = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  timeZone: LIMA_TIME_ZONE,
});

export const formatLimaShortDate = (instant: Date) =>
  shortDateFormatter.format(instant);

export async function createOrganizationWithClinics(
  admin: OnboardedAdmin,
  label: string,
  clinicLabels: string[],
) {
  const organizationName = uniqueName(`ORG-${label}`);
  const organization: ScopeResource = {
    id: await createOrganizationResource(admin, organizationName),
    name: organizationName,
  };

  const clinics: ScopeResource[] = [];
  for (const clinicLabel of clinicLabels) {
    const name = uniqueName(`Sede-${clinicLabel}`);
    const id = await createClinicResource(admin, organization.id, { name });
    clinics.push({ id, name });
  }

  return { organization, clinics };
}

// El ADMIN que crea una sede recibe en ella un perfil de médico vacío: sirve de médico de las citas sembradas.
async function ownerDoctorProfile(admin: OnboardedAdmin, clinicId: string) {
  const profileId = await findDoctorProfileId(admin.userId, clinicId);
  if (!profileId)
    throw new Error(`La sede ${clinicId} no tiene perfil de médico`);
  return profileId;
}

export interface PatientScopeOptions {
  distinctDoctors?: boolean;
}

async function createClinicDoctor(
  admin: OnboardedAdmin,
  clinicId: string,
  name: string,
  lastName: string,
) {
  const member = await createMemberWithRole({
    accountId: admin.accountId,
    resourceId: clinicId,
    role: "DOCTOR",
    createdBy: admin.userId,
    emailPrefix: `medico-${lastName.toLowerCase()}`,
    name,
    lastName,
  });
  const doctorProfileId = await addDoctorProfile(member.userId, clinicId, []);

  return { doctorProfileId, fullName: `${name} ${lastName}` };
}

export async function createPatientScopeWorld(
  label: string,
  options: PatientScopeOptions = {},
): Promise<PatientScopeWorld> {
  const admin = await createOnboardedAdmin({ emailPrefix: `admin-${label}` });
  await setAccountPlan(admin.accountId, "CLINICA");

  const one = await createOrganizationWithClinics(admin, `${label}-O1`, [
    `${label}-A`,
    `${label}-B`,
  ]);
  const two = await createOrganizationWithClinics(admin, `${label}-O2`, [
    `${label}-C`,
  ]);
  const [clinicA, clinicB] = one.clinics;
  const [clinicC] = two.clinics;
  const doctors = options.distinctDoctors
    ? {
        clinicA: await createClinicDoctor(admin, clinicA.id, "Aurelio", "Alfa"),
        clinicB: await createClinicDoctor(admin, clinicB.id, "Beatriz", "Beta"),
        clinicC: await createClinicDoctor(admin, clinicC.id, "Cecilia", "Gama"),
      }
    : null;
  const ownerName = `${admin.name} ${admin.lastName}`;
  const doctorProfileIds = {
    clinicA:
      doctors?.clinicA.doctorProfileId ??
      (await ownerDoctorProfile(admin, clinicA.id)),
    clinicB:
      doctors?.clinicB.doctorProfileId ??
      (await ownerDoctorProfile(admin, clinicB.id)),
    clinicC:
      doctors?.clinicC.doctorProfileId ??
      (await ownerDoctorProfile(admin, clinicC.id)),
  };
  const doctorNames = {
    clinicA: doctors?.clinicA.fullName ?? ownerName,
    clinicB: doctors?.clinicB.fullName ?? ownerName,
    clinicC: doctors?.clinicC.fullName ?? ownerName,
  };

  const seedInOrder = (
    clinic: ScopeResource,
    doctorProfileId: string,
    spec: PatientSpec,
    position: number,
    scheduledAt: Date,
    status: "COMPLETED" | "PENDING" = "COMPLETED",
  ) =>
    seedPatientInClinic({
      accountId: admin.accountId,
      clinicId: clinic.id,
      doctorProfileId,
      spec,
      idInstantMilliseconds:
        Date.now() - MILLISECONDS_PER_DAY + position * 1000,
      appointment: { scheduledAt, status },
    });

  const pa = await seedInOrder(
    clinicA,
    doctorProfileIds.clinicA,
    {
      name: "Pablo",
      lastName: "Alfa",
      documentNumber: "70000001",
      phone: "+51911000001",
    },
    1,
    daysFromNow(-20),
  );
  const pb = await seedInOrder(
    clinicB,
    doctorProfileIds.clinicB,
    {
      name: "Pedro",
      lastName: "Beta",
      documentNumber: "70000002",
      phone: "+51911000002",
    },
    2,
    daysFromNow(-20),
  );
  const pc = await seedInOrder(
    clinicC,
    doctorProfileIds.clinicC,
    {
      name: "Pilar",
      lastName: "Gama",
      documentNumber: "70000003",
      phone: "+51911000003",
    },
    3,
    daysFromNow(-20),
  );

  const visits: PatientCrossVisits = {
    visitAtClinicA: daysFromNow(-10),
    visitAtClinicB: daysFromNow(-5),
    missedAtClinicC: daysFromNow(-3),
    upcomingAtClinicC: daysFromNow(4),
  };
  const px = await seedInOrder(
    clinicA,
    doctorProfileIds.clinicA,
    {
      name: "Pamela",
      lastName: "Xenia",
      documentNumber: "70000004",
      phone: "+51911000004",
    },
    4,
    visits.visitAtClinicA,
  );
  await seedAppointment({
    patientId: px.id,
    clinicId: clinicB.id,
    doctorProfileId: doctorProfileIds.clinicB,
    scheduledAt: visits.visitAtClinicB,
    status: "COMPLETED",
  });
  await seedAppointment({
    patientId: px.id,
    clinicId: clinicC.id,
    doctorProfileId: doctorProfileIds.clinicC,
    scheduledAt: visits.missedAtClinicC,
    status: "NO_SHOW",
  });
  await seedAppointment({
    patientId: px.id,
    clinicId: clinicC.id,
    doctorProfileId: doctorProfileIds.clinicC,
    scheduledAt: visits.upcomingAtClinicC,
    status: "PENDING",
  });

  return {
    admin,
    organizationOne: one.organization,
    organizationTwo: two.organization,
    clinicA,
    clinicB,
    clinicC,
    doctorProfileIds,
    doctorNames,
    pa,
    pb,
    pc,
    px: { ...px, visits },
  };
}

export function addScopeMember(
  world: Pick<PatientScopeWorld, "admin">,
  role: SeedMembershipRole,
  resourceId: string,
  label: string,
): Promise<SeededMember> {
  return createMemberWithRole({
    accountId: world.admin.accountId,
    resourceId,
    role,
    createdBy: world.admin.userId,
    emailPrefix: `${role.toLowerCase()}-${label}`,
  });
}

export async function addMixedRoleMember(
  world: PatientScopeWorld,
): Promise<SeededMember> {
  const member = await addScopeMember(world, "USER", world.clinicA.id, "mixto");
  const prisma = await getTestPrisma();
  await prisma.userResourceMembership.create({
    data: {
      userId: member.userId,
      resourceId: world.clinicB.id,
      accountId: world.admin.accountId,
      role: "ADMIN",
      createdBy: world.admin.userId,
    },
  });

  return member;
}

export async function restoreMembership(membershipId: string): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.userResourceMembership.update({
    where: { id: membershipId },
    data: { deletedAt: null },
  });
}

export interface ForeignClinic {
  admin: OnboardedAdmin;
  organization: ScopeResource;
  clinic: ScopeResource;
  patient: SeededPatient;
}

export async function createForeignClinicWithPatient(
  spec: PatientSpec,
): Promise<ForeignClinic> {
  const admin = await createOnboardedAdmin({ emailPrefix: "admin-ajena" });
  await setAccountPlan(admin.accountId, "CONSULTORIO");
  const { organization, clinics } = await createOrganizationWithClinics(
    admin,
    "ajena",
    ["ajena"],
  );
  const [clinic] = clinics;
  const patient = await seedPatientInClinic({
    accountId: admin.accountId,
    clinicId: clinic.id,
    doctorProfileId: await ownerDoctorProfile(admin, clinic.id),
    spec,
    idInstantMilliseconds: Date.now() - MILLISECONDS_PER_DAY,
    appointment: { scheduledAt: daysFromNow(-7), status: "COMPLETED" },
  });

  return { admin, organization, clinic, patient };
}

export const clinicPatientsPath = (accountId: string, clinicId: string) =>
  `/account/${accountId}/clinic/${clinicId}/patients`;

export const organizationPatientsPath = (
  accountId: string,
  organizationId: string,
) => `/account/${accountId}/organization/${organizationId}/patients`;

export async function selectOrganizationWorkspace(
  page: Page,
  organizationId: string,
): Promise<void> {
  await page.context().addCookies([
    {
      name: "resource_id",
      value: organizationId,
      url: PLATFORM_BASE_URL,
      sameSite: "Lax",
    },
    {
      name: "resource_type",
      value: "ORGANIZATION",
      url: PLATFORM_BASE_URL,
      sameSite: "Lax",
    },
  ]);
}

export const patientsApiUrl = (resourceId: string, suffix = "") =>
  `${API_BASE_URL}/patients/in/${resourceId}${suffix}`;
