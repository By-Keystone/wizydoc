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
import { addDays, daysFromToday } from "../../support/dates";
import { getTestPrisma } from "../../support/db";
import { invitePendingUser } from "../../support/invitations";
import { uniqueEmail, uniqueName } from "../../support/users";

const SLOT_UNAVAILABLE =
  "Ese horario ya no está disponible. Vuelve atrás y elige otro.";
const MONDAY = 1;
const DAYS_AHEAD = 14;

function nextMondayDate(): string {
  let date = daysFromToday(DAYS_AHEAD);
  while (new Date(date).getUTCDay() !== MONDAY) date = addDays(date, 1);
  return date;
}

const MAX_DAYS_AHEAD = 366;
const DOMAIN_LABEL = "a".repeat(63);
const LONG_VALID_EMAIL = `x@${DOMAIN_LABEL}.${DOMAIN_LABEL}.${DOMAIN_LABEL}.${DOMAIN_LABEL}.com`;

function farthestAllowedMonday(): string {
  let date = daysFromToday(MAX_DAYS_AHEAD);
  while (new Date(date).getUTCDay() !== MONDAY) date = addDays(date, -1);
  return date;
}

const MONDAY_DATE = nextMondayDate();
const TUESDAY_DATE = addDays(MONDAY_DATE, 1);

interface Seed {
  accountId: string;
  clinicId: string;
  doctorProfileId: string;
  specialtyName: string;
}

async function seedDoctor(
  prefix: string,
  options: { withMondayAvailability: boolean } = {
    withMondayAvailability: true,
  },
): Promise<Seed> {
  const admin = await createOnboardedAdmin({ emailPrefix: `admin-${prefix}` });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName(`ORG-${prefix}`),
  );
  const clinicId = await createClinicResource(admin, organizationId, {
    name: uniqueName(`Sede ${prefix}`),
  });
  const specialtyName = uniqueName("Medicina general");
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

  const prisma = await getTestPrisma();
  const doctorProfile = await prisma.doctorProfile.findFirst({
    where: { userId: doctor.userId, clinicId },
  });
  if (!doctorProfile) throw new Error("No se encontró el perfil del médico");

  if (options.withMondayAvailability) {
    await prisma.availability.createMany({
      data: [
        {
          doctorProfileId: doctorProfile.id,
          dayOfWeek: MONDAY,
          startTime: "09:00",
          endTime: "12:00",
        },
      ],
    });
  }

  return {
    accountId: admin.accountId,
    clinicId,
    doctorProfileId: doctorProfile.id,
    specialtyName,
  };
}

function uniqueDocumentNumber(): string {
  return randomUUID().replace(/\D/g, "").padEnd(8, "0").slice(0, 8);
}

function bookingBody(seed: Seed, overrides: Record<string, unknown> = {}) {
  return {
    patientName: "Camila",
    patientLastName: "Rivas",
    patientPhone: "+51911111111",
    patientEmail: uniqueEmail("paciente"),
    patientDocumentType: "DNI",
    patientDocumentNumber: uniqueDocumentNumber(),
    patientBirthDate: "1990-05-20",
    specialty: seed.specialtyName,
    durationMinutes: 30,
    scheduledAt: `${MONDAY_DATE}T09:00`,
    doctorProfileId: seed.doctorProfileId,
    clinicId: seed.clinicId,
    ...overrides,
  };
}

async function postBooking(body: Record<string, unknown>) {
  const api = await createApiContext();
  return api.post(`${API_BASE_URL}/appointment`, { data: body });
}

async function countAppointments(seed: Seed): Promise<number> {
  const prisma = await getTestPrisma();
  return prisma.appointment.count({
    where: { doctorProfileId: seed.doctorProfileId },
  });
}

async function findPatient(seed: Seed, documentNumber?: string) {
  const prisma = await getTestPrisma();
  const patient = await prisma.patient.findFirst({
    where: { accountId: seed.accountId, documentNumber },
  });
  if (!patient) throw new Error("No se encontró la ficha del paciente");
  return patient;
}

async function countPatients(seed: Seed): Promise<number> {
  const prisma = await getTestPrisma();
  return prisma.patient.count({ where: { accountId: seed.accountId } });
}

