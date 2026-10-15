import type { Page } from "@playwright/test";
import { test, expect } from "../../support/test";
import {
  createManagedAppointment,
  createPortalClient,
  createPortalScenario,
  limaWallTime,
  limaWallTimeInDays,
  limaWallTimeInHours,
  postBooking,
  readAppointment,
  removeAvailability,
  updateAppointment,
  type PortalScenario,
} from "../../support/appointment-portal";
import {
  addDays,
  startOfWeek,
  todayKey,
} from "../../../src/components/booking/week";

// docs/features/autogestion-paciente/prd.html — criterios [e2e] de la página.

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const HOURS_BEFORE_DEADLINE = 6;
const DAYS_AHEAD_AFTER_RESCHEDULE = 12;
const DEADLINE_MESSAGE =
  "Ya no puedes cambiar esta cita desde este enlace porque faltan menos de 12 horas.";
const LIMIT_MESSAGE =
  "Esta cita ya se reprogramó una vez y no se puede volver a reprogramar. Si necesitas otro horario, cancélala y reserva de nuevo.";
const REASON_LABEL = "Ya no necesito la cita";
const REASON_LABELS = [
  "Me surgió un imprevisto",
  "No puedo llegar a esa hora",
  REASON_LABEL,
  "Me atenderé en otro lugar",
  "Reservé por error",
];
const REASON_HINT = "Elige un motivo para continuar.";
const LINK_UNAVAILABLE_TITLE = "Este enlace ya no está disponible";
const FORBIDDEN_COPY = [/hora de Lima/i, /\bDra?\.\s/];

test.use({ viewport: MOBILE_VIEWPORT });

function manageUrl(token: string): string {
  return `/appointment/manage/${token}`;
}

function doctorFullName(scenario: PortalScenario): string {
  return `${scenario.doctor.name} ${scenario.doctor.lastName}`;
}

async function expectNoForbiddenCopy(page: Page) {
  for (const forbidden of FORBIDDEN_COPY) {
    await expect(page.locator("body")).not.toContainText(forbidden);
  }
}

async function expectNoHorizontalScroll(page: Page) {
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
}

async function setUp(label: string, scheduledAt?: string) {
  const scenario = await createPortalScenario(label);
  const managed = await createManagedAppointment(scenario, { scheduledAt });
  return { scenario, managed };
}

async function pickFirstSlotOfNextMonday(page: Page) {
  const nextMonday = addDays(startOfWeek(todayKey()), 7);
  await page.getByRole("button", { name: "Semana siguiente" }).click();
  await page
    .getByRole("button", {
      name: new RegExp(`^Lu\\s*${Number(nextMonday.slice(8, 10))}$`),
    })
    .click();
  const firstSlot = page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first();
  const time = (await firstSlot.textContent()) ?? "";
  await firstSlot.click();
  return { date: nextMonday, time };
}

test("ver la cita muestra lo necesario y nada más, sin zona horaria ni Dr./Dra.", async ({
  page,
}) => {
  const { scenario, managed } = await setUp("portal-view");

  const response = await page.goto(manageUrl(managed.token));

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: `Hola, ${managed.patient.name}` }),
  ).toBeVisible();
  await expect(page.getByText("Pendiente", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Esta es tu cita. Puedes cancelarla o reprogramarla hasta 12 horas antes. Solo se puede reprogramar una vez.",
    ),
  ).toBeVisible();
  await expect(page.getByText("30 minutos")).toBeVisible();
  await expect(page.getByText(scenario.specialtyName)).toBeVisible();
  await expect(page.getByText(doctorFullName(scenario))).toBeVisible();
  await expect(page.getByText(scenario.clinicName)).toBeVisible();
  await expect(page.getByText(scenario.clinicAddress)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reprogramar" })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Cancelar cita" }),
  ).toBeEnabled();
  await expect(
    page.getByText("© ", { exact: false }).filter({ hasText: "WizyDoc" }),
  ).toBeVisible();

  const body = page.locator("body");
  await expect(body).not.toContainText(managed.patient.lastName);
  await expect(body).not.toContainText(managed.patient.email);
  await expect(body).not.toContainText(managed.patient.documentNumber);
  await expect(body).not.toContainText(managed.patient.phone);
  await expect(body).not.toContainText(scenario.clinicPhone.slice(-9));
  await expectNoForbiddenCopy(page);
  await expectNoHorizontalScroll(page);

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
    "content",
    "no-referrer",
  );
});

