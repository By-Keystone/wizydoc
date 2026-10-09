import { test, expect } from "../../support/test";
import {
  appointmentRow,
  bookAppointment,
  createManageClient,
  expectNoSlot,
  fetchSlots,
  hoursFromNow,
  limaWall,
  newPatient,
  openDayInPicker,
  pickSlotInPicker,
  postBooking,
  rescheduleBody,
  seedBookableDoctor,
  slotAfterHours,
  updateAppointment,
  whenText,
} from "../../support/self-service";

// docs/features/autogestion-paciente/plan.md: CA-18 a CA-22, CA-24, CA-25 (navegador).

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const DEADLINE_TEXT =
  "Ya no se puede reprogramar porque faltan menos de 12 horas para tu cita. Si no puedes asistir, cancélala y reserva otro horario.";
const LIMIT_TEXT =
  "Ya reprogramaste esta cita 3 veces. Si necesitas otro horario, cancélala y reserva de nuevo.";

test.use({ viewport: MOBILE_VIEWPORT });

test("CA-18, CA-19: el selector muestra los huecos reales, se confirma el cambio y el enlace sigue abriendo la cita con la hora nueva", async ({
  page,
}) => {
  const seed = await seedBookableDoctor("ui-ca18");
  const booked = await bookAppointment(seed, { time: "10:00" });
  const occupied = await postBooking(seed, newPatient(), {
    date: booked.date,
    time: "11:00",
  });
  expect(occupied.status()).toBe(200);

  await page.goto(booked.manageLink);
  await page.getByRole("button", { name: "Reprogramar" }).click();

  await expect(
    page.getByText(`Tu cita actual: ${whenText(booked.date, "10:00")}`),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Elige fecha y horario" }),
  ).toBeVisible();
  await openDayInPicker(page, booked.date);
  await expect(
    page.getByRole("button", { name: "10:30", exact: true }),
  ).toBeVisible();
  await expectNoSlot(page, "10:00");
  await expectNoSlot(page, "11:00");

  await page.getByRole("button", { name: "10:30", exact: true }).click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "¿Cambiar tu cita a este horario?" }),
  ).toBeVisible();
  const before = page.getByText(whenText(booked.date, "10:00"));
  await expect(before).toBeVisible();
  await expect(before).toHaveCSS("text-decoration-line", "line-through");
  await expect(page.getByText(whenText(booked.date, "10:30"))).toBeVisible();

  await page.getByRole("button", { name: "Elegir otro" }).click();
  await expect(
    page.getByRole("heading", { name: "Elige fecha y horario" }),
  ).toBeVisible();

  await pickSlotInPicker(page, booked.date, "10:30");
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar cambio" }).click();

  await expect(
    page.getByRole("heading", { name: "Listo, tu cita cambió" }),
  ).toBeVisible();
  await expect(page.getByText(whenText(booked.date, "10:30"))).toBeVisible();

  const slots = await fetchSlots(seed.doctorProfileId, booked.date);
  expect(slots).toContain("10:00");
  expect(slots).not.toContain("10:30");

  await page.goto(booked.manageLink);
  await expect(page.getByText(whenText(booked.date, "10:30"))).toBeVisible();
  await expect(page.getByText(whenText(booked.date, "10:00"))).toHaveCount(0);
});

test("CA-20: el horario nuevo puede estar a menos de 12 horas", async ({
  page,
}) => {
  const seed = await seedBookableDoctor("ui-ca20");
  const booked = await bookAppointment(seed);
  const soon = slotAfterHours(3);

  await page.goto(booked.manageLink);
  await page.getByRole("button", { name: "Reprogramar" }).click();
  await pickSlotInPicker(page, soon.date, soon.time);
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar cambio" }).click();

  await expect(
    page.getByRole("heading", { name: "Listo, tu cita cambió" }),
  ).toBeVisible();
  await expect(page.getByText(whenText(soon.date, soon.time))).toBeVisible();
});

