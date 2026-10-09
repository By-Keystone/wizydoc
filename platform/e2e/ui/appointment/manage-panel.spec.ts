import { test, expect } from "../../support/test";
import { createMemberWithRole } from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import {
  bookAppointment,
  createManageClient,
  hoursFromNow,
  limaWall,
  openPanelAs,
  rescheduleBody,
  seedBookableDoctor,
  slotAfterHours,
  updateAppointment,
  type BookableDoctor,
} from "../../support/self-service";

// docs/features/autogestion-paciente/plan.md: CA-34, CA-35.

const HOURS_UNTIL_TODAY_APPOINTMENT = 2;

function isStillToday(hours: number): boolean {
  return limaWall(hoursFromNow(hours)).date === limaWall(new Date()).date;
}

async function upgradeToMetricsPlan(accountId: string): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.subscription.update({
    where: { accountId },
    data: { plan: "CLINICA", status: "ACTIVE" },
  });
}

async function patientIdOf(email: string): Promise<string> {
  const prisma = await getTestPrisma();
  const patient = await prisma.patient.findFirst({ where: { email } });
  if (!patient) throw new Error(`No existe la ficha de ${email}`);
  return patient.id;
}

async function memberFor(
  role: "ADMIN" | "DOCTOR" | "USER",
  seed: BookableDoctor,
) {
  if (role === "DOCTOR") return seed.doctor;
  return createMemberWithRole({
    accountId: seed.accountId,
    resourceId: seed.clinicId,
    role,
    createdBy: seed.admin.userId,
    emailPrefix: `${role.toLowerCase()}-panel`,
  });
}

for (const role of ["ADMIN", "DOCTOR", "USER"] as const) {
  test(`CA-34: ${role} ve la cita cancelada en la agenda y en la ficha, sin errores ni acciones nuevas`, async ({
    page,
  }) => {
    test.skip(
      !isStillToday(HOURS_UNTIL_TODAY_APPOINTMENT),
      "A esta hora de Lima la cita de prueba caería mañana y no saldría en la agenda de hoy",
    );
    const seed = await seedBookableDoctor(`ui-ca34-${role.toLowerCase()}`);
    await upgradeToMetricsPlan(seed.accountId);
    const booked = await bookAppointment(seed);
    await updateAppointment(booked.appointmentId, {
      scheduledAt: hoursFromNow(HOURS_UNTIL_TODAY_APPOINTMENT),
    });
    const manage = await createManageClient();
    expect((await manage.cancel(booked.token)).status()).toBe(200);
    const patientId = await patientIdOf(booked.patient.email);
    const member = await memberFor(role, seed);

    await openPanelAs(page, member, seed, "/dashboard");

    const agendaEntry = page
      .getByRole("listitem")
      .filter({ hasText: seed.specialtyName });
    await expect(agendaEntry).toHaveCount(1);
    await expect(
      agendaEntry.getByText("Cancelada", { exact: true }),
    ).toBeVisible();
    await expect(agendaEntry.getByRole("button")).toHaveCount(0);
    await expect(page.getByText(/tard[ií]a/i)).toHaveCount(0);

    await page.goto(
      `/account/${seed.accountId}/clinic/${seed.clinicId}/patients/${patientId}`,
    );
    const historyRow = page
      .getByRole("row")
      .filter({ hasText: seed.specialtyName });
    await expect(historyRow).toHaveCount(1);
    await expect(
      historyRow.getByText("Cancelada", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/tard[ií]a/i)).toHaveCount(0);
  });
}

test("CA-35: tras reprogramar, la agenda y la ficha muestran una sola cita, en la hora nueva", async ({
  page,
}) => {
  test.skip(
    slotAfterHours(HOURS_UNTIL_TODAY_APPOINTMENT).date !==
      limaWall(new Date()).date,
    "A esta hora de Lima la cita de prueba caería mañana y no saldría en la agenda de hoy",
  );
  const seed = await seedBookableDoctor("ui-ca35");
  await upgradeToMetricsPlan(seed.accountId);
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();
  const newSlot = slotAfterHours(HOURS_UNTIL_TODAY_APPOINTMENT);
  const response = await manage.reschedule(
    booked.token,
    rescheduleBody(newSlot),
  );
  expect(response.status()).toBe(200);
  const patientId = await patientIdOf(booked.patient.email);

  const clinicAdmin = await memberFor("ADMIN", seed);
  await openPanelAs(page, clinicAdmin, seed, "/dashboard");

  const agendaEntry = page
    .getByRole("listitem")
    .filter({ hasText: seed.specialtyName });
  await expect(agendaEntry).toHaveCount(1);
  await expect(
    agendaEntry.getByText(newSlot.time, { exact: true }),
  ).toBeVisible();
  await expect(agendaEntry.getByText("Cancelada")).toHaveCount(0);

  await page.goto(
    `/account/${seed.accountId}/clinic/${seed.clinicId}/patients/${patientId}`,
  );
  const historyRows = page
    .getByRole("row")
    .filter({ hasText: seed.specialtyName });
  await expect(historyRows).toHaveCount(1);
  await expect(historyRows.getByText(newSlot.time)).toBeVisible();
  await expect(page.getByText("Cancelada", { exact: true })).toHaveCount(0);
});
