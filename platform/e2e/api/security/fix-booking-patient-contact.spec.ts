import { randomUUID } from "node:crypto";
import { test, expect } from "../../support/test";
import { API_BASE_URL } from "../../support/env";
import {
  createApiContext,
  createClinicResource,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
} from "../../support/accounts";
import { seedFullDayAvailability } from "../../support/availability";
import { daysFromToday } from "../../support/dates";
import { getTestPrisma } from "../../support/db";
import { readLatestEmailTo } from "../../support/email";
import { invitePendingUser } from "../../support/invitations";
import { uniqueEmail, uniqueName } from "../../support/users";

const DOCUMENT_TYPE = "DNI";
const SLOT_DURATION_MINUTES = 30;
const BOOKING_DATE = daysFromToday(14);
const SPECIALTY_NAME = "Medicina general";

async function seedBookableDoctor(prefix: string) {
  const admin = await createOnboardedAdmin({ emailPrefix: `admin-${prefix}` });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName(`ORG-${prefix}`),
  );
  const clinicId = await createClinicResource(admin, organizationId, {
    name: uniqueName(`Sede ${prefix}`),
  });
  const specialtyName = uniqueName(SPECIALTY_NAME);
  const specialtyId = await createSpecialty(
    admin,
    organizationId,
    specialtyName,
  );
  const doctor = await invitePendingUser(admin, {
    resourceId: clinicId,
    role: "DOCTOR",
    emailPrefix: `doctor-${prefix}`,
    specialtyIds: [specialtyId],
  });

  const doctorProfileId = await seedFullDayAvailability(
    doctor.userId,
    clinicId,
  );

  return {
    accountId: admin.accountId,
    clinicId,
    doctorProfileId,
    specialtyName,
  };
}

function uniqueDocumentNumber(): string {
  return randomUUID().replace(/\D/g, "").padEnd(8, "0").slice(0, 8);
}

function bookingBody(
  seed: {
    clinicId: string;
    doctorProfileId: string;
    specialtyName: string;
  },
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    patientName: "Camila",
    patientLastName: "Rivas",
    patientPhone: "+51911111111",
    patientEmail: uniqueEmail("paciente"),
    patientDocumentType: DOCUMENT_TYPE,
    patientDocumentNumber: uniqueDocumentNumber(),
    patientBirthDate: "1990-05-20",
    specialty: seed.specialtyName,
    durationMinutes: SLOT_DURATION_MINUTES,
    scheduledAt: `${BOOKING_DATE}T09:00`,
    doctorProfileId: seed.doctorProfileId,
    clinicId: seed.clinicId,
    ...overrides,
  };
}

async function expectRejectedBooking(
  prefix: string,
  overrides: Record<string, unknown>,
) {
  const seed = await seedBookableDoctor(prefix);
  const api = await createApiContext();
  const prisma = await getTestPrisma();

  const documentNumber = uniqueDocumentNumber();
  const appointmentsBefore = await prisma.appointment.count({
    where: { doctorProfileId: seed.doctorProfileId },
  });

  const response = await api.post(`${API_BASE_URL}/appointment`, {
    data: bookingBody(seed, {
      patientDocumentNumber: documentNumber,
      ...overrides,
    }),
  });

  expect(response.status()).toBe(400);
  expect(
    await prisma.patient.count({
      where: {
        accountId: seed.accountId,
        documentType: DOCUMENT_TYPE,
        documentNumber,
      },
    }),
  ).toBe(0);
  expect(
    await prisma.appointment.count({
      where: { doctorProfileId: seed.doctorProfileId },
    }),
  ).toBe(appointmentsBefore);
}

