import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, uniqueEmail } from "../../support/users";

// docs/features/fix-auth-rate-limit-ip/plan.md — CA-14.

const TOO_MANY_ATTEMPTS =
  "Hiciste varios intentos seguidos. Espera un minuto y vuelve a intentarlo.";

test("CA-14: un 429 al iniciar sesión muestra el aviso en español y permite reintentar", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/auth/sign-in/email", async (route) => {
    attempts += 1;
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      headers: { "X-Retry-After": "60" },
      body: JSON.stringify({
        message: "Too many requests. Please try again later.",
      }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(uniqueEmail("limite"));
  await page.getByLabel("Contraseña").fill(E2E_PASSWORD);
  const submit = page.getByRole("button", { name: "Iniciar sesión" });
  await submit.click();

  await expect(
    page.getByText(TOO_MANY_ATTEMPTS, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Too many requests", { exact: false }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/login/);

  await expect(submit).toBeEnabled();
  await submit.click();
  await expect.poll(() => attempts).toBe(2);
});
