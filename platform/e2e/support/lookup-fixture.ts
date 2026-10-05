import {
  createClinicResource,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  type OnboardedAdmin,
  type SeededMember,
} from "./accounts";
import { uniqueName } from "./users";

/** Reproduce la preparación de fix-user-by-email-scope/plan.md; cada llamada crea datos nuevos, no se comparte entre tests. */
export interface LookupFixture {
  account1: OnboardedAdmin;
  organizationId: string;
  clinicAId: string;
  clinicBId: string;
  reception: SeededMember;
  doctor: SeededMember;
  adminOfClinicA: SeededMember;
  account2: OnboardedAdmin;
  organization2Id: string;
  clinicZId: string;
}

export async function seedLookupFixture(): Promise<LookupFixture> {
  const account1 = await createOnboardedAdmin({
    emailPrefix: "admin",
    name: "Alicia",
    lastName: "Administradora",
    phone: "+51900000001",
  });
  const organizationId = await createOrganizationResource(
    account1,
    uniqueName("ORG"),
  );
  const clinicAId = await createClinicResource(account1, organizationId, {
    name: uniqueName("Sede A"),
  });
  // Por Prisma: el plan Gratis limita a una sede por cuenta; esta es sólo de control.
  const clinicBId = await createClinicResourceViaPrisma(
    account1,
    organizationId,
    {
      name: uniqueName("Sede B"),
    },
  );

  const reception = await createMemberWithRole({
    accountId: account1.accountId,
    resourceId: clinicAId,
    role: "USER",
    createdBy: account1.userId,
    emailPrefix: "recepcion",
    name: "Rosa",
    lastName: "Recepción",
    phone: "+51911111111",
  });

  const doctor = await createMemberWithRole({
    accountId: account1.accountId,
    resourceId: clinicAId,
    role: "DOCTOR",
    createdBy: account1.userId,
    emailPrefix: "doctor",
    name: "Darío",
    lastName: "Doctor",
    phone: "+51922222222",
  });

  const adminOfClinicA = await createMemberWithRole({
    accountId: account1.accountId,
    resourceId: clinicAId,
    role: "ADMIN",
    createdBy: account1.userId,
    emailPrefix: "adminsede",
    name: "Adela",
    lastName: "Sede",
    phone: "+51933333333",
  });

  const account2 = await createOnboardedAdmin({
    emailPrefix: "otroadmin",
    name: "Óscar",
    lastName: "Otro",
    phone: "+51900000002",
  });
  const organization2Id = await createOrganizationResource(
    account2,
    uniqueName("ORG-2"),
  );
  const clinicZId = await createClinicResource(account2, organization2Id, {
    name: uniqueName("Sede Z"),
  });

  return {
    account1,
    organizationId,
    clinicAId,
    clinicBId,
    reception,
    doctor,
    adminOfClinicA,
    account2,
    organization2Id,
    clinicZId,
  };
}
