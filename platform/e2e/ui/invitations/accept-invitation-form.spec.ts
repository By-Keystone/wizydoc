import {
  createApiContext,
  createClinicResource,
  createOnboardedAdmin,
  createOrganizationResource,
} from "../../support/accounts";
import {
  alertWith,
  expectBelow,
  expectDescribedBy,
  expectFocusReturnsOnRepeatedError,
  holdRequests,
  LONG_PASSWORD_ERROR,
  passwordField,
  SHORT_PASSWORD_ERROR,
  TOO_LONG_PASSWORD,
  trackCalls,
} from "../../support/entry-forms";
import { invitePendingUser } from "../../support/invitations";
import { expect, test } from "../../support/test";
import { authPost, E2E_PASSWORD, uniqueName } from "../../support/users";

// Textos y errores de la pantalla de invitación.

const SET_PASSWORD_URL = "**/api/invitations/set-password";
const INTERNAL_SERVER_DETAIL = "connect ECONNREFUSED 10.0.3.7:5432";
const USED_LINK_API_MESSAGE =
  "El enlace de invitación no es válido o ya expiró";

async function createPendingUserInvitation(emailPrefix: string) {
  const admin = await createOnboardedAdmin({
    emailPrefix: `admin-${emailPrefix}`,
  });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName("ORG-FORM"),
  );
  const clinicId = await createClinicResource(admin, organizationId, {
    name: uniqueName("Sede FORM"),
  });
  return invitePendingUser(admin, {
    resourceId: clinicId,
    role: "USER",
    emailPrefix,
  });
}

test("la contraseña corta o larga se rechaza en el cliente, con el error debajo del campo y sin enviar nada", async ({
  page,
}) => {
  const invited = await createPendingUserInvitation("usuario-form-clave");
  const setPasswordCalls = trackCalls(page, "/api/invitations/set-password");
  await page.goto(`/invite/accept?token=${invited.token}`);

  const activateButton = page.getByRole("button", {
    name: "Activar cuenta",
    exact: true,
  });
  await activateButton.click();
  const shortError = alertWith(page, SHORT_PASSWORD_ERROR);
  await expect(shortError).toBeVisible();
  await expectBelow(shortError, passwordField(page));
  await expectDescribedBy(passwordField(page), shortError);
  await expect(passwordField(page)).toBeFocused();

  await passwordField(page).fill(TOO_LONG_PASSWORD);
  await activateButton.click();
  await expect(alertWith(page, LONG_PASSWORD_ERROR)).toBeVisible();
  await expect(passwordField(page)).toBeFocused();

  expect(setPasswordCalls).toHaveLength(0);
});

test("si el enlace se usa en otra parte mientras la pantalla está abierta, la caja de error muestra el mensaje del api", async ({
  page,
}) => {
  const invited = await createPendingUserInvitation("usuario-form-usado");
  await page.goto(`/invite/accept?token=${invited.token}`);
  await authPost(await createApiContext(), "/invitations/set-password", {
    token: invited.token,
    password: E2E_PASSWORD,
  });

  await passwordField(page).fill("Otra-Clave-2026");
  await page.getByRole("button", { name: "Activar cuenta" }).click();

  await expect(alertWith(page, USED_LINK_API_MESSAGE)).toBeVisible();
  await expect(page).toHaveURL(/\/invite\/accept/);
  await expect(
    page.getByRole("button", { name: "Activar cuenta", exact: true }),
  ).toBeEnabled();
});

test("mientras activa la cuenta, el botón queda deshabilitado con «Activando…»", async ({
  page,
}) => {
  const invited = await createPendingUserInvitation("usuario-form-espera");
  const releaseSetPassword = await holdRequests(page, SET_PASSWORD_URL);
  await page.goto(`/invite/accept?token=${invited.token}`);

  await passwordField(page).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Activar cuenta" }).click();

  const waitingButton = page.getByRole("button", {
    name: "Activando…",
    exact: true,
  });
  await expect(waitingButton).toBeVisible();
  await expect(waitingButton).toBeDisabled();

  releaseSetPassword();
  await expect(page).toHaveURL(/\/account\/[^/]+\/clinic\/[^/]+\/dashboard$/);
});

test("un enlace que no existe explica que ya se usó o no es válido y ofrece «Ir a iniciar sesión»", async ({
  page,
}) => {
  await page.goto("/invite/accept?token=enlace-que-no-existe");

  await expect(
    page.getByRole("heading", { name: "Invitación inválida" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Este enlace ya se usó o no es válido. Si ya creaste tu contraseña, inicia sesión con ella.",
      { exact: true },
    ),
  ).toBeVisible();

  await page
    .getByRole("link", { name: "Ir a iniciar sesión", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
});

test("el mismo error de contraseña dos veces devuelve el foco al campo", async ({
  page,
}) => {
  const invited = await createPendingUserInvitation("usuario-form-foco");
  await page.goto(`/invite/accept?token=${invited.token}`);
  const activateButton = page.getByRole("button", {
    name: "Activar cuenta",
    exact: true,
  });
  await activateButton.click();
  await expect(alertWith(page, SHORT_PASSWORD_ERROR)).toBeVisible();

  await expectFocusReturnsOnRepeatedError(activateButton, passwordField(page));
});

test("un 5xx al activar la cuenta muestra el aviso genérico y nunca el texto del servidor", async ({
  page,
}) => {
  const invited = await createPendingUserInvitation("usuario-form-5xx");
  await page.route(SET_PASSWORD_URL, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: INTERNAL_SERVER_DETAIL }),
    }),
  );
  await page.goto(`/invite/accept?token=${invited.token}`);

  await passwordField(page).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Activar cuenta" }).click();

  await expect(
    alertWith(page, "No se pudo configurar la contraseña"),
  ).toBeVisible();
  await expect(page.getByText(INTERNAL_SERVER_DETAIL)).toHaveCount(0);
  await expect(page).toHaveURL(/\/invite\/accept/);
  await expect(
    page.getByRole("button", { name: "Activar cuenta", exact: true }),
  ).toBeEnabled();
});

test("/invite/accept no se indexa ni manda el token en el Referer, con enlace válido o no", async ({
  page,
}) => {
  const invited = await createPendingUserInvitation("usuario-form-meta");

  for (const token of [invited.token, "enlace-que-no-existe"]) {
    await page.goto(`/invite/accept?token=${token}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
      "content",
      "no-referrer",
    );
  }
});
