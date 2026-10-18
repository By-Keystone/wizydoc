import type { Page } from "@playwright/test";
import { getTestPrisma } from "../../support/db";
import { seedFullDayAvailability } from "../../support/availability";
import { expect, test } from "../../support/test";
import {
  addDoctor,
  addMember,
  createProfileWorld,
  loginAndOpenProfile,
  readStoredUser,
} from "../../support/profile";

// docs/features/perfil-usuario/plan.md — PR 4, CA-50 a CA-57 y CA-71.

const SAVED = "Guardamos tus datos.";
const INVALID = "Revisa los datos marcados.";

const personal = (page: Page) =>
  page.getByRole("region", { name: "Datos personales", exact: true });

const nameField = (page: Page) =>
  personal(page).getByLabel("Nombre", { exact: true });
const lastNameField = (page: Page) =>
  personal(page).getByLabel("Apellido", { exact: true });
const phoneField = (page: Page) =>
  personal(page).getByLabel("Celular", { exact: true });
const countryField = (page: Page) =>
  personal(page).getByLabel("Código de país");
const editButton = (page: Page) =>
  personal(page).getByRole("button", { name: "Editar", exact: true });
const saveButton = (page: Page) =>
  personal(page).getByRole("button", { name: "Guardar cambios", exact: true });

const toast = (page: Page, text: string) =>
  page.getByText(text, { exact: true }).first();

async function userWithPhone(label: string, phone: string) {
  const world = await createProfileWorld(label);
  const user = await addMember(world, "USER", { label, phone });
  return { world, user };
}

test("CA-50: «Editar» habilita los campos y lleva el foco a «Tratamiento» en el médico", async ({
  page,
}) => {
  const world = await createProfileWorld("edit-focus-doc");
  const doctor = await addDoctor(world, { label: "edit-focus-doc" });

  await loginAndOpenProfile(page, doctor);
  await editButton(page).click();

  await expect(
    personal(page).getByLabel("Tratamiento", { exact: true }),
  ).toBeFocused();
  await expect(
    personal(page).getByLabel("Tratamiento", { exact: true }),
  ).toBeEnabled();
  await expect(nameField(page)).toBeEnabled();
  await expect(lastNameField(page)).toBeEnabled();
  await expect(phoneField(page)).toBeEnabled();
  await expect(countryField(page)).toBeEnabled();
});

test("CA-50: «Editar» lleva el foco a «Nombre» en quien no es médico", async ({
  page,
}) => {
  const world = await createProfileWorld("edit-focus-user");
  const user = await addMember(world, "USER", { label: "edit-focus-user" });

  await loginAndOpenProfile(page, user);
  await editButton(page).click();

  await expect(nameField(page)).toBeFocused();
  await expect(nameField(page)).toBeEnabled();
});

test("CA-51: guardar nombre, apellido y celular avisa, vuelve a solo lectura con el foco en «Editar» y persiste", async ({
  page,
}) => {
  const { user } = await userWithPhone("edit-save", "+51999888777");

  await loginAndOpenProfile(page, user);
  await editButton(page).click();
  await nameField(page).fill("Rosa");
  await lastNameField(page).fill("Huamán");
  await phoneField(page).fill("912345678");
  await saveButton(page).click();

  await expect(toast(page, SAVED)).toBeVisible();
  await expect(editButton(page)).toBeFocused();
  await expect(nameField(page)).toBeDisabled();
  await expect(nameField(page)).toHaveValue("Rosa");

  await page.reload();
  await expect(nameField(page)).toHaveValue("Rosa");
  await expect(lastNameField(page)).toHaveValue("Huamán");
  await expect(phoneField(page)).toHaveValue("912345678");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Rosa Huamán",
  );

  const stored = await readStoredUser(user.userId);
  expect(stored.phone).toBe("+51912345678");
});