test("CA-21: a menos de 12 horas Reprogramar está deshabilitado con el motivo visible y Cancelar cita sigue activo", async ({
  page,
}) => {
  const seed = await seedBookableDoctor("ui-ca21");
  const booked = await bookAppointment(seed);
  await updateAppointment(booked.appointmentId, {
    scheduledAt: hoursFromNow(6),
  });

  await page.goto(booked.manageLink);

  await expect(
    page.getByRole("button", { name: "Reprogramar" }),
  ).toBeDisabled();
  await expect(page.getByText(DEADLINE_TEXT)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancelar cita" }),
  ).toBeEnabled();
});

test("CA-22: tras 3 reprogramaciones, Reprogramar está deshabilitado con el motivo visible y Cancelar cita sigue activo", async ({
  page,
}) => {
  const seed = await seedBookableDoctor("ui-ca22");
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();
  for (const time of ["11:00", "11:30", "12:00"]) {
    const response = await manage.reschedule(
      booked.token,
      rescheduleBody({ date: booked.date, time }),
    );
    expect(response.status()).toBe(200);
  }

  await page.goto(booked.manageLink);

  await expect(
    page.getByRole("button", { name: "Reprogramar" }),
  ).toBeDisabled();
  await expect(page.getByText(LIMIT_TEXT)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancelar cita" }),
  ).toBeEnabled();
});

test("CA-24: si otro paciente toma el horario mientras se elige, al confirmar vuelve al selector con el aviso y la cita conserva su hora", async ({
  page,
}) => {
  const seed = await seedBookableDoctor("ui-ca24");
  const booked = await bookAppointment(seed, { time: "10:00" });

  await page.goto(booked.manageLink);
  await page.getByRole("button", { name: "Reprogramar" }).click();
  await pickSlotInPicker(page, booked.date, "11:00");
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "¿Cambiar tu cita a este horario?" }),
  ).toBeVisible();

  const stolen = await postBooking(seed, newPatient(), {
    date: booked.date,
    time: "11:00",
  });
  expect(stolen.status()).toBe(200);

  await page.getByRole("button", { name: "Confirmar cambio" }).click();

  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Otro paciente acaba de tomar ese horario" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Elige fecha y horario" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "10:30", exact: true }),
  ).toBeVisible();
  await expectNoSlot(page, "11:00");

  const row = await appointmentRow(booked.appointmentId);
  expect(limaWall(row.scheduledAt)).toEqual({
    date: booked.date,
    time: "10:00",
  });
  expect(row.rescheduleCount).toBe(0);
});

test("CA-25: si la cita cambia desde otra pestaña mientras se elige, al confirmar se ve que cambió y Recargar muestra cómo quedó", async ({
  page,
}) => {
  const seed = await seedBookableDoctor("ui-ca25");
  const booked = await bookAppointment(seed, { time: "10:00" });

  await page.goto(booked.manageLink);
  await page.getByRole("button", { name: "Reprogramar" }).click();
  await pickSlotInPicker(page, booked.date, "12:00");
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "¿Cambiar tu cita a este horario?" }),
  ).toBeVisible();

  const manage = await createManageClient();
  const elsewhere = await manage.reschedule(
    booked.token,
    rescheduleBody({ date: booked.date, time: "13:00" }),
  );
  expect(elsewhere.status()).toBe(200);

  await page.getByRole("button", { name: "Confirmar cambio" }).click();

  await expect(
    page.getByRole("heading", { name: "Tu cita cambió mientras elegías" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Recargar" }).click();
  await expect(
    page.getByRole("heading", { name: `Hola, ${booked.patient.name}` }),
  ).toBeVisible();
});

test("CA-25 (variante): si la cita se cancela desde otra pestaña mientras se elige, al confirmar la página muestra cómo quedó", async ({
  page,
}) => {
  const seed = await seedBookableDoctor("ui-ca25c");
  const booked = await bookAppointment(seed, { time: "10:00" });

  await page.goto(booked.manageLink);
  await page.getByRole("button", { name: "Reprogramar" }).click();
  await pickSlotInPicker(page, booked.date, "12:00");
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  const manage = await createManageClient();
  expect((await manage.cancel(booked.token)).status()).toBe(200);

  await page.getByRole("button", { name: "Confirmar cambio" }).click();

  await expect(
    page.getByRole("heading", { name: "Tu cita está cancelada" }),
  ).toBeVisible();
  const row = await appointmentRow(booked.appointmentId);
  expect(row.status).toBe("CANCELLED");
});
