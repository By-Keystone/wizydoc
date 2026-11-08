import { expect, test } from "../../support/test";

const SIGN_UP_PROGRESS_WITH_TOKEN = {
  email: "lucia.paredes@gmail.com",
  codeRequestedAt: Date.now(),
  verificationToken: "t".repeat(43),
};

test("con BACKEND=api, /register muestra el formulario de hoy aunque haya una cookie de avance con token", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "sign_up_progress",
      value: encodeURIComponent(JSON.stringify(SIGN_UP_PROGRESS_WITH_TOKEN)),
      domain: "localhost",
      path: "/register",
    },
  ]);

  await page.goto("/register");

  await expect(page.getByLabel("Nombre", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Apellido", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Celular", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Crear cuenta", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar" })).toHaveCount(0);
});
