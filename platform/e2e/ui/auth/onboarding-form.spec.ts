import { createApiContext } from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { API_BASE_URL } from "../../support/env";
import {
  alertWith,
  expectBelow,
  expectDescribedBy,
  expectFocusReturnsOnRepeatedError,
} from "../../support/entry-forms";
import { expect, test } from "../../support/test";
import { loginViaUi } from "../../support/ui";
import { createConfirmedUser, uniqueName } from "../../support/users";

// Error general del onboarding.

// Postgres rechaza el carácter NUL en un texto: es la forma real de provocar un 500 del api.
const NAME_THAT_BREAKS_THE_API = "Consultorio\u0000raro";
const DATABASE_ERROR_DETAIL = "invalid byte sequence";

test("un fallo del api al crear la cuenta sale en la caja de error, sin toast, y conserva el nombre escrito", async ({
  page,
}) => {
  const apiContext = await createApiContext();
  const { email } = await createConfirmedUser(apiContext, {
    emailPrefix: "onboarding-error",
  });
  await loginViaUi(page, email, /\/onboarding$/);

  const accountFromOtherTab = await apiContext.post(`${API_BASE_URL}/account`, {
    data: { accountName: uniqueName("Consultorio otra pestaña") },
  });
  expect(accountFromOtherTab.status()).toBe(201);

  const typedName = uniqueName("Consultorio Dra. Quispe");
  const nameInput = page.getByLabel("Nombre del consultorio");
  await nameInput.fill(typedName);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();

  await expect(
    alertWith(page, "Tu usuario ya pertenece a una cuenta"),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(nameInput).toHaveValue(typedName);
  await expect(nameInput).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
});

test("un nombre de sólo espacios se rechaza debajo del campo, devuelve el foco cada vez y no crea la cuenta", async ({
  page,
}) => {
  const { email, userId } = await createConfirmedUser(
    await createApiContext(),
    { emailPrefix: "onboarding-espacios" },
  );
  await loginViaUi(page, email, /\/onboarding$/);

  const nameInput = page.getByLabel("Nombre del consultorio");
  const continueButton = page.getByRole("button", {
    name: "Continuar",
    exact: true,
  });
  await nameInput.fill("   ");
  await continueButton.click();

  const nameError = alertWith(page, "Escribe el nombre de tu consultorio.");
  await expect(nameError).toBeVisible();
  await expectBelow(nameError, nameInput);
  await expectDescribedBy(nameInput, nameError);
  await expectFocusReturnsOnRepeatedError(continueButton, nameInput);

  await expect(page).toHaveURL(/\/onboarding$/);
  const prisma = await getTestPrisma();
  expect(await prisma.account.count({ where: { ownerId: userId } })).toBe(0);
});

test("un 5xx del api sale como aviso genérico, nunca con el texto del servidor", async ({
  page,
}) => {
  const { email, userId } = await createConfirmedUser(
    await createApiContext(),
    { emailPrefix: "onboarding-5xx" },
  );
  await loginViaUi(page, email, /\/onboarding$/);

  const nameInput = page.getByLabel("Nombre del consultorio");
  await nameInput.evaluate((input: HTMLInputElement, name) => {
    input.value = name;
  }, NAME_THAT_BREAKS_THE_API);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();

  await expect(
    alertWith(page, "No pudimos crear tu cuenta. Vuelve a intentarlo."),
  ).toBeVisible();
  await expect(page.getByText(DATABASE_ERROR_DETAIL)).toHaveCount(0);
  await expect(page).toHaveURL(/\/onboarding$/);
  const prisma = await getTestPrisma();
  expect(await prisma.account.count({ where: { ownerId: userId } })).toBe(0);
});
