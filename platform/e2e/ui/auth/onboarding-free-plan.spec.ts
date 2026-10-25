import type { Page } from "@playwright/test";
import { test, expect } from "../../support/test";
import { createApiContext } from "../../support/accounts";
import { createConfirmedUser, uniqueName } from "../../support/users";
import { loginViaUi } from "../../support/ui";
import { getTestPrisma } from "../../support/db";

/** docs/features/beta-free-plan-only/plan.md — CA-11 a CA-14 ([e2e]). */

async function loginAsAccountlessUser(
  page: Page,
  emailPrefix: string,
): Promise<void> {
  const apiContext = await createApiContext();
  const { email } = await createConfirmedUser(apiContext, { emailPrefix });
  await loginViaUi(page, email, /\/onboarding$/);
}

test.describe("Onboarding de platform: sólo Gratis, sin tarjeta", () => {
  test("CA-11: no hay campo de plan: se ve la frase de la beta y el formulario envía plan=FREE", async ({
    page,
  }) => {
    await loginAsAccountlessUser(page, "ca11");

    await expect(
      page.getByRole("heading", { name: "Ponle nombre a tu consultorio" }),
    ).toBeVisible();
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(page.getByLabel("Plan")).toHaveCount(0);
    await expect(
      page.getByText(
        "Durante la beta, todas las cuentas empiezan en Gratis y los planes de pago se activan a pedido.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator('input[type="hidden"][name="plan"]')).toHaveValue(
      "FREE",
    );
  });

  test("CA-12: no se pide nada de facturación y el botón dice Continuar", async ({
    page,
  }) => {
    await loginAsAccountlessUser(page, "ca12");

    await expect(page.getByLabel("Dirección de facturación")).toHaveCount(0);
    await expect(page.getByLabel("Ciudad")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Continuar", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continuar al pago" }),
    ).toHaveCount(0);
  });

  test("CA-13: el alta se completa sin ninguna petición a Culqi", async ({
    page,
  }) => {
    const culqiRequestUrls: string[] = [];
    await page.route(/culqi\.com/, (route) => {
      culqiRequestUrls.push(route.request().url());
      return route.abort();
    });

    await loginAsAccountlessUser(page, "ca13");

    const accountName = uniqueName("Consultorio CA-13");
    await page.getByLabel("Nombre del consultorio").fill(accountName);

    const continueButton = page.getByRole("button", {
      name: "Continuar",
      exact: true,
    });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    await expect(page).toHaveURL(/\/account\/[^/]+\/select$/);
    expect(culqiRequestUrls).toEqual([]);

    const prisma = await getTestPrisma();
    const account = await prisma.account.findFirst({
      where: { name: accountName },
    });
    expect(account).not.toBeNull();

    const subscription = await prisma.subscription.findUnique({
      where: { accountId: account!.id },
    });
    expect(subscription?.plan).toBe("FREE");
    expect(subscription?.status).toBe("ACTIVE");
    expect(subscription?.paymentProviderCustomerId).toBeNull();
    expect(subscription?.paymentProviderCardId).toBeNull();
    expect(subscription?.paymentProviderSubscriptionId).toBeNull();
  });

  test("CA-14: sin nombre de consultorio, el error sale debajo del campo y el foco va al nombre", async ({
    page,
  }) => {
    await loginAsAccountlessUser(page, "ca14");

    await page.getByRole("button", { name: "Continuar", exact: true }).click();

    await expect(page).toHaveURL(/\/onboarding$/);
    const nameInput = page.getByLabel("Nombre del consultorio");
    const nameError = page
      .getByRole("alert")
      .filter({ hasText: "Escribe el nombre de tu consultorio." });
    await expect(nameError).toBeVisible();
    await expect(nameInput).toBeFocused();
    await expect(nameInput).toHaveAttribute("aria-invalid", "true");
    await expect(nameInput).toHaveAttribute(
      "aria-describedby",
      (await nameError.getAttribute("id")) ?? "",
    );
  });
});
