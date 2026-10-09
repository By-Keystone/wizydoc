import { randomBytes } from "node:crypto";
import { test, expect } from "../../support/test";
import {
  MANAGE_LINK_PATH,
  bookAppointment,
  hoursFromNow,
  newPatient,
  readManageLink,
  seedBookableDoctor,
  updateAppointment,
  whenText,
} from "../../support/self-service";
import {
  completeWizard,
  expectUnavailableLink,
} from "../../support/self-service-ui";
import { bookingDate } from "../../support/self-service";

// docs/features/autogestion-paciente/plan.md: CA-2, CA-3, CA-4, CA-7, CA-8, CA-11.

const MOBILE_VIEWPORT = { width: 375, height: 812 };

test.describe("celular, sin sesión", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("CA-2: el enlace del correo muestra la cita sin pedir iniciar sesión", async ({
    page,
  }) => {
    const seed = await seedBookableDoctor("ui-ca2");
    const booked = await bookAppointment(seed);

    await page.goto(booked.manageLink);

    await expect(page).toHaveURL(booked.manageLink);
    await expect(
      page.getByRole("heading", { name: `Hola, ${booked.patient.name}` }),
    ).toBeVisible();
    await expect(page.getByText("Pendiente", { exact: true })).toBeVisible();
    await expect(page.getByText(seed.specialtyName)).toBeVisible();
    await expect(page.getByText(`Dr. ${seed.doctorFullName}`)).toBeVisible();
    await expect(
      page.getByText(whenText(booked.date, booked.time)),
    ).toBeVisible();
    await expect(page.getByText(/30 minutos/)).toBeVisible();
    await expect(page.getByText(seed.clinicName)).toBeVisible();
    await expect(page.getByText(seed.clinicAddress)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reprogramar" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Cancelar cita" }),
    ).toBeEnabled();

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });
});

test.describe("navegador en Tokio", () => {
  test.use({ timezoneId: "Asia/Tokyo" });

  test("CA-3: la fecha y la hora son las de Lima aunque el navegador esté en otra zona", async ({
    page,
  }) => {
    const seed = await seedBookableDoctor("ui-ca3");
    const booked = await bookAppointment(seed, { time: "10:00" });

    await page.goto(booked.manageLink);

    await expect(page.getByText(whenText(booked.date, "10:00"))).toBeVisible();
    await expect(page.getByText(/Hora de Lima/)).toBeVisible();
  });
});

test("CA-4: la pantalla ¡Cita reservada! no muestra ni enlaza la autogestión", async ({
  page,
}) => {
  const seed = await seedBookableDoctor("ui-ca4");
  const patient = newPatient();

  await completeWizard(page, seed, patient, {
    date: bookingDate(),
    time: "10:00",
  });

  await expect(page.getByText("¡Cita reservada!")).toBeVisible();
  const token = readManageLink(patient.email).split(MANAGE_LINK_PATH)[1];
  const hrefs = await page
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
  for (const href of hrefs) {
    expect(href).not.toContain("/appointment/");
  }
  expect(await page.content()).not.toContain(token);
  await expect(page.getByText("Cancelar o reprogramar")).toHaveCount(0);
});

test("CA-7: el HTML de la página no contiene apellido, documento, teléfono ni correo del paciente", async ({
  page,
}) => {
  const seed = await seedBookableDoctor("ui-ca7");
  const booked = await bookAppointment(seed);
  const forbidden = [
    booked.patient.lastName,
    booked.patient.documentNumber,
    booked.patient.phone,
    booked.patient.phone.slice(3),
    booked.patient.email,
    booked.patient.birthDate,
    booked.appointmentId,
  ];

  const served = await page.request.get(booked.manageLink);
  const servedHtml = await served.text();
  expect(servedHtml).toContain(booked.patient.name);

  await page.goto(booked.manageLink);
  await expect(
    page.getByRole("heading", { name: `Hola, ${booked.patient.name}` }),
  ).toBeVisible();
  const renderedHtml = await page.content();

  for (const value of forbidden) {
    expect(servedHtml, `HTML servido: ${value}`).not.toContain(value);
    expect(renderedHtml, `HTML hidratado: ${value}`).not.toContain(value);
  }
});

test("CA-8: la página declara robots noindex, nofollow y referrer no-referrer", async ({
  page,
}) => {
  const seed = await seedBookableDoctor("ui-ca8");
  const booked = await bookAppointment(seed);

  await page.goto(booked.manageLink);

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /nofollow/,
  );
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
    "content",
    "no-referrer",
  );
});

test.describe("CA-11: enlace no disponible en el navegador", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("un token inexistente, con un carácter cambiado, corto o con caracteres no válidos", async ({
    page,
  }) => {
    const seed = await seedBookableDoctor("ui-ca11");
    const booked = await bookAppointment(seed);
    const lastChar = booked.token.at(-1) === "A" ? "B" : "A";

    const unavailableTokens = [
      randomBytes(32).toString("base64url"),
      `${booked.token.slice(0, -1)}${lastChar}`,
      "abc",
      "$$$$$$$$$$$$$$$$$$$$",
    ];

    for (const token of unavailableTokens) {
      await page.goto(`${MANAGE_LINK_PATH}${token}`);
      await expectUnavailableLink(page);
      await expect(page.getByText(seed.specialtyName)).toHaveCount(0);
      await expect(page.getByText(seed.clinicName)).toHaveCount(0);
    }
  });

  test("un token de más de 100 y de más de 2048 caracteres", async ({
    page,
  }) => {
    for (const length of [150, 3000]) {
      await page.goto(`${MANAGE_LINK_PATH}${"a".repeat(length)}`);

      await expectUnavailableLink(page);
    }
  });

  test("una cita que ya empezó y una cancelada que ya pasó", async ({
    page,
  }) => {
    const seed = await seedBookableDoctor("ui-ca11b");
    const started = await bookAppointment(seed, { time: "09:00" });
    const cancelledAndPast = await bookAppointment(seed, { time: "09:30" });
    await updateAppointment(started.appointmentId, {
      scheduledAt: hoursFromNow(-1),
    });
    await updateAppointment(cancelledAndPast.appointmentId, {
      status: "CANCELLED",
      cancelledAt: hoursFromNow(-3),
      scheduledAt: hoursFromNow(-1),
    });

    for (const booked of [started, cancelledAndPast]) {
      await page.goto(booked.manageLink);
      await expectUnavailableLink(page);
      await expect(page.getByText(seed.specialtyName)).toHaveCount(0);
      await expect(page.getByText(booked.patient.name)).toHaveCount(0);
    }
  });
});