test("CA-52: elegir «Dra.» y guardar cambia la vista previa y el booking; «Sin tratamiento» deja solo el nombre", async ({
  page,
  browser,
}) => {
  const world = await createProfileWorld("edit-treat");
  const doctor = await addDoctor(world, {
    label: "edit-treat",
    name: "Valeria",
    lastName: "Montes",
    specialtyIds: [world.specialtyId],
  });
  await seedFullDayAvailability(doctor.userId, world.clinicId);
  const draName = "Dra. Valeria Montes";
  const plainName = "Valeria Montes";

  const bookingDoctorNames = async () => {
    const guest = await browser.newPage();
    try {
      await guest.goto(`/clinic/${world.clinicId}/create-appointment`);
      await guest
        .getByRole("button", { name: world.specialtyName, exact: true })
        .click();
      await guest
        .getByRole("button", { name: "Siguiente", exact: true })
        .click();
      return {
        withTitle: await guest
          .getByRole("button", { name: draName, exact: true })
          .count(),
        plain: await guest
          .getByRole("button", { name: plainName, exact: true })
          .count(),
      };
    } finally {
      await guest.close();
    }
  };

  await loginAndOpenProfile(page, doctor);
  await editButton(page).click();
  await personal(page)
    .getByLabel("Tratamiento", { exact: true })
    .selectOption("DRA");
  await saveButton(page).click();

  await expect(toast(page, SAVED)).toBeVisible();
  await expect(
    personal(page).getByText(
      `Así te ven tus pacientes al reservar: ${draName}`,
    ),
  ).toBeVisible();
  expect(await bookingDoctorNames()).toEqual({ withTitle: 1, plain: 0 });

  await editButton(page).click();
  await personal(page)
    .getByLabel("Tratamiento", { exact: true })
    .selectOption("");
  await saveButton(page).click();

  await expect(
    personal(page).getByText(
      `Así te ven tus pacientes al reservar: ${plainName}`,
    ),
  ).toBeVisible();
  expect(await bookingDoctorNames()).toEqual({ withTitle: 0, plain: 1 });
});

test("CA-53: «Cancelar» descarta lo escrito, también el celular, y devuelve el foco a «Editar»", async ({
  page,
}) => {
  const { user } = await userWithPhone("edit-cancel", "+51999888777");

  await loginAndOpenProfile(page, user);
  const originalName = await nameField(page).inputValue();

  await editButton(page).click();
  await nameField(page).fill("Otro nombre");
  await phoneField(page).fill("911111111");
  await countryField(page).selectOption("+57");
  await personal(page)
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();

  await expect(editButton(page)).toBeFocused();
  await expect(nameField(page)).toHaveValue(originalName);
  await expect(nameField(page)).toBeDisabled();
  await expect(phoneField(page)).toHaveValue("999888777");
  await expect(countryField(page)).toHaveValue("+51");
  expect((await readStoredUser(user.userId)).phone).toBe("+51999888777");
});

test("CA-53: «Cancelar» limpia los errores de validación y al volver a «Editar» el formulario está limpio", async ({
  page,
}) => {
  const { user } = await userWithPhone("edit-cancel-errors", "+51999888777");

  await loginAndOpenProfile(page, user);
  await editButton(page).click();
  await nameField(page).fill("");
  await saveButton(page).click();
  await expect(
    personal(page).getByText("Ingresa tu nombre", { exact: true }),
  ).toBeVisible();

  await personal(page)
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();

  await expect(personal(page).getByText("Ingresa tu nombre")).toHaveCount(0);
  await editButton(page).click();
  await expect(personal(page).getByText("Ingresa tu nombre")).toHaveCount(0);
  await expect(nameField(page)).not.toHaveAttribute("aria-invalid", "true");
  await expect(nameField(page)).not.toHaveValue("");
});

const EMPTY_FIELD_CASES = [
  { label: "nombre", message: "Ingresa tu nombre", field: nameField },
  { label: "apellido", message: "Ingresa tu apellido", field: lastNameField },
  { label: "celular", message: "Ingresa tu celular", field: phoneField },
] as const;