async function expectRejectedSchedule(seed: Seed, scheduledAt: string) {
  const response = await postBooking(bookingBody(seed, { scheduledAt }));

  expect(response.status()).toBe(409);
  expect(await response.json()).toEqual({ message: SLOT_UNAVAILABLE });
  expect(await countAppointments(seed)).toBe(0);
  expect(await countPatients(seed)).toBe(0);
}

async function expectRejectedBody(
  prefix: string,
  overrides: Record<string, unknown>,
) {
  const seed = await seedDoctor(prefix);
  const response = await postBooking(bookingBody(seed, overrides));

  expect(response.status()).toBe(400);
  const { message } = (await response.json()) as { message: string };
  expect(message).not.toMatch(/^body\//);
  expect(await countAppointments(seed)).toBe(0);
  expect(await countPatients(seed)).toBe(0);
}

test.describe("Horario", () => {
  test("un hueco ofrecido por el booking crea la cita", async () => {
    const seed = await seedDoctor("slot-ok");

    const response = await postBooking(bookingBody(seed));

    expect(response.status()).toBe(200);
    expect(await countAppointments(seed)).toBe(1);
    expect(await countPatients(seed)).toBe(1);
  });

  test("el último hueco de la franja (11:30) es válido", async () => {
    const seed = await seedDoctor("slot-last");

    const response = await postBooking(
      bookingBody(seed, { scheduledAt: `${MONDAY_DATE}T11:30` }),
    );

    expect(response.status()).toBe(200);
  });

  const rejectedSchedules: Array<[string, () => string]> = [
    ["fuera de la franja (15:00)", () => `${MONDAY_DATE}T15:00`],
    ["hueco que se sale de la franja (12:00)", () => `${MONDAY_DATE}T12:00`],
    ["fuera de la rejilla (09:15)", () => `${MONDAY_DATE}T09:15`],
    ["día sin atención", () => `${TUESDAY_DATE}T10:00`],
    ["fecha pasada", () => "2020-01-06T10:00"],
  ];

  for (const [label, scheduledAt] of rejectedSchedules) {
    test(`${label} responde 409 sin ficha ni cita`, async () => {
      const seed = await seedDoctor("slot-bad");

      await expectRejectedSchedule(seed, scheduledAt());
    });
  }

  test("el lunes más lejano dentro de 366 días es válido", async () => {
    const seed = await seedDoctor("slot-far");

    const response = await postBooking(
      bookingBody(seed, { scheduledAt: `${farthestAllowedMonday()}T09:00` }),
    );

    expect(response.status()).toBe(200);
  });

  test("el lunes siguiente al límite de 366 días responde 409", async () => {
    const seed = await seedDoctor("slot-beyond");

    await expectRejectedSchedule(
      seed,
      `${addDays(farthestAllowedMonday(), 7)}T09:00`,
    );
  });

  test("una fecha del año 9999 responde 409 sin ficha ni cita", async () => {
    const seed = await seedDoctor("slot-9999");

    await expectRejectedSchedule(seed, "9999-12-27T09:00");
  });

  test("un médico de otra sede responde 404 aunque la hora también sea inválida", async () => {
    const own = await seedDoctor("slot-foreign-own");
    const foreign = await seedDoctor("slot-foreign-other");

    const response = await postBooking(
      bookingBody(own, {
        doctorProfileId: foreign.doctorProfileId,
        scheduledAt: "2020-01-06T10:00",
      }),
    );

    expect(response.status()).toBe(404);
    expect(await countAppointments(foreign)).toBe(0);
    expect(await countPatients(own)).toBe(0);
  });

  test("médico sin ninguna disponibilidad responde 409", async () => {
    const seed = await seedDoctor("slot-none", {
      withMondayAvailability: false,
    });

    await expectRejectedSchedule(seed, `${MONDAY_DATE}T09:00`);
  });

  test("hueco ocupado responde 409 sin ficha nueva ni cita extra", async () => {
    const seed = await seedDoctor("slot-taken");
    expect((await postBooking(bookingBody(seed))).status()).toBe(200);

    const response = await postBooking(bookingBody(seed));

    expect(response.status()).toBe(409);
    expect(await response.json()).toEqual({ message: SLOT_UNAVAILABLE });
    expect(await countAppointments(seed)).toBe(1);
    expect(await countPatients(seed)).toBe(1);
  });
});

test.describe("Documento", () => {
  for (const documentType of ["dni", "RUC"]) {
    test(`tipo ${documentType} responde 400`, async () => {
      await expectRejectedBody("doc-type", {
        patientDocumentType: documentType,
      });
    });
  }

  test("el número con espacios y guiones se guarda normalizado y no duplica la ficha", async () => {
    const seed = await seedDoctor("doc-norm");
    const prisma = await getTestPrisma();

    const first = await postBooking(
      bookingBody(seed, { patientDocumentNumber: " 4567 - 8912 " }),
    );
    const second = await postBooking(
      bookingBody(seed, {
        patientDocumentNumber: "45678912",
        scheduledAt: `${MONDAY_DATE}T09:30`,
      }),
    );

    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    expect(await countPatients(seed)).toBe(1);
    const patient = await findPatient(seed, "45678912");
    expect(
      await prisma.appointment.count({ where: { patientId: patient.id } }),
    ).toBe(2);
  });

  test("un pasaporte con minúsculas, guion y punto se guarda en mayúsculas", async () => {
    const seed = await seedDoctor("doc-passport");

    const first = await postBooking(
      bookingBody(seed, {
        patientDocumentType: "PASSPORT",
        patientDocumentNumber: "ab-123.456",
      }),
    );
    const second = await postBooking(
      bookingBody(seed, {
        patientDocumentType: "PASSPORT",
        patientDocumentNumber: "AB123456",
        scheduledAt: `${MONDAY_DATE}T09:30`,
      }),
    );

    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    expect(await countPatients(seed)).toBe(1);
    await findPatient(seed, "AB123456");
  });

  test("un número de 20 caracteres es válido", async () => {
    const seed = await seedDoctor("doc-max");

    const response = await postBooking(
      bookingBody(seed, { patientDocumentNumber: "A".repeat(20) }),
    );

    expect(response.status()).toBe(200);
  });

  test("un número de 21 caracteres responde 400", async () => {
    await expectRejectedBody("doc-long", {
      patientDocumentNumber: "A".repeat(21),
    });
  });

  test("un número vacío tras normalizar responde 400", async () => {
    await expectRejectedBody("doc-empty", { patientDocumentNumber: " - . " });
  });
});

test.describe("Teléfono", () => {
  const normalizedPhones: Array<[string, string]> = [
    ["+51 987-654-321", "+51987654321"],
    ["+51 (987) 654 321", "+51987654321"],
    ["+1 202 555 0143", "+12025550143"],
    ["+34 612 345 678", "+34612345678"],
  ];

  for (const [typed, stored] of normalizedPhones) {
    test(`"${typed}" se guarda como ${stored}`, async () => {
      const seed = await seedDoctor("phone-ok");

      const response = await postBooking(
        bookingBody(seed, { patientPhone: typed }),
      );

      expect(response.status()).toBe(200);
      const patient = await findPatient(seed);
      expect(patient.phone).toBe(stored);
    });
  }

  for (const phone of ["987654321", "12345", "+12345", "+1234567890123456"]) {
    test(`"${phone}" responde 400 con un mensaje legible`, async () => {
      await expectRejectedBody("phone-bad", { patientPhone: phone });
    });
  }
});

test.describe("Nombres y correo", () => {
  test("los espacios sobrantes se recortan al guardar", async () => {
    const seed = await seedDoctor("name-trim");

    const response = await postBooking(
      bookingBody(seed, {
        patientName: "  Camila   Andrea ",
        patientLastName: " de   la  Cruz ",
      }),
    );

    expect(response.status()).toBe(200);
    const patient = await findPatient(seed);
    expect(patient.name).toBe("Camila Andrea");
    expect(patient.lastName).toBe("de la Cruz");
  });

  test("un nombre de 80 caracteres es válido", async () => {
    const seed = await seedDoctor("name-max");

    const response = await postBooking(
      bookingBody(seed, { patientName: "a".repeat(80) }),
    );

    expect(response.status()).toBe(200);
  });

  for (const [field, value] of [
    ["patientName", "a".repeat(81)],
    ["patientLastName", "a".repeat(81)],
    ["patientName", "   "],
    ["patientLastName", ""],
    ["patientEmail", LONG_VALID_EMAIL],
  ]) {
    test(`${field} de ${value.length} caracteres responde 400`, async () => {
      await expectRejectedBody("name-bad", { [field]: value });
    });
  }
});
