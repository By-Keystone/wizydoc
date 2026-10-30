import type { Page } from "@playwright/test";
import { createClinicResourceViaPrisma } from "../../support/accounts";
import {
  bookingHeader,
  boxOf,
  chooseSlotAndGoToPatientStep,
  expectNoHorizontalScroll,
  MOBILE_VIEWPORT,
  openBooking,
  pageHeading,
  STEP_TITLES,
  stepTitle,
} from "../../support/booking-ui";
import { createPortalClient } from "../../support/appointment-portal";
import { extractLink, readEmailsTo, waitForEmailTo } from "../../support/email";
import { API_BASE_URL, PLATFORM_BASE_URL } from "../../support/env";
import { LONG_WORD } from "../../support/first-use";
import {
  closedHeading,
  createListedClinic,
  expectMissedBookingsStay,
  expectNoPlanTalk,
  fillPatientDetails,
  LIMA_LANDLINE_CONTACT,
  MOBILE_CONTACT,
  newPatientDetails,
  NO_DOCTORS_MESSAGE,
  OTHER_MOBILE_CONTACT,
  PROVINCE_LANDLINE_CONTACT,
  setMonthlyBookings,
  setPatientContact,
  type ListedClinic,
} from "../../support/monthly-cap";
import { expect, test } from "../../support/test";
import { uniqueName } from "../../support/users";

// docs/features/tope-citas-mes/plan.md: CA-20, CA-21, CA-23, CA-26, CA-27, CA-54 (página) y CA-77 y CA-78 (página cerrada).

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MIN_CLOSED_BUTTON_HEIGHT = 44;
const WIDTH_TOLERANCE_PX = 2;
const FORBIDDEN_OPTION_TITLES = Object.values(STEP_TITLES);

interface ContactVariant {
  label: string;
  contact: string | null;
  explanation: string;
  whatsAppMessage: boolean;
  callName?: string;
  callHref?: string;
}

const CONTACT_VARIANTS: ContactVariant[] = [
  {
    label: "celular",
    contact: MOBILE_CONTACT,
    explanation: "Para pedir una cita, escribe o llama al consultorio.",
    whatsAppMessage: true,
    callName: "Llamar al 987 654 321",
    callHref: `tel:${MOBILE_CONTACT}`,
  },
  {
    label: "fijo de Lima",
    contact: LIMA_LANDLINE_CONTACT,
    explanation: "Para pedir una cita, llama al consultorio.",
    whatsAppMessage: false,
    callName: "Llamar al (01) 234 5678",
    callHref: `tel:${LIMA_LANDLINE_CONTACT}`,
  },
  {
    label: "fijo de provincia",
    contact: PROVINCE_LANDLINE_CONTACT,
    explanation: "Para pedir una cita, llama al consultorio.",
    whatsAppMessage: false,
    callName: "Llamar al (044) 123 456",
    callHref: `tel:${PROVINCE_LANDLINE_CONTACT}`,
  },
  {
    label: "sin contacto",
    contact: null,
    explanation: "Vuelve a intentarlo más adelante.",
    whatsAppMessage: false,
  },
];

const whatsAppLink = (page: Page) =>
  page.getByRole("link", { name: /^Escribir por WhatsApp/ });

async function openClosedBookingWith(
  page: Page,
  world: ListedClinic,
  contact: string | null,
) {
  await setPatientContact(world.clinicId, contact);
  await openBooking(page, world.clinicId);
  await expect(closedHeading(page)).toBeVisible();
}