for (const { label, message, field } of EMPTY_FIELD_CASES) {
  test(`CA-54: guardar con el ${label} vacío marca el campo, avisa, enfoca y no guarda`, async ({
    page,
  }) => {
    const { user } = await userWithPhone(`edit-empty-${label}`, "+51999888777");
    const before = await readStoredUser(user.userId);

    await loginAndOpenProfile(page, user);
    await editButton(page).click();
    await field(page).fill("");
    await saveButton(page).click();

    await expect(
      personal(page).getByText(message, { exact: true }),
    ).toBeVisible();
    await expect(field(page)).toHaveAttribute("aria-invalid", "true");
    await expect(toast(page, INVALID)).toBeVisible();
    await expect(field(page)).toBeFocused();

    const after = await readStoredUser(user.userId);
    expect([after.name, after.lastName, after.phone]).toEqual([
      before.name,
      before.lastName,
      before.phone,
    ]);
  });
}

test("CA-55: un celular «+51954330118» se precarga con «+51» y el número, y guardar sin tocarlo lo deja igual", async ({
  page,
}) => {
  const { user } = await userWithPhone("edit-phone-pe", "+51954330118");

  await loginAndOpenProfile(page, user);

  await expect(countryField(page)).toHaveValue("+51");
  await expect(phoneField(page)).toHaveValue("954330118");

  await editButton(page).click();
  await saveButton(page).click();

  await expect(toast(page, SAVED)).toBeVisible();
  expect((await readStoredUser(user.userId)).phone).toBe("+51954330118");
});

test("CA-56: un celular de invitación sin código se precarga con «+51» y se guarda con él", async ({
  page,
}) => {
  const { user } = await userWithPhone("edit-phone-bare", "987654321");

  await loginAndOpenProfile(page, user);

  await expect(countryField(page)).toHaveValue("+51");
  await expect(phoneField(page)).toHaveValue("987654321");

  await editButton(page).click();
  await saveButton(page).click();

  await expect(toast(page, SAVED)).toBeVisible();
  expect((await readStoredUser(user.userId)).phone).toBe("+51987654321");
});

test("CA-57: un celular con un código fuera de la lista se guarda tal cual", async ({
  page,
}) => {
  const { user } = await userWithPhone("edit-phone-uk", "+447911123456");

  await loginAndOpenProfile(page, user);
  await editButton(page).click();
  await saveButton(page).click();

  await expect(toast(page, SAVED)).toBeVisible();
  expect((await readStoredUser(user.userId)).phone).toBe("+447911123456");
});

test("el tratamiento no se envía si el usuario no tiene sedes y sí si es médico", async ({
  page,
}) => {
  const world = await createProfileWorld("edit-treat-payload");
  const receptionist = await addMember(world, "USER", {
    label: "edit-treat-payload",
  });
  const doctor = await addDoctor(world, { label: "edit-treat-payload-doc" });
  const sentBodies: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) {
      sentBodies.push(request.postData() ?? "");
    }
  });

  await loginAndOpenProfile(page, receptionist);
  await editButton(page).click();
  await nameField(page).fill("Sin sedes");
  await saveButton(page).click();
  await expect(toast(page, SAVED)).toBeVisible();

  expect(sentBodies.length).toBeGreaterThan(0);
  expect(sentBodies.join("\n")).not.toContain("treatment");
  expect((await readStoredUser(receptionist.userId)).treatment).toBeNull();

  sentBodies.length = 0;
  await page.context().clearCookies();
  await loginAndOpenProfile(page, doctor);
  await editButton(page).click();
  await saveButton(page).click();
  await expect(toast(page, SAVED)).toBeVisible();

  expect(sentBodies.join("\n")).toContain("treatment");
});

test("CA-71: con la sesión borrada en la base, guardar avisa que expiró y lleva a /login", async ({
  page,
}) => {
  const { user } = await userWithPhone("edit-expired", "+51999888777");

  await loginAndOpenProfile(page, user);
  await editButton(page).click();
  await nameField(page).fill("Sesión caída");

  const prisma = await getTestPrisma();
  await prisma.session.deleteMany({ where: { userId: user.userId } });

  await saveButton(page).click();

  await expect(
    toast(page, "Tu sesión ha expirado. Vuelve a iniciar sesión."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
