import type { Locator } from "@playwright/test";
import { createApiContext } from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import {
  alertWith,
  expectBelow,
  expectDescribedBy,
  expectFocusReturnsOnRepeatedError,
} from "../../support/entry-forms";
import { expect, test } from "../../support/test";
import {
  fillOnboardingForm,
  loginViaUi,
  ONBOARDING_ADDRESS,
} from "../../support/ui";
import { createConfirmedUser, uniqueName } from "../../support/users";

// docs/features/formularios-entrada/plan.md; docs/features/primer-uso/plan.md CA-1 a CA-3 y O-6.

// Postgres rechaza el carácter NUL en un texto: es la forma real de provocar un 500 del api.
const NAME_THAT_BREAKS_THE_API = "Consultorio\u0000raro";
const SPECIALTY_THAT_BREAKS_THE_API = "Dermato\u0000logía";
const DATABASE_ERROR_DETAIL = "invalid byte sequence";
const CREATE_CLINIC = "Crear mi consultorio";
const setValueDirectly = (field: Locator, value: string) =>
  field.evaluate((input: HTMLInputElement, text) => {
    input.value = text;
  }, value);

const ACCOUNT_ONLY_CREATED_ERROR =
  "Tu cuenta quedó creada, pero no pudimos crear tu consultorio. Vuelve a intentarlo.";

test("un fallo del api al crear el consultorio sale en la caja de error, sin toast, y conserva lo escrito", async ({
  page,
}) => {
  const apiContext = await createApiContext();
  const { email, userId } = await createConfirmedUser(apiContext, {
    emailPrefix: "onboarding-error",
  });
  await loginViaUi(page, email, /\/onboarding$/);

  const typedName = uniqueName("Consultorio Dra. Quispe");
  await fillOnboardingForm(page, { name: typedName });
  await setValueDirectly(
    page.getByLabel("Tu especialidad"),
    SPECIALTY_THAT_BREAKS_THE_API,
  );
  await page.getByRole("button", { name: CREATE_CLINIC, exact: true }).click();

  await expect(alertWith(page, ACCOUNT_ONLY_CREATED_ERROR)).toBeVisible();
  await expect(page.getByText(DATABASE_ERROR_DETAIL)).toHaveCount(0);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByLabel("Nombre del consultorio")).toHaveValue(
    typedName,
  );
  await expect(page.getByLabel("Dirección", { exact: true })).toHaveValue(
    ONBOARDING_ADDRESS,
  );
  await expect(page.getByLabel("Tu especialidad")).toHaveValue(
    SPECIALTY_THAT_BREAKS_THE_API,
  );
  await expect(page.getByLabel("Nombre del consultorio")).not.toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);

  const prisma = await getTestPrisma();
  expect(await prisma.account.count({ where: { ownerId: userId } })).toBe(1);
  expect(
    await prisma.clinic.count({
      where: { resource: { account: { ownerId: userId } } },
    }),
  ).toBe(0);
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
    name: CREATE_CLINIC,
    exact: true,
  });
  await fillOnboardingForm(page, { name: "   " });
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
  await fillOnboardingForm(page, { name: "" });
  await setValueDirectly(nameInput, NAME_THAT_BREAKS_THE_API);
  await page.getByRole("button", { name: CREATE_CLINIC, exact: true }).click();

  await expect(
    alertWith(page, "No pudimos crear tu consultorio. Vuelve a intentarlo."),
  ).toBeVisible();
  await expect(page.getByText(DATABASE_ERROR_DETAIL)).toHaveCount(0);
  await expect(page).toHaveURL(/\/onboarding$/);
  const prisma = await getTestPrisma();
  expect(await prisma.account.count({ where: { ownerId: userId } })).toBe(0);
});
