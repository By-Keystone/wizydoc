import type { Page } from "@playwright/test";
import { PLATFORM_BASE_URL } from "../../support/env";
import {
  addDoctor,
  addMember,
  createProfileWorld,
  type ProfileUser,
  type ProfileWorld,
} from "../../support/profile";
import { expect, test } from "../../support/test";
import { loginViaUi } from "../../support/ui";

// docs/features/perfil-usuario/plan.md — PR 5, CA-78 a CA-93.

const NAME = "Marta";
const LAST_NAME = "Quispe";
const FULL_NAME = `${NAME} ${LAST_NAME}`;
const MOBILE = { width: 375, height: 812 };

type Place = "select" | "clinic" | "organization";

const accountButton = (page: Page, fullName = FULL_NAME) =>
  page.getByRole("button", { name: `Tu cuenta: ${fullName}`, exact: true });

const menuItem = (page: Page, name: string) =>
  page.getByRole("menuitem", { name, exact: true });

const desktopSidebar = (page: Page) => page.getByRole("complementary");

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

async function resourceCookies(page: Page) {
  const cookies = await page.context().cookies(PLATFORM_BASE_URL);
  return cookies.filter(
    (cookie) =>
      cookie.name === "resource_id" || cookie.name === "resource_type",
  );
}

async function signInAt(
  page: Page,
  user: ProfileUser,
  world: ProfileWorld,
  place: Place,
) {
  await loginViaUi(
    page,
    user.email,
    new RegExp(`/account/${user.accountId}/select$`),
  );
  if (place === "select") return;

  const isClinic = place === "clinic";
  const resourceId = isClinic ? world.clinicId : world.organizationId;
  await page.context().addCookies([
    {
      name: "resource_id",
      value: resourceId,
      url: PLATFORM_BASE_URL,
      sameSite: "Lax",
    },
    {
      name: "resource_type",
      value: isClinic ? "CLINIC" : "ORGANIZATION",
      url: PLATFORM_BASE_URL,
      sameSite: "Lax",
    },
  ]);
  await page.goto(
    isClinic
      ? `/account/${user.accountId}/clinic/${resourceId}/dashboard`
      : `/account/${user.accountId}/organization/${resourceId}/clinics`,
  );
}

async function marta(label: string, role: "USER" | "DOCTOR" = "USER") {
  const world = await createProfileWorld(label);
  const options = { label, name: NAME, lastName: LAST_NAME };
  const user =
    role === "DOCTOR"
      ? await addDoctor(world, { ...options, treatment: "DRA" })
      : await addMember(world, "USER", options);
  return { world, user };
}

test("CA-78, CA-79 y CA-80: en /select, en la computadora, el avatar muestra el nombre completo y abre el menú sin «Cambiar de sede»", async ({
  page,
}) => {
  const { world, user } = await marta("nav-select");
  await signInAt(page, user, world, "select");

  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toHaveCount(
    0,
  );
  const button = accountButton(page);
  await expect(button).toBeVisible();
  await expect(button.getByText(FULL_NAME, { exact: true })).toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "false");

  await button.click();

  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(FULL_NAME, { exact: true })).toHaveCount(2);
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await expect(menuItem(page, "Mi perfil")).toBeVisible();
  await expect(menuItem(page, "Cerrar sesión")).toBeVisible();
  await expect(menuItem(page, "Cambiar de sede")).toHaveCount(0);

  await menuItem(page, "Mi perfil").click();
  await expect(page).toHaveURL(new RegExp(`/account/${user.accountId}/me$`));
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("CA-79: en /select, a 375 px, el avatar muestra sólo el nombre de pila", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  const { world, user } = await marta("nav-select-mobile");
  await signInAt(page, user, world, "select");

  const button = accountButton(page);
  await expect(button.getByText(NAME, { exact: true })).toBeVisible();
  await expect(button.getByText(FULL_NAME, { exact: true })).toBeHidden();
});

