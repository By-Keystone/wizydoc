import { test, expect } from "../../support/test";
import {
  appointmentRow,
  bookAppointment,
  createManageClient,
  hoursFromNow,
  newPatient,
  seedBookableDoctor,
  updateAppointment,
  whenText,
} from "../../support/self-service";
import { completeWizard } from "../../support/self-service-ui";

// docs/features/autogestion-paciente/plan.md: CA-12, CA-13, CA-14, CA-16 (navegador).

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const MINUTES_BEFORE_START = 3;

test.use({ viewport: MOBILE_VIEWPORT });

test("CA-12: Cancelar cita pide confirmación, Volver no cancela y Sí, cancelar deja la cita cancelada", async ({
  page,
}) => {
  const seed = await seedBookableDoctor("ui-ca12");
  const booked = await bookAppointment(seed);

  await page.goto(booked.manageLink);
  await page.getByRole("button", { name: "Cancelar cita" }).click();

  await expect(
    page.getByRole("heading", { name: "¿Cancelar tu cita?" }),
  ).toBeVisible();
  await expect(
    page.getByText(whenText(booked.date, booked.time)),
  ).toBeVisible();

  await page.getByRole("button", { name: "Volver" }).click();
  await expect(
    page.getByRole("heading", { name: `Hola, ${booked.patient.name}` }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("Pendiente", { exact: true })).toBeVisible();
  expect((await appointmentRow(booked.appointmentId)).status).toBe("PENDING");

  await page.getByRole("button", { name: "Cancelar cita" }).click();
  await page.getByRole("button", { name: "Sí, cancelar" }).click();

  await expect(
    page.getByRole("heading", { name: "Tu cita está cancelada" }),
  ).toBeVisible();
  await expect(
    page.getByText("El horario quedó libre para otro paciente."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Reservar otro horario" }),
  ).toBeVisible();
  expect((await appointmentRow(booked.appointmentId)).status).toBe("CANCELLED");
});

test("CA-13: cancelar a minutos de la cita muestra la misma pantalla, sin aviso de cancelación tardía", async ({
  page,
}) => {
  const seed = await seedBookableDoctor("ui-ca13");
  const booked = await bookAppointment(seed);
  await updateAppointment(booked.appointmentId, {
    scheduledAt: hoursFromNow(MINUTES_BEFORE_START / 60),
  });

  await page.goto(booked.manageLink);
  await page.getByRole("button", { name: "Cancelar cita" }).click();
  await page.getByRole("button", { name: "Sí, cancelar" }).click();

  await expect(
    page.getByRole("heading", { name: "Tu cita está cancelada" }),
  ).toBeVisible();
  await expect(
    page.getByText("El horario quedó libre para otro paciente."),
  ).toBeVisible();
  await expect(page.getByText(/tard[ií]a|tarde/i)).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Tu cita está cancelada" }),
  ).toBeVisible();
  await expect(page.getByText(/tard[ií]a|tarde/i)).toHaveCount(0);
});

test("CA-14: reabrir el enlace de una cita cancelada muestra Reservar otro horario, que lleva al booking de la sede", async ({
  page,
}) => {
  const seed = await seedBookableDoctor("ui-ca14");
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();
  await manage.cancel(booked.token);

  await page.goto(booked.manageLink);

  await expect(
    page.getByRole("heading", { name: "Tu cita está cancelada" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Reprogramar" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Cancelar cita" })).toHaveCount(
    0,
  );

  await page.getByRole("link", { name: "Reservar otro horario" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/clinic/${seed.clinicId}/create-appointment$`),
  );
  await expect(
    page.getByRole("heading", { name: "¿Qué especialidad necesitas?" }),
  ).toBeVisible();
});

test("CA-16: tras cancelar, otro paciente reserva ese horario completando el wizard", async ({
  page,
}) => {
  const seed = await seedBookableDoctor("ui-ca16");
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();
  await manage.cancel(booked.token);

  const otherPatient = newPatient();
  await completeWizard(page, seed, otherPatient, {
    date: booked.date,
    time: booked.time,
  });

  await expect(page.getByText("¡Cita reservada!")).toBeVisible();
  await expect(page.getByText("Ese horario ya no está disponible")).toHaveCount(
    0,
  );
});