test("cancelar pide confirmación, deja la cita cancelada y ofrece reservar otro horario", async ({
  page,
}) => {
  const { scenario, managed } = await setUp("portal-cancel");
  await page.goto(manageUrl(managed.token));

  await page.getByRole("button", { name: "Cancelar cita" }).click();
  await expect(
    page.getByRole("heading", { name: "¿Cancelar tu cita?" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "El horario quedará libre para otro paciente. Esta acción no se puede deshacer.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Volver" }).click();
  await expect(
    page.getByRole("heading", { name: `Hola, ${managed.patient.name}` }),
  ).toBeVisible();
  expect((await readAppointment(managed.appointmentId)).status).toBe("PENDING");

  await page.getByRole("button", { name: "Cancelar cita" }).click();
  await page.getByRole("radio", { name: REASON_LABEL }).check();
  await page.getByRole("button", { name: "Sí, cancelar" }).click();

  await expect(
    page.getByRole("heading", { name: "Tu cita está cancelada" }),
  ).toBeVisible();
  await expect(
    page.getByText("El horario quedó libre para otro paciente."),
  ).toBeVisible();
  await expect(
    page.getByText("Te enviamos la confirmación por correo."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Reservar otro horario" }),
  ).toHaveAttribute("href", `/clinic/${scenario.clinicId}/create-appointment`);
  expect((await readAppointment(managed.appointmentId)).status).toBe(
    "CANCELLED",
  );

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Tu cita está cancelada" }),
  ).toBeVisible();
  await expectNoForbiddenCopy(page);
});

test("cancelar exige elegir un motivo: sin selección al entrar y «Sí, cancelar» deshabilitado hasta elegir", async ({
  page,
}) => {
  const { managed } = await setUp("portal-cancel-reason");
  await page.goto(manageUrl(managed.token));

  await page.getByRole("button", { name: "Cancelar cita" }).click();
  const group = page.getByRole("group", { name: "¿Por qué cancelas?" });
  const radios = group.getByRole("radio");
  await expect(radios).toHaveCount(REASON_LABELS.length);
  for (const [index, label] of REASON_LABELS.entries()) {
    await expect(radios.nth(index)).toHaveAccessibleName(label);
    await expect(radios.nth(index)).not.toBeChecked();
  }
  await expect(page.getByText(REASON_HINT)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sí, cancelar" }),
  ).toBeDisabled();
  await expectNoHorizontalScroll(page);

  await group.getByText(REASON_LABEL).click();
  await expect(page.getByRole("radio", { name: REASON_LABEL })).toBeChecked();
  await expect(page.getByText(REASON_HINT)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sí, cancelar" }),
  ).toBeEnabled();

  await page.getByRole("button", { name: "Volver" }).click();
  await page.getByRole("button", { name: "Cancelar cita" }).click();
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sí, cancelar" }),
  ).toBeDisabled();
  expect((await readAppointment(managed.appointmentId)).status).toBe("PENDING");
});

test("cancelar envía al servidor el motivo elegido", async ({ page }) => {
  const { managed } = await setUp("portal-cancel-payload");
  await page.goto(manageUrl(managed.token));

  await page.getByRole("button", { name: "Cancelar cita" }).click();
  await page.getByRole("radio", { name: "Reservé por error" }).check();
  const cancelRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.headers()["next-action"] !== undefined,
  );
  await page.getByRole("button", { name: "Sí, cancelar" }).click();

  expect((await cancelRequest).postData()).toContain("BOOKED_BY_MISTAKE");
  await expect(
    page.getByRole("heading", { name: "Tu cita está cancelada" }),
  ).toBeVisible();
});

