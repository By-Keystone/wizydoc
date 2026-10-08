import { randomUUID } from "node:crypto";
import { test, expect } from "../../support/test";
import { API_BASE_URL } from "../../support/env";
import {
  createApiContext,
  createClinicResource,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  type OnboardedAdmin,
} from "../../support/accounts";
import {
  invitePendingUser,
  softDeleteMembership,
} from "../../support/invitations";
import { uniqueName } from "../../support/users";
import { seedFullDayAvailability } from "../../support/availability";
import { getTestPrisma } from "../../support/db";

/**
 * docs/features/fix-booking-scope/plan.md — CA-1, CA-3 a CA-10. CA-9 se
 * comprueba porque cada rechazo se compara con el mismo cuerpo fijo. CA-11
 * se verifica por revisión; CA-12 y CA-13 son de navegador.
 */

const BOOKING_OPTION_UNAVAILABLE =
  "Ese médico o especialidad ya no está disponible en esta sede. Recarga la página y vuelve a elegirlos.";

const DAYS_AHEAD = 30;

function futureScheduledAt(): string {
  const date = new Date();
  date.setDate(date.getDate() + DAYS_AHEAD);
  return `${date.toISOString().slice(0, 10)}T10:00`;
}

const SCHEDULED_AT = futureScheduledAt();

interface BookableDoctor {
  admin: OnboardedAdmin;
  organizationId: string;
  clinicId: string;
  doctorProfileId: string;
  membershipId: string;
  specialtyId: string;
  specialtyName: string;
}

async function createBookableDoctor(label: string): Promise<BookableDoctor> {
  const admin = await createOnboardedAdmin({ emailPrefix: `admin-${label}` });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName(`ORG-${label}`),
  );
  const clinicId = await createClinicResource(admin, organizationId, {
    name: uniqueName(`Sede-${label}`),
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
    clinicId,
    ...(await inviteDoctor(admin, clinicId, specialtyId, label)),
    specialtyId,
    specialtyName,
  };
}

async function inviteDoctor(
  admin: OnboardedAdmin,
  clinicId: string,
  specialtyId: string,
  label: string,
) {
  const invitation = await invitePendingUser(admin, {
    resourceId: clinicId,
    role: "DOCTOR",
    emailPrefix: `doctor-${label}`,
    specialtyIds: [specialtyId],
  });
  const prisma = await getTestPrisma();
  const profile = await prisma.doctorProfile.findFirst({
    where: { userId: invitation.userId },
  });
  if (!profile) throw new Error("La invitación no creó el perfil de médico");
  await seedFullDayAvailability(invitation.userId, clinicId);
  return {
    doctorProfileId: profile.id,
    membershipId: invitation.membershipId,
  };
}

interface BookingOverrides {
  clinicId: string;
  doctorProfileId: string;
  specialty: string;
}

function bookingBody(documentNumber: string, overrides: BookingOverrides) {
  return {
    patientName: "Paula",
    patientLastName: "Paciente",
    patientPhone: "+51900111222",
    patientEmail: "paula.paciente@example.com",
    patientDocumentNumber: documentNumber,
    patientDocumentType: "DNI",
    patientBirthDate: "1990-05-20",
    durationMinutes: 30,
    scheduledAt: SCHEDULED_AT,
    ...overrides,
  };
}

async function postAppointment(data: Record<string, unknown>) {
  const anonymous = await createApiContext();
  return anonymous.post(`${API_BASE_URL}/appointment`, { data });
}

function newDocumentNumber(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
}

async function countAppointments(doctorProfileId: string): Promise<number> {
  const prisma = await getTestPrisma();
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS count FROM appointment
    WHERE doctor_profile_id::text = ${doctorProfileId}`;
  return Number(rows[0].count);
}

async function countPatients(
  documentNumber: string,
  accountId: string,
): Promise<number> {
  const prisma = await getTestPrisma();
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS count FROM patient
    WHERE document_number = ${documentNumber}
    AND account_id::text = ${accountId}`;
  return Number(rows[0].count);
}

async function expectRejectedWithoutTrace(
  overrides: BookingOverrides,
  doctorProfileId: string,
  accountId: string,
) {
  const documentNumber = newDocumentNumber();
  const response = await postAppointment(
    bookingBody(documentNumber, overrides),
  );

  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({
    message: BOOKING_OPTION_UNAVAILABLE,
  });
  expect(await countAppointments(doctorProfileId)).toBe(0);
  expect(await countPatients(documentNumber, accountId)).toBe(0);
}

test.describe("La reserva válida sigue funcionando", () => {
  test("CA-1: sede, médico de esa sede y especialidad conectada crean exactamente una cita", async () => {
    const doctor = await createBookableDoctor("ca1");
    const documentNumber = newDocumentNumber();

    const response = await postAppointment(
      bookingBody(documentNumber, {
        clinicId: doctor.clinicId,
        doctorProfileId: doctor.doctorProfileId,
        specialty: doctor.specialtyName,
      }),
    );

    expect(response.status()).toBe(200);
    expect(await countAppointments(doctor.doctorProfileId)).toBe(1);
    expect(await countPatients(documentNumber, doctor.admin.accountId)).toBe(1);
  });
});

