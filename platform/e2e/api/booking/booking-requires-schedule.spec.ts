import { createApiContext, createSpecialty } from "../../support/accounts";
import {
  addPortalDoctor,
  createManagedAppointment,
  createPortalScenario,
  removeAvailability,
} from "../../support/appointment-portal";
import { seedFullDayAvailability } from "../../support/availability";
import { getTestPrisma } from "../../support/db";
import { API_BASE_URL } from "../../support/env";
import { expect, test } from "../../support/test";
import { uniqueName } from "../../support/users";

// docs/features/doctor-profile-specialties/plan.md, PR 2: CA-5 a CA-9 (CA-10 son las cinco pruebas con horarios sembrados).

interface PublicDoctor {
  doctorProfileId: string;
  specialties: { id: string; name: string }[];
}

async function listDoctors(clinicId: string): Promise<PublicDoctor[]> {
  const anonymous = await createApiContext();
  const response = await anonymous.get(
    `${API_BASE_URL}/clinic/${clinicId}/doctors`,
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as PublicDoctor[];
}

async function listedProfileIds(clinicId: string): Promise<string[]> {
  return (await listDoctors(clinicId)).map((d) => d.doctorProfileId);
}

test("CA-5: un médico sin horarios no aparece en el booking y aparece al sembrarle uno", async () => {
  const scenario = await createPortalScenario("sched-ca5");
  const unscheduled = await addPortalDoctor({
    label: "sched-ca5-sin",
    clinicId: scenario.clinicId,
    admin: scenario.admin,
    specialtyId: scenario.specialtyId,
    availability: "none",
  });

  const before = await listedProfileIds(scenario.clinicId);
  expect(before).toContain(scenario.doctor.doctorProfileId);
  expect(before).not.toContain(unscheduled.doctorProfileId);

  await seedFullDayAvailability(unscheduled.userId, scenario.clinicId);

  expect(await listedProfileIds(scenario.clinicId)).toContain(
    unscheduled.doctorProfileId,
  );
});

test("CA-6: la especialidad que solo atiende un médico sin horarios no se ofrece; la compartida sí", async () => {
  const scenario = await createPortalScenario("sched-ca6");
  const onlyUnscheduledId = await createSpecialty(
    scenario.admin,
    scenario.organizationId,
    uniqueName("Solo-sin-horarios"),
  );
  const unscheduled = await addPortalDoctor({
    label: "sched-ca6-sin",
    clinicId: scenario.clinicId,
    admin: scenario.admin,
    specialtyId: scenario.specialtyId,
    availability: "none",
  });
  const prisma = await getTestPrisma();
  await prisma.doctorProfile.update({
    where: { id: unscheduled.doctorProfileId },
    data: { specialties: { connect: [{ id: onlyUnscheduledId }] } },
  });

  const doctors = await listDoctors(scenario.clinicId);

  const offered = doctors.flatMap((d) => d.specialties.map((s) => s.id));
  expect(offered).not.toContain(onlyUnscheduledId);
  expect(offered).toContain(scenario.specialtyId);
});

test("CA-7: al borrarle los horarios, el médico sale del booking y su cita futura no cambia", async () => {
  const scenario = await createPortalScenario("sched-ca7");
  const appointment = await createManagedAppointment(scenario);
  const prisma = await getTestPrisma();
  const before = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointment.appointmentId },
  });
  expect(await listedProfileIds(scenario.clinicId)).toContain(
    scenario.doctor.doctorProfileId,
  );

  await removeAvailability(scenario.doctor.doctorProfileId);

  expect(await listedProfileIds(scenario.clinicId)).not.toContain(
    scenario.doctor.doctorProfileId,
  );
  const after = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointment.appointmentId },
  });
  expect(after.scheduledAt).toEqual(before.scheduledAt);
  expect(after.doctorProfileId).toBe(before.doctorProfileId);
  expect(after.specialty).toBe(before.specialty);
  expect(after.status).toBe(before.status);
});

test("CA-8: el ADMIN de la organización con perfil, especialidad y horarios no aparece", async () => {
  const scenario = await createPortalScenario("sched-ca8");
  const prisma = await getTestPrisma();
  const adminProfile = await prisma.doctorProfile.create({
    data: {
      userId: scenario.admin.userId,
      clinicId: scenario.clinicId,
      specialties: { connect: [{ id: scenario.specialtyId }] },
    },
  });
  await seedFullDayAvailability(scenario.admin.userId, scenario.clinicId);

  const ids = await listedProfileIds(scenario.clinicId);

  expect(ids).toContain(scenario.doctor.doctorProfileId);
  expect(ids).not.toContain(adminProfile.id);
});

test("CA-9: la respuesta pública conserva sus claves y no trae userId", async () => {
  const scenario = await createPortalScenario("sched-ca9");

  const doctors = (await listDoctors(scenario.clinicId)) as unknown as Record<
    string,
    unknown
  >[];

  expect(doctors.length).toBeGreaterThan(0);
  for (const doctor of doctors) {
    expect(Object.keys(doctor).sort()).toEqual([
      "displayName",
      "doctorProfileId",
      "lastName",
      "name",
      "specialties",
    ]);
  }
});
