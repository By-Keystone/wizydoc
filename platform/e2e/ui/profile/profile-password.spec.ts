import type { Page } from "@playwright/test";
import { createApiContext } from "../../support/accounts";
import { loginAndGoTo } from "../../support/ui";
import { expect, test } from "../../support/test";
import {
  addMember,
  createProfileWorld,
  loginAndOpenProfile,
  type ProfileUser,
} from "../../support/profile";
import { authPost, E2E_PASSWORD, signIn } from "../../support/users";

// docs/features/perfil-usuario/plan.md — PR 4, CA-63 a CA-70.

const NEW_PASSWORD = "Otra-Clave-Nueva-2026";
const SUCCESS =
  "Cambiaste tu contraseña. Cerramos tu sesión en tus otros dispositivos.";
const SHORT_ERROR = "Tu contraseña nueva debe tener al menos 8 caracteres.";
const LONG_ERROR = "Tu contraseña nueva puede tener hasta 128 caracteres.";

const card = (page: Page) =>
  page.getByRole("region", { name: "Contraseña", exact: true });
const openButton = (page: Page) =>
  card(page).getByRole("button", { name: "Cambiar contraseña", exact: true });
const currentField = (page: Page) =>
  card(page).getByLabel("Contraseña actual", { exact: true });
const newField = (page: Page) =>
  card(page).getByLabel("Contraseña nueva", { exact: true });
const toast = (page: Page, text: string) =>
  page.getByText(text, { exact: true }).first();

async function openPasswordForm(page: Page, label: string) {
  const world = await createProfileWorld(label);
  const user = await addMember(world, "USER", { label });
  await loginAndOpenProfile(page, user);
  await openButton(page).click();
  return user;
}

async function submit(page: Page, current: string, next: string) {
  await currentField(page).fill(current);
  await newField(page).fill(next);
  await card(page)
    .getByRole("button", { name: "Cambiar contraseña", exact: true })
    .click();
}

test("CA-63: «Cambiar contraseña» despliega los dos campos, sin repetir la nueva, con el foco en la actual", async ({
  page,
}) => {
  await openPasswordForm(page, "pwd-open");

  await expect(currentField(page)).toBeFocused();
  await expect(newField(page)).toHaveAttribute(
    "placeholder",
    "Mínimo 8 caracteres",
  );
  await expect(card(page).locator("input")).toHaveCount(2);
});

test("CA-64: «Mostrar» y «Ocultar» cambian el tipo de cada campo con etiquetas accesibles", async ({
  page,
}) => {
  await openPasswordForm(page, "pwd-toggle");

  await expect(currentField(page)).toHaveAttribute("type", "password");
  await card(page)
    .getByRole("button", { name: "Mostrar contraseña actual", exact: true })
    .click();
  await expect(currentField(page)).toHaveAttribute("type", "text");
  await expect(newField(page)).toHaveAttribute("type", "password");
  await expect(
    card(page).getByRole("button", {
      name: "Ocultar contraseña actual",
      exact: true,
    }),
  ).toBeVisible();

  await card(page)
    .getByRole("button", { name: "Mostrar contraseña nueva", exact: true })
    .click();
  await expect(newField(page)).toHaveAttribute("type", "text");

  await card(page)
    .getByRole("button", { name: "Ocultar contraseña actual", exact: true })
    .click();
  await expect(currentField(page)).toHaveAttribute("type", "password");
});

test("CA-65: con la contraseña actual incorrecta se avisa bajo el campo y la anterior sigue sirviendo", async ({
  page,
}) => {
  const user = await openPasswordForm(page, "pwd-wrong");

  await submit(page, "Clave-que-no-es-2026", NEW_PASSWORD);

  await expect(
    card(page).getByText("La contraseña actual no es correcta.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(currentField(page)).toHaveAttribute("aria-invalid", "true");

  const context = await createApiContext();
  await signIn(context, user.email, E2E_PASSWORD);
});

test("CA-66: una nueva de 7 caracteres y la actual vacía se validan sin llamar a change-password", async ({
  page,
}) => {
  await openPasswordForm(page, "pwd-short");
  const changePasswordCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("change-password")) {
      changePasswordCalls.push(request.url());
    }
  });

  await newField(page).fill("1234567");
  await card(page)
    .getByRole("button", { name: "Cambiar contraseña", exact: true })
    .click();

  await expect(
    card(page).getByText(SHORT_ERROR, { exact: true }),
  ).toBeVisible();
  await expect(
    card(page).getByText("Ingresa tu contraseña actual.", { exact: true }),
  ).toBeVisible();
  await expect(currentField(page)).toBeFocused();
  expect(changePasswordCalls).toEqual([]);
});

