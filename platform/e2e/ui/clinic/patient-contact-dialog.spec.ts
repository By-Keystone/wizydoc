import type { Locator, Page } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  MOBILE_VIEWPORT,
  openBooking,
} from "../../support/booking-ui";
import { PLATFORM_BASE_URL } from "../../support/env";
import {
  addNumberButton,
  changeNumberButton,
  closedHeading,
  contactDialog,
  contactField,
  createListedClinic,
  INVALID_CONTACT_MESSAGE,
  LIMA_LANDLINE_CONTACT,
  MOBILE_CONTACT,
  openHome,
  PROVINCE_LANDLINE_CONTACT,
  readPatientContact,
  reloadHome,
  setMonthlyBookings,
  setPatientContact,
  usageCard,
} from "../../support/monthly-cap";
import { expect, test } from "../../support/test";

// docs/features/tope-citas-mes/plan.md: CA-49 a CA-52, CA-77 (diálogo) y CA-78 (diálogo).

const SAVED_TOAST = "Guardamos el número para tus pacientes.";
const REMOVED_TOAST = "Quitamos el número.";
const HINT =
  "Un celular de 9 dígitos o un fijo con su código, como (01) 234 5678. Si es un celular, tus pacientes también podrán escribirte por WhatsApp.";
const REJECTED_INPUTS = ["12345", "887654321", "98765432", "hola, llámame"];

const saveButton = (page: Page) =>
  contactDialog(page).getByRole("button", { name: "Guardar", exact: true });

async function describedText(field: Locator): Promise<string> {
  return field.evaluate((input) =>
    (input.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" "),
  );
}

async function openDialog(page: Page, trigger: Locator) {
  await trigger.click();
  await expect(contactDialog(page)).toBeVisible();
}

test("CA-49: «Agregar número» abre el diálogo con el campo vacío y sin «Quitar número»; «Cambiar» lo trae con el número guardado; el foco empieza en el campo y vuelve al botón al cerrar", async ({
  page,
}) => {
  const world = await createListedClinic("contact-ui-ca49", { booked: 8 });
  await openHome(page, world);
  const addButton = addNumberButton(usageCard(page));

  await openDialog(page, addButton);

  const dialog = contactDialog(page);
  await expect(dialog).toContainText(
    "Lo verán tus pacientes cuando tu link no esté recibiendo reservas.",
  );
  const field = contactField(page);
  await expect(field).toHaveValue("");
  await expect(field).toHaveAttribute("type", "tel");
  await expect(field).toHaveAttribute("inputmode", "tel");
  await expect(field).toHaveAttribute("autocomplete", "off");
  await expect(field).toHaveAttribute("placeholder", "987 654 321");
  await expect(dialog).toContainText(HINT);
  await expect(
    dialog.getByRole("button", { name: "Quitar número" }),
  ).toHaveCount(0);
  await expect(field).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(addButton).toBeFocused();

  await setMonthlyBookings(world.accountId, 10);
  await setPatientContact(world.clinicId, MOBILE_CONTACT);
  await reloadHome(page);
  const changeButton = changeNumberButton(usageCard(page));

  await openDialog(page, changeButton);

  await expect(contactField(page)).toHaveValue("987 654 321");
  await expect(
    dialog.getByRole("button", { name: "Quitar número" }),
  ).toBeVisible();
  await expect(contactField(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(changeButton).toBeFocused();
});

test("CA-50: un número válido se guarda: toast, el diálogo se cierra y la tarjeta muestra el número con formato, sin recargar", async ({
  page,
}) => {
  const world = await createListedClinic("contact-ui-ca50", { booked: 10 });
  await openHome(page, world);
  const saves = [
    { typed: "987654321", shown: "987 654 321", stored: MOBILE_CONTACT },
    {
      typed: "(01) 234-5678",
      shown: "(01) 234 5678",
      stored: LIMA_LANDLINE_CONTACT,
    },
    {
      typed: "(044) 123456",
      shown: "(044) 123 456",
      stored: PROVINCE_LANDLINE_CONTACT,
    },
  ];

  for (const [index, { typed, shown, stored }] of saves.entries()) {
    const trigger =
      index === 0
        ? addNumberButton(usageCard(page))
        : changeNumberButton(usageCard(page));
    await openDialog(page, trigger);
    await contactField(page).fill(typed);

    await saveButton(page).click();

    await expect(page.getByText(SAVED_TOAST).last()).toBeVisible();
    await expect(contactDialog(page)).toBeHidden();
    await expect(usageCard(page)).toContainText(`el número ${shown}.`);
    expect(await readPatientContact(world.clinicId)).toBe(stored);
  }
});

test("CA-50: mientras guarda, el botón dice «Guardando...» y está deshabilitado", async ({
  page,
}) => {
  const world = await createListedClinic("contact-ui-ca50-espera", {
    booked: 10,
  });
  await openHome(page, world);
  await openDialog(page, addNumberButton(usageCard(page)));
  await contactField(page).fill("987654321");
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/dashboard", async (route) => {
    if (route.request().method() === "POST") await released;
    await route.continue();
  });

  await saveButton(page).click();

  await expect(
    contactDialog(page).getByRole("button", { name: "Guardando..." }),
  ).toBeDisabled();
  release();
  await expect(contactDialog(page)).toBeHidden();
});