test("reprogramar con el mismo médico: elegir, confirmar con Antes y Ahora, y ver el tope", async ({
  page,
}) => {
  const { scenario, managed } = await setUp("portal-reschedule");
  await page.goto(manageUrl(managed.token));

  await page.getByRole("button", { name: "Reprogramar" }).click();

  await expect(
    page.getByRole("heading", { name: "Elige fecha y horario" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      `Solo ves los horarios libres de ${doctorFullName(scenario)}.`,
    ),
  ).toBeVisible();
  await expect(page.getByText("Tu cita actual:")).toBeVisible();
  await expect(
    page.getByText("¿No encuentras un horario? Puedes"),
  ).toBeVisible();

  const chosen = await pickFirstSlotOfNextMonday(page);
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "¿Cambiar tu cita a este horario?" }),
  ).toBeVisible();
  await expect(page.getByText("Antes", { exact: true })).toBeVisible();
  await expect(page.getByText("Ahora", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "El horario anterior quedará libre para otro paciente. Solo puedes reprogramar una vez: después de este cambio, solo podrás cancelar.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Confirmar cambio" }).click();

  await expect(
    page.getByRole("heading", { name: "Listo, tu cita cambió" }),
  ).toBeVisible();
  const stored = await readAppointment(managed.appointmentId);
  expect(limaWallTime(stored.scheduledAt)).toBe(
    `${chosen.date}T${chosen.time}`,
  );
  expect(stored.rescheduleCount).toBe(1);
  expect(stored.status).toBe("PENDING");

  await page.getByRole("button", { name: "Ver mi cita" }).click();
  await expect(
    page.getByRole("button", { name: "Reprogramar" }),
  ).toBeDisabled();
  await expect(page.getByText(LIMIT_MESSAGE)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancelar cita" }),
  ).toBeEnabled();
  await expectNoForbiddenCopy(page);
  await expectNoHorizontalScroll(page);
});

test("a menos de 12 h la página muestra la cita sin botones ni contacto", async ({
  page,
}) => {
  const { scenario, managed } = await setUp(
    "portal-deadline",
    limaWallTimeInHours(HOURS_BEFORE_DEADLINE),
  );

  await page.goto(manageUrl(managed.token));

  await expect(
    page.getByRole("heading", { name: `Hola, ${managed.patient.name}` }),
  ).toBeVisible();
  await expect(
    page.getByText("Esta es tu cita.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(DEADLINE_MESSAGE)).toBeVisible();
  await expect(page.getByText(scenario.specialtyName)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reprogramar" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Cancelar cita" })).toHaveCount(
    0,
  );
  await expect(page.locator("body")).not.toContainText(
    scenario.clinicPhone.slice(-9),
  );
  await expectNoForbiddenCopy(page);
});

test("con la cita ya reprogramada, Reprogramar queda deshabilitado con su motivo y se puede cancelar", async ({
  page,
}) => {
  const { managed } = await setUp("portal-limit");
  await updateAppointment(managed.appointmentId, { rescheduleCount: 1 });

  await page.goto(manageUrl(managed.token));

  await expect(
    page.getByRole("button", { name: "Reprogramar" }),
  ).toBeDisabled();
  await expect(page.getByText(LIMIT_MESSAGE)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancelar cita" }),
  ).toBeEnabled();
});