test("CA-67: una nueva de 129 caracteres muestra el límite", async ({
  page,
}) => {
  await openPasswordForm(page, "pwd-long");

  await submit(page, E2E_PASSWORD, "a".repeat(129));

  await expect(card(page).getByText(LONG_ERROR, { exact: true })).toBeVisible();
  await expect(newField(page)).toHaveAttribute("aria-invalid", "true");
});

test("CA-68: al cambiarla bien se avisa, el formulario se pliega vacío y la sesión sigue", async ({
  page,
}) => {
  await openPasswordForm(page, "pwd-success");

  await submit(page, E2E_PASSWORD, NEW_PASSWORD);

  await expect(toast(page, SUCCESS)).toBeVisible();
  await expect(currentField(page)).toHaveCount(0);
  await expect(openButton(page)).toBeVisible();

  await page.reload();
  await expect(page).not.toHaveURL(/\/login/);
  await expect(card(page)).toBeVisible();

  await openButton(page).click();
  await expect(currentField(page)).toHaveValue("");
  await expect(newField(page)).toHaveValue("");
});

test("CA-69: las demás sesiones se cierran, se entra con la nueva y la anterior falla", async ({
  page,
  browser,
}) => {
  const world = await createProfileWorld("pwd-sessions");
  const user: ProfileUser = await addMember(world, "USER", {
    label: "pwd-sessions",
  });

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  try {
    await loginAndGoTo(otherPage, user.email, `/account/${user.accountId}/me`);
    await expect(otherPage.getByRole("heading", { level: 1 })).toBeVisible();

    await loginAndOpenProfile(page, user);
    await openButton(page).click();
    await submit(page, E2E_PASSWORD, NEW_PASSWORD);
    await expect(toast(page, SUCCESS)).toBeVisible();

    await otherPage.goto(`/account/${user.accountId}/me`);
    await expect(otherPage).toHaveURL(/\/login/);
  } finally {
    await otherContext.close();
  }

  const fresh = await createApiContext();
  const oldAttempt = await authPost(fresh, "/api/auth/sign-in/email", {
    email: user.email,
    password: E2E_PASSWORD,
  });
  expect(oldAttempt.ok()).toBe(false);

  const newAttempt = await authPost(fresh, "/api/auth/sign-in/email", {
    email: user.email,
    password: NEW_PASSWORD,
  });
  expect(newAttempt.ok()).toBe(true);
});

test("CA-70: «Cancelar» pliega el formulario y lo vacía", async ({ page }) => {
  await openPasswordForm(page, "pwd-cancel");

  await currentField(page).fill("algo escrito");
  await newField(page).fill("otra cosa escrita");
  await card(page)
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();

  await expect(currentField(page)).toHaveCount(0);
  await expect(openButton(page)).toBeFocused();

  await openButton(page).click();
  await expect(currentField(page)).toHaveValue("");
  await expect(newField(page)).toHaveValue("");
});

test("CA-15: un 429 al cambiar la contraseña muestra el aviso en español y el formulario sigue abierto", async ({
  page,
}) => {
  await openPasswordForm(page, "pwd-429");
  await page.route("**/api/auth/change-password", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Too many requests. Please try again later.",
      }),
    }),
  );

  await submit(page, E2E_PASSWORD, NEW_PASSWORD);

  await expect(
    toast(
      page,
      "Hiciste varios intentos seguidos. Espera un minuto y vuelve a intentarlo.",
    ),
  ).toBeVisible();
  await expect(currentField(page)).toBeVisible();
  await expect(newField(page)).toBeVisible();
});