test("CA-51: un número inválido no se guarda: el error sale debajo del campo, con aria-invalid y el foco en él, y el diálogo sigue abierto", async ({
  page,
}) => {
  const world = await createListedClinic("contact-ui-ca51", { booked: 8 });
  await openHome(page, world);
  await openDialog(page, addNumberButton(usageCard(page)));
  const field = contactField(page);

  for (const typed of REJECTED_INPUTS) {
    await field.fill(typed);

    await saveButton(page).click();

    await expect(
      contactDialog(page).getByText(INVALID_CONTACT_MESSAGE, { exact: true }),
      typed,
    ).toBeVisible();
    await expect(field, typed).toHaveAttribute("aria-invalid", "true");
    await expect(field, typed).toBeFocused();
    await expect(field, typed).toHaveValue(typed);
    expect(await readPatientContact(world.clinicId), typed).toBeNull();
  }
  await expect(contactDialog(page)).toBeVisible();
});

test("CA-52: «Quitar número» borra el contacto sin pedir confirmación: toast, diálogo cerrado, la tarjeta sin número y la página del paciente con «Vuelve a intentarlo más adelante.»", async ({
  page,
  browser,
}) => {
  const world = await createListedClinic("contact-ui-ca52", {
    booked: 10,
    patientContact: MOBILE_CONTACT,
  });
  await openHome(page, world);
  await openDialog(page, changeNumberButton(usageCard(page)));

  await contactDialog(page)
    .getByRole("button", { name: "Quitar número" })
    .click();

  await expect(page.getByText(REMOVED_TOAST)).toBeVisible();
  await expect(contactDialog(page)).toBeHidden();
  await expect(usageCard(page)).toContainText(
    "y ningún número para contactarte.",
  );
  expect(await readPatientContact(world.clinicId)).toBeNull();
  const patientContext = await browser.newContext({
    baseURL: PLATFORM_BASE_URL,
  });
  const patientPage = await patientContext.newPage();
  await openBooking(patientPage, world.clinicId);
  await expect(closedHeading(patientPage)).toBeVisible();
  await expect(
    patientPage.getByText("Vuelve a intentarlo más adelante.", {
      exact: true,
    }),
  ).toBeVisible();
  await patientContext.close();
});

test("CA-77: a 375 px el diálogo cabe en la pantalla y no hay desplazamiento horizontal, tampoco con el error a la vista", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  const world = await createListedClinic("contact-ui-ca77", { booked: 10 });
  await openHome(page, world);

  await openDialog(page, addNumberButton(usageCard(page)));
  await contactField(page).fill("12345");
  await saveButton(page).click();
  await expect(
    contactDialog(page).getByText(INVALID_CONTACT_MESSAGE, { exact: true }),
  ).toBeVisible();

  await expectNoHorizontalScroll(page);
  const box = await contactDialog(page).boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
    MOBILE_VIEWPORT.width,
  );
});

test("CA-78: en el diálogo, la ayuda y el error se enlazan al campo con aria-describedby", async ({
  page,
}) => {
  const world = await createListedClinic("contact-ui-ca78", { booked: 10 });
  await openHome(page, world);
  await openDialog(page, addNumberButton(usageCard(page)));
  const field = contactField(page);

  expect(await describedText(field)).toContain(HINT);

  await field.fill("12345");
  await saveButton(page).click();

  await expect(field).toHaveAttribute("aria-invalid", "true");
  const described = await describedText(field);
  expect(described).toContain(HINT);
  expect(described).toContain(INVALID_CONTACT_MESSAGE);
});