test("CA-20: con el tope alcanzado, quien abre el link ve la cabecera de hoy y el mensaje, sin pasos, opciones ni campos, con el título de siempre", async ({
  page,
}) => {
  const world = await createListedClinic("closed-ca20", { booked: 9 });
  await openBooking(page, world.clinicId);
  await expect(stepTitle(page, "datetime")).toBeVisible();
  const titleWithRoom = await page.title();
  await setMonthlyBookings(world.accountId, 10);

  for (const viewport of [DESKTOP_VIEWPORT, MOBILE_VIEWPORT]) {
    await page.setViewportSize(viewport);
    await openBooking(page, world.clinicId);

    await expect(closedHeading(page)).toBeVisible();
    await expect(
      pageHeading(
        page,
        `Reserva tu cita con ${world.owner.name} ${world.owner.lastName}`,
      ),
    ).toBeVisible();
    await expect(bookingHeader(page)).toContainText(world.specialtyName);
    await expect(bookingHeader(page)).toContainText(
      `${world.clinicName} · ${world.address}`,
    );
    await expect(
      page.getByText("Vuelve a intentarlo más adelante.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Paso \d+ de \d+/)).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(0);
    for (const title of FORBIDDEN_OPTION_TITLES) {
      await expect(
        page.getByRole("heading", { level: 2, name: title, exact: true }),
      ).toHaveCount(0);
    }
    await expect(page).toHaveTitle(titleWithRoom);
  }
});

test("CA-21: el contacto de la sede decide el texto y los enlaces de la página cerrada", async ({
  page,
}) => {
  const world = await createListedClinic("closed-ca21", { booked: 10 });

  for (const variant of CONTACT_VARIANTS) {
    await openClosedBookingWith(page, world, variant.contact);

    await expect(
      page.getByText(variant.explanation, { exact: true }),
      variant.label,
    ).toBeVisible();
    const whatsApp = whatsAppLink(page);
    if (variant.whatsAppMessage) {
      await expect(whatsApp, variant.label).toHaveAccessibleName(
        "Escribir por WhatsApp (se abre en WhatsApp)",
      );
      await expect(whatsApp, variant.label).toHaveAttribute(
        "href",
        `https://wa.me/${MOBILE_CONTACT.slice(1)}?text=${encodeURIComponent(
          `Hola, quiero pedir una cita en ${world.clinicName}.`,
        )}`,
      );
      await expect(whatsApp, variant.label).toHaveAttribute("target", "_blank");
      await expect(whatsApp, variant.label).toHaveAttribute("rel", /noopener/);
    } else {
      await expect(whatsApp, variant.label).toHaveCount(0);
    }
    if (variant.callName) {
      const call = page.getByRole("link", { name: variant.callName });
      await expect(call, variant.label).toHaveAttribute(
        "href",
        variant.callHref ?? "",
      );
    }
    await expect(page.getByRole("link"), variant.label).toHaveCount(
      (variant.whatsAppMessage ? 1 : 0) + (variant.callName ? 1 : 0),
    );
  }
});

test("CA-23: al paciente nunca se le habla del plan, del tope ni de errores, en ninguna de las cuatro variantes", async ({
  page,
}) => {
  const world = await createListedClinic("closed-ca23", { booked: 10 });

  for (const variant of CONTACT_VARIANTS) {
    await openClosedBookingWith(page, world, variant.contact);

    await expectNoPlanTalk(page);
  }
});

test("CA-26: con el tope alcanzado, una sede sin médicos con horario muestra el mensaje de sin médicos y la visita no suma reservas perdidas", async ({
  page,
}) => {
  const world = await createListedClinic("closed-ca26", { booked: 10 });
  const emptyClinicId = await createClinicResourceViaPrisma(
    world.owner,
    world.organizationId,
    { name: uniqueName("Sede Vacía") },
  );

  await openBooking(page, emptyClinicId);

  await expect(
    page.getByText(NO_DOCTORS_MESSAGE, { exact: true }),
  ).toBeVisible();
  await expect(closedHeading(page)).toHaveCount(0);
  await expectMissedBookingsStay(world.accountId, 0);
});

test("CA-27: la página cerrada no tiene formularios ni campos, no pide nada a otros orígenes que platform y el api, y no deja cookies", async ({
  page,
}) => {
  const world = await createListedClinic("closed-ca27", {
    booked: 10,
    patientContact: MOBILE_CONTACT,
  });
  const requestedUrls: string[] = [];
  page.on("request", (request) => requestedUrls.push(request.url()));

  await openBooking(page, world.clinicId);
  await expect(closedHeading(page)).toBeVisible();
  await page.waitForLoadState("networkidle");

  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.locator("input, select, textarea")).toHaveCount(0);
  const allowedOrigins = new Set(
    [PLATFORM_BASE_URL, API_BASE_URL].map((url) => new URL(url).origin),
  );
  const foreignRequests = requestedUrls
    .map((url) => new URL(url))
    .filter(
      ({ protocol, origin }) =>
        protocol.startsWith("http") && !allowedOrigins.has(origin),
    )
    .map(({ href }) => href);
  expect(foreignRequests).toEqual([]);
  expect(await page.context().cookies()).toEqual([]);
});

test("CA-54: con un contacto guardado y el link abierto, ni el wizard, ni «¡Cita reservada!», ni la autogestión, ni los correos lo muestran", async ({
  page,
}) => {
  const world = await createListedClinic("closed-ca54", {
    plan: "CONSULTORIO",
    patientContact: OTHER_MOBILE_CONTACT,
  });
  const contactDigits = OTHER_MOBILE_CONTACT.slice(3);
  const formattedContact = "955 123 456";
  const details = newPatientDetails();

  await openBooking(page, world.clinicId);
  await expect(stepTitle(page, "datetime")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(formattedContact);
  await chooseSlotAndGoToPatientStep(page);
  await expect(page.locator("body")).not.toContainText(formattedContact);
  await fillPatientDetails(page, details);
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(stepTitle(page, "success")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(formattedContact);
  await expect(page.locator("body")).not.toContainText(contactDigits);

  const confirmation = await waitForEmailTo(details.email, {
    subject: `Tu cita en ${world.clinicName} está reservada`,
  });
  const token =
    new URL(extractLink(confirmation.html, "/appointment/manage/")).pathname
      .split("/")
      .at(-1) ?? "";
  await page.goto(`/appointment/manage/${token}`);
  await expect(
    page.getByRole("heading", { name: `Hola, ${details.name}` }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(formattedContact);
  const portal = await createPortalClient();
  const cancelled = await portal.cancel(token);
  expect(cancelled.status()).toBe(200);
  await waitForEmailTo(world.owner.email, {
    subject: `Tu paciente ha cancelado su cita en ${world.clinicName}`,
  });

  for (const sent of [
    confirmation,
    ...readEmailsTo(world.owner.email),
    ...readEmailsTo(details.email),
  ]) {
    expect(sent.html).not.toContain(contactDigits);
    expect(sent.html).not.toContain(formattedContact);
  }
});

test("CA-77: a 375 px, con nombre de sede y dirección de 80 caracteres, la página cerrada no se desplaza en horizontal y sus botones van a lo ancho con al menos 44 px", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  const world = await createListedClinic("closed-ca77", {
    booked: 10,
    clinicName: LONG_WORD,
    address: LONG_WORD,
  });

  for (const variant of CONTACT_VARIANTS) {
    await openClosedBookingWith(page, world, variant.contact);

    await expectNoHorizontalScroll(page);
    const contentWidth = (await boxOf(closedHeading(page))).width;
    for (const button of await page.getByRole("link").all()) {
      const box = await boxOf(button);
      expect(box.height, variant.label).toBeGreaterThanOrEqual(
        MIN_CLOSED_BUTTON_HEIGHT,
      );
      expect(
        Math.abs(box.width - contentWidth),
        variant.label,
      ).toBeLessThanOrEqual(WIDTH_TOLERANCE_PX);
    }
  }
});

test("CA-78: la página cerrada tiene un solo h1, sus íconos están ocultos a los lectores y «Escribir por WhatsApp» anuncia que se abre en WhatsApp", async ({
  page,
}) => {
  const world = await createListedClinic("closed-ca78", {
    booked: 10,
    patientContact: MOBILE_CONTACT,
  });

  await openBooking(page, world.clinicId);
  await expect(closedHeading(page)).toBeVisible();

  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const exposedIcons = await page.evaluate(
    () =>
      [...document.querySelectorAll("main svg")].filter(
        (icon) => !icon.closest('[aria-hidden="true"]'),
      ).length,
  );
  expect(exposedIcons).toBe(0);
  await expect(whatsAppLink(page)).toHaveAccessibleName(
    "Escribir por WhatsApp (se abre en WhatsApp)",
  );
});
