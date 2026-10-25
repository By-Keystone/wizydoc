import type { Page } from "@playwright/test";
import { createOnboardedAdmin } from "../../support/accounts";
import { expect, test } from "../../support/test";
import {
  addDoctor,
  addDoctorToSecondClinic,
  addMember,
  adminAsProfileUser,
  createProfileWorld,
  loginAndOpenProfile,
} from "../../support/profile";
import { uniqueName } from "../../support/users";

// docs/features/perfil-usuario/plan.md — PR 4, CA-43 a CA-49, CA-59 a CA-62, CA-75 y CA-76.

const NAME = "Marta";
const LAST_NAME = "Quispe";
const FULL_NAME = `${NAME} ${LAST_NAME}`;
const EMAIL_HELP =
  "Tu correo es tu usuario para iniciar sesión y por ahora no se puede cambiar.";
const PATIENT_VISIBLE_SENTENCE =
  "Tu nombre es el que ven tus pacientes al reservar.";

const region = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });

test("CA-43: bajo los workspaces muestra la barra superior, el regreso, el avatar, un único h1 y el correo", async ({
  page,
}) => {
  const world = await createProfileWorld("view-top");
  const user = await addDoctor(world, {
    label: "view-top",
    name: NAME,
    lastName: LAST_NAME,
    treatment: "DRA",
  });

  await loginAndOpenProfile(page, user);

  await expect(page.getByRole("img", { name: "WizyDoc" })).toBeVisible();
  await page
    .getByRole("button", { name: `Tu cuenta: ${FULL_NAME}`, exact: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Cerrar sesión", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(FULL_NAME);
  await expect(page.getByText("MQ", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText(user.email, { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("link", { name: "Volver a tus sedes" }).click();
  await expect(page).toHaveURL(`/account/${user.accountId}/select?switch=1`);
  await expect(
    page.getByRole("heading", { name: "Elige dónde entrar" }),
  ).toBeVisible();
});

test("CA-44: dentro de una sede muestra el mismo contenido con el menú lateral y sin el regreso a tus sedes", async ({
  page,
}) => {
  const world = await createProfileWorld("view-clinic");
  const user = await addMember(world, "USER", {
    label: "view-clinic",
    name: NAME,
    lastName: LAST_NAME,
  });

  await loginAndOpenProfile(page, user, {
    kind: "clinic",
    clinicId: world.clinicId,
  });

  await expect(page).toHaveURL(
    new RegExp(`/account/${user.accountId}/clinic/${world.clinicId}/me$`),
  );
  await expect(page.getByRole("complementary")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(FULL_NAME);
  await expect(region(page, "Datos personales")).toBeVisible();
  await expect(region(page, "Contraseña")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Volver a tus sedes" }),
  ).toHaveCount(0);
});

test("CA-44: dentro de la organización muestra el mismo contenido con el menú lateral y sin el regreso a tus sedes", async ({
  page,
}) => {
  const world = await createProfileWorld("view-org");

  await loginAndOpenProfile(page, adminAsProfileUser(world), {
    kind: "organization",
    organizationId: world.organizationId,
  });

  await expect(page).toHaveURL(
    new RegExp(
      `/account/${world.admin.accountId}/organization/${world.organizationId}/me$`,
    ),
  );
  await expect(page.getByRole("complementary")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `${world.admin.name} ${world.admin.lastName}`,
  );
  await expect(region(page, "Datos personales")).toBeVisible();
  await expect(region(page, "Contraseña")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Volver a tus sedes" }),
  ).toHaveCount(0);
});

test("CA-45: el dueño sin organización ve «Datos personales» y «Contraseña», sin «Dónde atiendes»", async ({
  page,
}) => {
  const owner = await createOnboardedAdmin({ emailPrefix: "owner-view" });

  await loginAndOpenProfile(page, {
    email: owner.email,
    userId: owner.userId,
    accountId: owner.accountId,
    name: owner.name,
    lastName: owner.lastName,
  });

  await expect(region(page, "Datos personales")).toBeVisible();
  await expect(region(page, "Contraseña")).toBeVisible();
  await expect(region(page, "Dónde atiendes")).toHaveCount(0);
  await expect(page.getByText("Dónde atiendes")).toHaveCount(0);
});

test("CA-47 y CA-75: en solo lectura los campos están deshabilitados y se hallan por su etiqueta dentro de su región", async ({
  page,
}) => {
  const world = await createProfileWorld("view-readonly");
  const user = await addMember(world, "USER", { label: "view-readonly" });

  await loginAndOpenProfile(page, user);

  const personal = region(page, "Datos personales");
  await expect(personal.getByLabel("Nombre", { exact: true })).toBeDisabled();
  await expect(personal.getByLabel("Apellido", { exact: true })).toBeDisabled();
  await expect(personal.getByLabel("Celular", { exact: true })).toBeDisabled();
  await expect(personal.getByLabel("Código de país")).toBeDisabled();
  await expect(personal.getByRole("button", { name: "Editar" })).toBeVisible();
  await expect(personal.getByText(user.email, { exact: true })).toBeVisible();
  await expect(personal.getByText(EMAIL_HELP)).toBeVisible();
  await expect(
    personal.getByRole("textbox", { name: "Correo electrónico" }),
  ).toHaveCount(0);
});

test("CA-48: el médico ve «Tratamiento», su ayuda, la frase para pacientes y la vista previa", async ({
  page,
}) => {
  const world = await createProfileWorld("view-doctor");
  const user = await addDoctor(world, {
    label: "view-doctor",
    name: NAME,
    lastName: LAST_NAME,
    treatment: "DRA",
    specialtyIds: [world.specialtyId],
  });

  await loginAndOpenProfile(page, user);

  const personal = region(page, "Datos personales");
  const treatment = personal.getByLabel("Tratamiento", { exact: true });
  await expect(treatment).toBeDisabled();
  await expect(treatment.getByRole("option")).toHaveText([
    "Sin tratamiento",
    "Dr.",
    "Dra.",
  ]);
  await expect(treatment).toHaveValue("DRA");
  await expect(
    personal.getByText(
      "Opcional. Sin tratamiento, tus pacientes ven solo tu nombre.",
    ),
  ).toBeVisible();
  await expect(personal.getByText(PATIENT_VISIBLE_SENTENCE)).toBeVisible();
  await expect(
    personal.getByText(
      `Así te ven tus pacientes al reservar: Dra. ${FULL_NAME}`,
    ),
  ).toBeVisible();
});

test("CA-49: un USER no ve nada del médico (el ADMIN de la organización, sólo si atiende: ver profile-admin-specialties.spec.ts)", async ({
  page,
}) => {
  const world = await createProfileWorld("view-nodoctor");
  const receptionist = await addMember(world, "USER", {
    label: "view-nodoctor",
  });

  for (const user of [receptionist]) {
    await loginAndOpenProfile(page, user);

    await expect(region(page, "Datos personales")).toBeVisible();
    await expect(region(page, "Contraseña")).toBeVisible();
    await expect(page.getByLabel("Tratamiento", { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText(/Así te ven tus pacientes/)).toHaveCount(0);
    await expect(page.getByText(PATIENT_VISIBLE_SENTENCE)).toHaveCount(0);
    await expect(page.getByText("Dónde atiendes")).toHaveCount(0);

    await page.context().clearCookies();
  }
});

test("CA-59 y CA-75: «Dónde atiendes» muestra la sede, su organización, las especialidades en chips y la nota del administrador", async ({
  page,
}) => {
  const world = await createProfileWorld("view-where");
  const user = await addDoctor(world, {
    label: "view-where",
    specialtyIds: [world.specialtyId],
  });

  await loginAndOpenProfile(page, user);

  const where = region(page, "Dónde atiendes");
  await expect(
    where.getByText(world.clinicName, { exact: true }),
  ).toBeVisible();
  await expect(
    where.getByText(world.organizationName, { exact: true }),
  ).toBeVisible();
  await expect(where.getByRole("listitem")).toHaveText([world.specialtyName]);
  await expect(
    where.getByText("Te las asigna un administrador."),
  ).toBeVisible();
});

test("CA-60: una sede sin especialidad explica quién debe asignarla y no muestra chips", async ({
  page,
}) => {
  const world = await createProfileWorld("view-nospec");
  const user = await addDoctor(world, { label: "view-nospec" });

  await loginAndOpenProfile(page, user);

  const where = region(page, "Dónde atiendes");
  await expect(
    where.getByText(
      `Aún no tienes una especialidad asignada. Un administrador de ${world.clinicName} tiene que asignártela.`,
    ),
  ).toBeVisible();
  await expect(where.getByRole("listitem")).toHaveCount(0);
  await expect(where.getByText("Te las asigna un administrador.")).toHaveCount(
    0,
  );
});

test("CA-61: con dos sedes, el enlace de la segunda abre el editor de disponibilidad de esa sede", async ({
  page,
}) => {
  const world = await createProfileWorld("view-two");
  const user = await addDoctor(world, {
    label: "view-two",
    specialtyIds: [world.specialtyId],
  });
  const secondClinicName = uniqueName("Sede-segunda");
  const secondClinicId = await addDoctorToSecondClinic(
    world,
    user,
    secondClinicName,
    [],
  );

  await loginAndOpenProfile(page, user);

  const where = region(page, "Dónde atiendes");
  await expect(
    where.getByText(secondClinicName, { exact: true }),
  ).toBeVisible();
  await expect(
    where.getByRole("link", { name: "Mi disponibilidad en esta sede →" }),
  ).toHaveCount(2);

  await where
    .locator(`a[href$="/clinic/${secondClinicId}/profile/availability"]`)
    .click();

  await expect(page).toHaveURL(
    new RegExp(
      `/account/${user.accountId}/clinic/${secondClinicId}/profile/availability$`,
    ),
  );
  await expect(
    page.getByRole("heading", { name: "Mi Disponibilidad" }),
  ).toBeVisible();
});

test("CA-62: no aparece nada que el plan dejó fuera", async ({ page }) => {
  const world = await createProfileWorld("view-out");
  const user = await addDoctor(world, {
    label: "view-out",
    specialtyIds: [world.specialtyId],
  });

  await loginAndOpenProfile(page, user);

  const where = region(page, "Dónde atiendes");
  await expect(where).toBeVisible();
  await expect(where.getByRole("button")).toHaveCount(0);
  await expect(page.getByText("Asignar especialidad")).toHaveCount(0);
  await expect(page.getByText("+ Crear especialidad")).toHaveCount(0);
  await expect(page.getByText("Probar error")).toHaveCount(0);
});

test("CA-76: en una cuenta Gratis la página funciona entera, sin aviso de mejora de plan", async ({
  page,
}) => {
  const world = await createProfileWorld("view-free");
  const user = await addDoctor(world, {
    label: "view-free",
    specialtyIds: [world.specialtyId],
  });

  await loginAndOpenProfile(page, user);

  await expect(region(page, "Datos personales")).toBeVisible();
  await expect(region(page, "Dónde atiendes")).toBeVisible();
  await expect(region(page, "Contraseña")).toBeVisible();
  await expect(
    page.getByText("Tu plan no permite hacer uso de esta función"),
  ).toHaveCount(0);
  await expect(page.getByText("Algo salió mal")).toHaveCount(0);
});