test("CA-81: Escape devuelve el foco al avatar, las flechas mueven el foco y un clic fuera cierra", async ({
  page,
}) => {
  const { world, user } = await marta("nav-keys");
  await signInAt(page, user, world, "select");
  const button = accountButton(page);

  await button.click();
  await expect(menuItem(page, "Mi perfil")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menuItem(page, "Cerrar sesión")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menuItem(page, "Mi perfil")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(menuItem(page, "Cerrar sesión")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toBeFocused();

  await button.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("img", { name: "WizyDoc" }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("CA-81: a 375 px, Escape cierra sólo el menú del avatar y, con el menú cerrado, cierra el desplegable", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  const { world, user } = await marta("nav-keys-mobile");
  await signInAt(page, user, world, "clinic");

  await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
  const drawer = page.getByRole("dialog");
  const button = drawer.getByRole("button", {
    name: `Tu cuenta: ${FULL_NAME}`,
    exact: true,
  });
  await button.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem")).toHaveText([
    "Mi perfil",
    "Cambiar de sede",
    "Cerrar sesión",
  ]);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(drawer).toBeVisible();
  await expect(button).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("CA-82: «Cerrar sesión» desde /select lleva a /login y el panel vuelve a pedir sesión", async ({
  page,
}) => {
  const { world, user } = await marta("nav-signout-select");
  await signInAt(page, user, world, "select");

  await accountButton(page).click();
  await menuItem(page, "Cerrar sesión").click();

  await expect(page).toHaveURL(/\/login$/);
  await page.goto(`/account/${user.accountId}/select`);
  await expect(page).toHaveURL(/\/login/);
});

test("CA-82: «Cerrar sesión» desde la sede borra las cookies de sede y el panel vuelve a pedir sesión", async ({
  page,
}) => {
  const { world, user } = await marta("nav-signout-clinic");
  await signInAt(page, user, world, "clinic");
  expect(await resourceCookies(page)).toHaveLength(2);

  await accountButton(page).click();
  await menuItem(page, "Cerrar sesión").click();

  await expect(page).toHaveURL(/\/login$/);
  expect(await resourceCookies(page)).toHaveLength(0);
  await page.goto(
    `/account/${user.accountId}/clinic/${world.clinicId}/dashboard`,
  );
  await expect(page).toHaveURL(/\/login/);
});

test("CA-83 y CA-84: en la sede, el pie del menú lateral tiene el avatar con el nombre y la sede, y «Mi perfil» lo deja activo", async ({
  page,
}) => {
  const { world, user } = await marta("nav-clinic");
  await signInAt(page, user, world, "clinic");

  const sidebar = desktopSidebar(page);
  const button = accountButton(page);
  await expect(button).toBeVisible();
  await expect(button.getByText(FULL_NAME, { exact: true })).toBeVisible();
  await expect(
    button.getByText(world.clinicName, { exact: true }),
  ).toBeVisible();
  await expect(sidebar.getByText("Selección de recursos")).toHaveCount(0);
  await expect(
    sidebar.getByRole("button", { name: "Cerrar sesión" }),
  ).toHaveCount(0);
  const idleBackground = await button.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  await button.click();
  await expect(menuItem(page, "Mi perfil")).toBeVisible();
  await expect(menuItem(page, "Cambiar de sede")).toBeVisible();
  await expect(menuItem(page, "Cerrar sesión")).toBeVisible();

  await menuItem(page, "Mi perfil").click();
  await expect(page).toHaveURL(
    new RegExp(`/account/${user.accountId}/clinic/${world.clinicId}/me$`),
  );
  await expect(
    page.getByRole("heading", { level: 1, name: FULL_NAME }),
  ).toBeVisible();
  await expect(button).not.toHaveCSS("background-color", idleBackground);
});

test("CA-85: en la organización, el pie muestra su nombre y «Cambiar de sede» borra las cookies y lleva a /select", async ({
  page,
}) => {
  const world = await createProfileWorld("nav-org");
  const admin = {
    email: world.admin.email,
    userId: world.admin.userId,
    accountId: world.admin.accountId,
    name: world.admin.name,
    lastName: world.admin.lastName,
  };
  await signInAt(page, admin, world, "organization");

  const button = accountButton(page, `${admin.name} ${admin.lastName}`);
  await expect(
    button.getByText(world.organizationName, { exact: true }),
  ).toBeVisible();

  await button.click();
  await expect(menuItem(page, "Mi perfil")).toBeVisible();
  await menuItem(page, "Cambiar de sede").click();

  await expect(page).toHaveURL(
    new RegExp(`/account/${admin.accountId}/select$`),
  );
  expect(await resourceCookies(page)).toHaveLength(0);
});

test("CA-86 y CA-93: a 375 px, el menú desplegable tiene el avatar al pie, no desborda y «Mi perfil» navega y lo cierra", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  const { world, user } = await marta("nav-mobile");
  await signInAt(page, user, world, "clinic");

  await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  const button = drawer.getByRole("button", {
    name: `Tu cuenta: ${FULL_NAME}`,
    exact: true,
  });
  await expect(button).toBeVisible();
  await button.click();
  await expect(menuItem(page, "Cambiar de sede")).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await menuItem(page, "Mi perfil").click();
  await expect(page).toHaveURL(
    new RegExp(`/account/${user.accountId}/clinic/${world.clinicId}/me$`),
  );
  await expect(drawer).toBeHidden();
});

test("CA-93: a 375 px no hay desplazamiento horizontal en /select con el menú abierto", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  const world = await createProfileWorld("nav-overflow");
  const user = await addMember(world, "USER", {
    label: "nav-overflow",
    name: "W".repeat(60),
    lastName: LAST_NAME,
  });
  await signInAt(page, user, world, "select");

  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await accountButton(page, `${"W".repeat(60)} ${LAST_NAME}`).click();
  await expect(page.getByRole("menu")).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test("CA-87: el avatar y el menú de una médica con «Dra.» muestran su nombre sin tratamiento", async ({
  page,
}) => {
  const { world, user } = await marta("nav-dra", "DOCTOR");
  await signInAt(page, user, world, "clinic");

  const button = accountButton(page);
  await expect(button.getByText(FULL_NAME, { exact: true })).toBeVisible();
  await button.click();
  await expect(page.getByText(FULL_NAME, { exact: true })).toHaveCount(2);
  await expect(page.getByText(/Dra\./)).toHaveCount(0);
});

test("CA-88: tras guardar el perfil en la sede, el avatar muestra el nombre nuevo sin recargar", async ({
  page,
}) => {
  const { world, user } = await marta("nav-rename-clinic");
  await signInAt(page, user, world, "clinic");

  await accountButton(page).click();
  await menuItem(page, "Mi perfil").click();
  const personal = page.getByRole("region", {
    name: "Datos personales",
    exact: true,
  });
  await personal.getByRole("button", { name: "Editar", exact: true }).click();
  await personal.getByLabel("Nombre", { exact: true }).fill("Rosa");
  await personal
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();

  await expect(accountButton(page, `Rosa ${LAST_NAME}`)).toBeVisible();
  await expect(
    accountButton(page, `Rosa ${LAST_NAME}`).getByText(`Rosa ${LAST_NAME}`, {
      exact: true,
    }),
  ).toBeVisible();
});

test("CA-88: tras guardar el perfil bajo los workspaces, el avatar muestra el nombre nuevo sin recargar", async ({
  page,
}) => {
  const { world, user } = await marta("nav-rename-top");
  await signInAt(page, user, world, "select");

  await accountButton(page).click();
  await menuItem(page, "Mi perfil").click();
  const personal = page.getByRole("region", {
    name: "Datos personales",
    exact: true,
  });
  await personal.getByRole("button", { name: "Editar", exact: true }).click();
  await personal.getByLabel("Apellido", { exact: true }).fill("Huamán");
  await personal
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();

  await expect(accountButton(page, `${NAME} Huamán`)).toBeVisible();
});

test("CA-89: el médico ve «Configuración», que lleva a «Mi Disponibilidad», y su menú interno ya no tiene «Mi Perfil»", async ({
  page,
}) => {
  const { world, user } = await marta("nav-config-doctor", "DOCTOR");
  await signInAt(page, user, world, "clinic");

  await page
    .getByRole("link", { name: "Configuración", exact: true })
    .first()
    .click();

  await expect(page).toHaveURL(
    new RegExp(
      `/account/${user.accountId}/clinic/${world.clinicId}/profile/availability$`,
    ),
  );
  await expect(
    page.getByRole("heading", { name: "Mi Disponibilidad" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Mi Perfil", exact: true }),
  ).toHaveCount(0);
});

test("CA-90: la recepción y el administrador de la sede no ven «Configuración»", async ({
  page,
}) => {
  const world = await createProfileWorld("nav-config-others");
  const receptionist = await addMember(world, "USER", {
    label: "nav-config-user",
  });
  const clinicAdmin = await addMember(world, "ADMIN", {
    label: "nav-config-admin",
  });

  for (const user of [receptionist, clinicAdmin]) {
    await signInAt(page, user, world, "clinic");

    await expect(
      page.getByRole("link", { name: "Pacientes", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Configuración", exact: true }),
    ).toHaveCount(0);

    await page.context().clearCookies();
  }
});

test("CA-91: la antigua ruta «profile» de la sede redirige a «me»", async ({
  page,
}) => {
  const { world, user } = await marta("nav-redirect");
  await signInAt(page, user, world, "clinic");

  await page.goto(
    `/account/${user.accountId}/clinic/${world.clinicId}/profile`,
  );

  await expect(page).toHaveURL(
    new RegExp(`/account/${user.accountId}/clinic/${world.clinicId}/me$`),
  );
  await expect(
    page.getByRole("heading", { level: 1, name: FULL_NAME }),
  ).toBeVisible();
});