test.describe("Las combinaciones ajenas se rechazan igual y sin dejar rastro", () => {
  test("CA-3: médico de una sede de otra cuenta con el clinicId propio", async () => {
    const own = await createBookableDoctor("ca3-propia");
    const foreign = await createBookableDoctor("ca3-ajena");
    const foreignDoctor = await createMemberWithRole({
      accountId: foreign.admin.accountId,
      resourceId: foreign.clinicId,
      role: "DOCTOR",
      createdBy: foreign.admin.userId,
      emailPrefix: "doctor-ajeno-ca3",
    });
    const prisma = await getTestPrisma();
    const foreignProfile = await prisma.doctorProfile.create({
      data: {
        userId: foreignDoctor.userId,
        clinicId: foreign.clinicId,
        specialties: { connect: [{ id: own.specialtyId }] },
      },
    });

    await expectRejectedWithoutTrace(
      {
        clinicId: own.clinicId,
        doctorProfileId: foreignProfile.id,
        specialty: own.specialtyName,
      },
      foreignProfile.id,
      own.admin.accountId,
    );
  });

  test("CA-4: médico de otra sede de la misma cuenta", async () => {
    const own = await createBookableDoctor("ca4");
    const otherClinicId = await createClinicResourceViaPrisma(
      own.admin,
      own.organizationId,
      { name: uniqueName("Sede-otra-ca4") },
    );
    const otherDoctor = await createMemberWithRole({
      accountId: own.admin.accountId,
      resourceId: otherClinicId,
      role: "DOCTOR",
      createdBy: own.admin.userId,
      emailPrefix: "doctor-otra-sede-ca4",
    });
    const prisma = await getTestPrisma();
    const otherProfile = await prisma.doctorProfile.create({
      data: {
        userId: otherDoctor.userId,
        clinicId: otherClinicId,
        specialties: { connect: [{ id: own.specialtyId }] },
      },
    });

    await expectRejectedWithoutTrace(
      {
        clinicId: own.clinicId,
        doctorProfileId: otherProfile.id,
        specialty: own.specialtyName,
      },
      otherProfile.id,
      own.admin.accountId,
    );
  });

  test("CA-5: especialidad de la organización no conectada al médico", async () => {
    const doctor = await createBookableDoctor("ca5");
    const unconnectedName = uniqueName("Especialidad-sin-conectar-ca5");
    await createSpecialty(doctor.admin, doctor.organizationId, unconnectedName);

    await expectRejectedWithoutTrace(
      {
        clinicId: doctor.clinicId,
        doctorProfileId: doctor.doctorProfileId,
        specialty: unconnectedName,
      },
      doctor.doctorProfileId,
      doctor.admin.accountId,
    );
  });

  test("CA-6: especialidad de otra organización con el mismo nombre que una propia", async () => {
    const own = await createBookableDoctor("ca6");
    const sharedName = uniqueName("Especialidad-compartida-ca6");
    await createSpecialty(own.admin, own.organizationId, sharedName);

    const foreignAdmin = await createOnboardedAdmin({
      emailPrefix: "admin-ajeno-ca6",
    });
    const foreignOrganizationId = await createOrganizationResource(
      foreignAdmin,
      uniqueName("ORG-ajena-ca6"),
    );
    const foreignSpecialtyId = await createSpecialty(
      foreignAdmin,
      foreignOrganizationId,
      sharedName,
    );

    const corruptedDoctor = await createMemberWithRole({
      accountId: own.admin.accountId,
      resourceId: own.clinicId,
      role: "DOCTOR",
      createdBy: own.admin.userId,
      emailPrefix: "doctor-corrupto-ca6",
    });
    const prisma = await getTestPrisma();
    const corruptedProfile = await prisma.doctorProfile.create({
      data: {
        userId: corruptedDoctor.userId,
        clinicId: own.clinicId,
        specialties: { connect: [{ id: foreignSpecialtyId }] },
      },
    });

    await expectRejectedWithoutTrace(
      {
        clinicId: own.clinicId,
        doctorProfileId: corruptedProfile.id,
        specialty: sharedName,
      },
      corruptedProfile.id,
      own.admin.accountId,
    );
  });

  test("CA-7: médico con la membership de la sede borrada", async () => {
    const doctor = await createBookableDoctor("ca7");
    await softDeleteMembership(doctor.membershipId);

    await expectRejectedWithoutTrace(
      {
        clinicId: doctor.clinicId,
        doctorProfileId: doctor.doctorProfileId,
        specialty: doctor.specialtyName,
      },
      doctor.doctorProfileId,
      doctor.admin.accountId,
    );
  });

  test("CA-8: clinicId con formato UUID pero sin sede", async () => {
    const doctor = await createBookableDoctor("ca8");

    await expectRejectedWithoutTrace(
      {
        clinicId: randomUUID(),
        doctorProfileId: doctor.doctorProfileId,
        specialty: doctor.specialtyName,
      },
      doctor.doctorProfileId,
      doctor.admin.accountId,
    );
  });
});

test.describe("Ids que no son UUID", () => {
  test("CA-10: clinicId o doctorProfileId inválidos responden 400, no 500, y no crean nada", async () => {
    const doctor = await createBookableDoctor("ca10");
    const valid: BookingOverrides = {
      clinicId: doctor.clinicId,
      doctorProfileId: doctor.doctorProfileId,
      specialty: doctor.specialtyName,
    };

    for (const invalid of [
      { ...valid, clinicId: "abc" },
      { ...valid, doctorProfileId: "abc" },
    ]) {
      const documentNumber = newDocumentNumber();
      const response = await postAppointment(
        bookingBody(documentNumber, invalid),
      );

      expect(response.status()).toBe(400);
      expect(await countAppointments(doctor.doctorProfileId)).toBe(0);
      expect(await countPatients(documentNumber, doctor.admin.accountId)).toBe(
        0,
      );
    }
  });
});