test("una cita ya cancelada se ve cancelada, sin acciones de cambio", async ({
  page,
}) => {
  const { managed } = await setUp("portal-cancelled");
  await updateAppointment(managed.appointmentId, { status: "CANCELLED" });

  await page.goto(manageUrl(managed.token));

  await expect(
    page.getByRole("heading", { name: "Tu cita está cancelada" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Reprogramar" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("link", { name: "Reservar otro horario" }),
  ).toBeVisible();
});

for (const [description, token] of [
  ["alterado", "no-es-un-token"],
  ["con la forma correcta pero inexistente", "a".repeat(64)],
] as const) {
  test(`un enlace ${description} muestra «${LINK_UNAVAILABLE_TITLE}» y sin datos`, async ({
    page,
  }) => {
    await page.goto(manageUrl(token));

    await expect(
      page.getByRole("heading", { name: LINK_UNAVAILABLE_TITLE }),
    ).toBeVisible();
    await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
    await expect(page.getByText(/^Hola,/)).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
      "content",
      /noindex/,
    );
  });
}

test("si otro paciente toma el horario mientras se confirma, vuelve al selector con el mensaje y la cita intacta", async ({
  page,
}) => {
  const { scenario, managed } = await setUp("portal-taken");
  await page.goto(manageUrl(managed.token));
  await page.getByRole("button", { name: "Reprogramar" }).click();
  const chosen = await pickFirstSlotOfNextMonday(page);
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "¿Cambiar tu cita a este horario?" }),
  ).toBeVisible();

  const rival = await postBooking(
    scenario,
    managed.doctorProfileId,
    `${chosen.date}T${chosen.time}`,
  );
  expect(rival.ok()).toBe(true);

  await page.getByRole("button", { name: "Confirmar cambio" }).click();

  await expect(
    page.getByText(
      /^Otro paciente acaba de tomar el horario del .+, \d{2}:\d{2}\. Elige otro\.$/,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Elige fecha y horario" }),
  ).toBeVisible();
  const stored = await readAppointment(managed.appointmentId);
  expect(limaWallTime(stored.scheduledAt)).toBe(managed.scheduledAt);
  expect(stored.rescheduleCount).toBe(0);
});

test("si la cita cambió en otra pestaña, cancelar no se aplica y «Recargar» muestra cómo quedó", async ({
  page,
}) => {
  const { managed } = await setUp("portal-race");
  await page.goto(manageUrl(managed.token));
  await expect(
    page.getByRole("heading", { name: `Hola, ${managed.patient.name}` }),
  ).toBeVisible();

  const portal = await createPortalClient();
  const movedTo = limaWallTimeInDays(DAYS_AHEAD_AFTER_RESCHEDULE, "11:00");
  const moved = await portal.reschedule(managed.token, {
    scheduledAt: movedTo,
    expectedScheduledAt: managed.scheduledAt,
  });
  expect(moved.status()).toBe(200);

  await page.getByRole("button", { name: "Cancelar cita" }).click();
  await page.getByRole("radio", { name: REASON_LABEL }).check();
  await page.getByRole("button", { name: "Sí, cancelar" }).click();

  await expect(
    page.getByRole("heading", { name: "Tu cita cambió mientras elegías" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Alguien canceló o reprogramó esta cita desde otra pestaña o dispositivo. Recarga para ver cómo quedó.",
    ),
  ).toBeVisible();
  expect((await readAppointment(managed.appointmentId)).status).toBe("PENDING");

  await page.getByRole("button", { name: "Recargar" }).click();

  await expect(
    page.getByRole("heading", { name: `Hola, ${managed.patient.name}` }),
  ).toBeVisible();
  await expect(page.getByText("11:00")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reprogramar" }),
  ).toBeDisabled();
});

test("si el médico no tiene horarios, ofrece cancelar y reservar de nuevo o mantener la cita", async ({
  page,
}) => {
  const { scenario, managed } = await setUp("portal-no-slots");
  await removeAvailability(scenario.doctor.doctorProfileId);
  await page.goto(manageUrl(managed.token));

  await page.getByRole("button", { name: "Reprogramar" }).click();

  await expect(
    page.getByRole("heading", { name: "No hay horarios disponibles" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancelar y reservar de nuevo" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Mantener mi cita" }).click();
  await expect(
    page.getByRole("heading", { name: `Hola, ${managed.patient.name}` }),
  ).toBeVisible();
  expect((await readAppointment(managed.appointmentId)).status).toBe("PENDING");
});
