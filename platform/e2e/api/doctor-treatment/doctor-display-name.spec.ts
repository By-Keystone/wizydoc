import { createApiContext, createMemberWithRole } from "../../support/accounts";
import {
  addPortalDoctor,
  createManagedAppointment,
  createPortalScenario,
} from "../../support/appointment-portal";
import { getTestPrisma } from "../../support/db";
import { API_BASE_URL } from "../../support/env";
import {
  seedAppointmentNow,
  setDoctorTreatment,
} from "../../support/doctor-treatment";
import { expect, test } from "../../support/test";
import { signUpRaw, uniqueEmail } from "../../support/users";

// docs/features/perfil-usuario/plan.md — PR 1, CA-3 a CA-6, CA-13 y CA-14.

const PUBLIC_DOCTOR_KEYS = [
  "displayName",
  "doctorProfileId",
  "lastName",
  "name",
  "specialties",
];

interface PublicDoctor {
  doctorProfileId: string;
  displayName: string;
}

async function addDoctor(
  scenario: Awaited<ReturnType<typeof createPortalScenario>>,
  label: string,
  name: string,
  lastName: string,
) {
  return addPortalDoctor({
    label,
    clinicId: scenario.clinicId,
    admin: scenario.admin,
    specialtyId: scenario.specialtyId,
    name,
    lastName,
  });
}

async function listPublicDoctors(clinicId: string) {
  const anonymous = await createApiContext();
  const response = await anonymous.get(
    `${API_BASE_URL}/clinic/${clinicId}/doctors`,
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as PublicDoctor[];
}

test.describe("Nombre del médico en el api (tratamiento)", () => {
  test("CA-3: el listado público de médicos arma «Dra.», «Dr.» o el nombre solo según el tratamiento", async () => {
    const scenario = await createPortalScenario("treat-list");
    const dra = scenario.doctor;
    const dr = await addDoctor(scenario, "treat-list-dr", "Mateo", "Salas");
    const plain = await addDoctor(scenario, "treat-list-plain", "Rosa", "Vega");
    await setDoctorTreatment(dra.userId, "DRA");
    await setDoctorTreatment(dr.userId, "DR");

    const doctors = await listPublicDoctors(scenario.clinicId);

    const byProfile = new Map(
      doctors.map((doctor) => [doctor.doctorProfileId, doctor.displayName]),
    );
    expect(byProfile.get(dra.doctorProfileId)).toBe(
      `Dra. ${dra.name} ${dra.lastName}`,
    );
    expect(byProfile.get(dr.doctorProfileId)).toBe("Dr. Mateo Salas");
    expect(byProfile.get(plain.doctorProfileId)).toBe("Rosa Vega");
  });

  test("CA-4: una médica sin tratamiento con nombre femenino no recibe «Dr.» ni «Dra.»", async () => {
    const scenario = await createPortalScenario("treat-never-infer");
    const lucia = await addDoctor(
      scenario,
      "treat-never-infer-lucia",
      "Lucía",
      "Paredes Quispe",
    );

    const doctors = await listPublicDoctors(scenario.clinicId);

    const displayName = doctors.find(
      (doctor) => doctor.doctorProfileId === lucia.doctorProfileId,
    )?.displayName;
    expect(displayName).toBe("Lucía Paredes Quispe");
  });

  test("CA-5: el listado público no expone treatment, userId, correo, teléfono ni rol", async () => {
    const scenario = await createPortalScenario("treat-public-keys");
    await setDoctorTreatment(scenario.doctor.userId, "DRA");

    const doctors = (await listPublicDoctors(
      scenario.clinicId,
    )) as unknown as Record<string, unknown>[];

    expect(doctors.length).toBeGreaterThan(0);
    for (const doctor of doctors) {
      expect(Object.keys(doctor).sort()).toEqual(PUBLIC_DOCTOR_KEYS);
    }
  });

  test("CA-6: el registro con treatment «DR» en el cuerpo no deja tratamiento guardado", async () => {
    const context = await createApiContext();
    const email = uniqueEmail("treat-signup");

    await signUpRaw(context, {
      name: "Ana",
      lastName: "García",
      phone: "+51999888777",
      email,
      password: "Clave-Segura-2026",
      treatment: "DR",
    });

    const prisma = await getTestPrisma();
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) expect(user.treatment).toBeNull();
  });

  test("CA-13: la agenda de hoy de la sede trae doctor.displayName con tratamiento y sin él", async () => {
    const scenario = await createPortalScenario("treat-today");
    const plain = await addDoctor(
      scenario,
      "treat-today-plain",
      "Rosa",
      "Vega",
    );
    await setDoctorTreatment(scenario.doctor.userId, "DRA");
    for (const doctor of [scenario.doctor, plain]) {
      await seedAppointmentNow({
        accountId: scenario.admin.accountId,
        clinicId: scenario.clinicId,
        doctorProfileId: doctor.doctorProfileId,
      });
    }
    const reception = await createMemberWithRole({
      accountId: scenario.admin.accountId,
      resourceId: scenario.clinicId,
      role: "USER",
      createdBy: scenario.admin.userId,
      emailPrefix: "reception-treat-today",
    });

    const response = await reception.context.get(
      `${API_BASE_URL}/clinic/${scenario.clinicId}/appointments/today`,
    );

    expect(response.status()).toBe(200);
    const appointments = (await response.json()) as {
      doctor: { name: string; lastName: string; displayName: string };
    }[];
    expect(
      appointments.map((appointment) => appointment.doctor.displayName).sort(),
    ).toEqual(
      [
        `Dra. ${scenario.doctor.name} ${scenario.doctor.lastName}`,
        "Rosa Vega",
      ].sort(),
    );
  });

  test("CA-14: el historial de la ficha, en una cuenta de pago, nombra a la médica como «Dra. …»", async () => {
    const scenario = await createPortalScenario("treat-history");
    const prisma = await getTestPrisma();
    await prisma.subscription.update({
      where: { accountId: scenario.admin.accountId },
      data: { plan: "CONSULTORIO", status: "ACTIVE" },
    });
    await setDoctorTreatment(scenario.doctor.userId, "DRA");
    const managed = await createManagedAppointment(scenario);

    const response = await scenario.admin.context.get(
      `${API_BASE_URL}/patients/in/${scenario.clinicId}/${managed.patientId}`,
    );

    expect(response.status()).toBe(200);
    const {
      data: { history },
    } = (await response.json()) as {
      data: { history: { doctorName: string }[] };
    };
    expect(history.map((entry) => entry.doctorName)).toEqual([
      `Dra. ${scenario.doctor.name} ${scenario.doctor.lastName}`,
    ]);
  });
});