test.describe("Reservar con un documento que ya tiene ficha", () => {
  test("CA-1, CA-2 y CA-4 a CA-8: la segunda reserva no modifica la ficha ni escribe al correo nuevo", async () => {
    const seed = await seedBookableDoctor("ca4");
    const api = await createApiContext();
    const prisma = await getTestPrisma();

    const documentNumber = uniqueDocumentNumber();
    const originalEmail = uniqueEmail("correo-original");
    const originalPhone = "+51911111111";
    const newEmail = uniqueEmail("correo-nuevo");
    const patientWhere = {
      accountId: seed.accountId,
      documentType: DOCUMENT_TYPE,
      documentNumber,
    };

    const firstResponse = await api.post(`${API_BASE_URL}/appointment`, {
      data: bookingBody(seed, {
        patientDocumentNumber: documentNumber,
        patientEmail: originalEmail,
        patientPhone: originalPhone,
        scheduledAt: `${BOOKING_DATE}T09:00`,
      }),
    });
    expect(firstResponse.status()).toBe(200);
    expect(await firstResponse.json()).toEqual({
      message: "Cita creada con éxito",
    });

    const createdPatient = await prisma.patient.findFirst({
      where: patientWhere,
    });
    expect(createdPatient).toMatchObject({
      name: "Camila",
      lastName: "Rivas",
      email: originalEmail,
      phone: originalPhone,
      birthDate: "1990-05-20",
    });
    await expect.poll(() => readLatestEmailTo(originalEmail)).toBeDefined();

    const beforeSecondRequest = Date.now();
    const secondResponse = await api.post(`${API_BASE_URL}/appointment`, {
      data: bookingBody(seed, {
        patientDocumentNumber: documentNumber,
        patientName: "Otro",
        patientLastName: "Nombre",
        patientBirthDate: "1985-01-01",
        patientEmail: newEmail,
        patientPhone: "+51922222222",
        scheduledAt: `${BOOKING_DATE}T10:00`,
      }),
    });
    expect(secondResponse.status()).toBe(200);
    expect(await secondResponse.json()).toEqual(await firstResponse.json());

    const patient = await prisma.patient.findFirst({ where: patientWhere });
    expect(patient).toMatchObject({
      name: "Camila",
      lastName: "Rivas",
      email: originalEmail,
      phone: originalPhone,
      birthDate: "1990-05-20",
    });
    if (!patient) throw new Error("No se encontró la ficha del paciente");
    expect(await prisma.patient.count({ where: patientWhere })).toBe(1);
    expect(
      await prisma.appointment.count({ where: { patientId: patient.id } }),
    ).toBe(2);

    await expect
      .poll(() => {
        const sentAt = readLatestEmailTo(originalEmail)?.sentAt;
        return sentAt
          ? new Date(sentAt).getTime() >= beforeSecondRequest
          : false;
      })
      .toBe(true);
    expect(readLatestEmailTo(newEmail)).toBeUndefined();
  });
});

test.describe("Formato del correo", () => {
  test("CA-10: un correo inválido responde 400 sin crear ficha ni cita", async () => {
    await expectRejectedBooking("ca10", {
      patientEmail: "no-es-un-correo",
    });
  });
});

test.describe("Una reserva fallida no deja ficha", () => {
  test("CA-12 y CA-13: un horario ocupado responde 409 sin ficha, sin cita extra y sin correo", async () => {
    const seed = await seedBookableDoctor("ca12");
    const api = await createApiContext();
    const prisma = await getTestPrisma();

    const firstResponse = await api.post(`${API_BASE_URL}/appointment`, {
      data: bookingBody(seed, { scheduledAt: `${BOOKING_DATE}T09:00` }),
    });
    expect(firstResponse.status()).toBe(200);

    const documentNumber = uniqueDocumentNumber();
    const secondEmail = uniqueEmail("segundo");
    const response = await api.post(`${API_BASE_URL}/appointment`, {
      data: bookingBody(seed, {
        patientDocumentNumber: documentNumber,
        patientEmail: secondEmail,
        scheduledAt: `${BOOKING_DATE}T09:00`,
      }),
    });

    expect(response.status()).toBe(409);
    expect(await response.json()).toMatchObject({
      message: "Ese horario ya no está disponible. Vuelve atrás y elige otro.",
    });
    expect(
      await prisma.patient.count({
        where: {
          accountId: seed.accountId,
          documentType: DOCUMENT_TYPE,
          documentNumber,
        },
      }),
    ).toBe(0);
    expect(
      await prisma.appointment.count({
        where: { doctorProfileId: seed.doctorProfileId },
      }),
    ).toBe(1);
    expect(readLatestEmailTo(secondEmail)).toBeUndefined();
  });

  for (const scheduledAt of ["2026-99-99T00:00", "2030-02-30T09:00"]) {
    test(`CA-15: scheduledAt ${scheduledAt} responde 400 sin ficha ni cita`, async () => {
      await expectRejectedBooking("ca15", { scheduledAt });
    });
  }

  for (const durationMinutes of [1.5, 0, SLOT_DURATION_MINUTES + 1]) {
    test(`CA-17: durationMinutes ${durationMinutes} responde 400 sin ficha ni cita`, async () => {
      await expectRejectedBooking("ca17", { durationMinutes });
    });
  }
});
