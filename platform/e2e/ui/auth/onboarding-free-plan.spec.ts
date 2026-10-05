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
  test("CA-11: el select de Plan sólo ofrece Gratis", async ({ page }) => {
    await loginAsAccountlessUser(page, "ca11");

    const planOptions = page.getByLabel("Plan").locator("option");
    await expect(planOptions).toHaveCount(1);
    await expect(planOptions.first()).toHaveAttribute("value", "FREE");
    await expect(planOptions.first()).toHaveText("Gratis · 1 médico, 1 sede");
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

  test("CA-13: el alta se completa sin Culqi aunque todas sus peticiones estén bloqueadas", async ({
    page,
  }) => {
    // El bloqueo va antes del login: el script de Culqi se inyecta al montar /onboarding (hallazgo 5).
    const culqiRequestUrls: string[] = [];
    await page.route("**/*culqi.com/**", (route) => {
      culqiRequestUrls.push(route.request().url());
      return route.abort();
    });

    await loginAsAccountlessUser(page, "ca13");

    const accountName = uniqueName("Consultorio CA-13");
    await page.getByLabel("Nombre de la cuenta").fill(accountName);

    const continueButton = page.getByRole("button", {
      name: "Continuar",
      exact: true,
    });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    await expect(page).toHaveURL(/\/account\/[^/]+\/select$/);
    // El script del checkout (js.culqi.com) se sigue cargando al montar la página; lo que no puede haber es cobro.
    expect(
      culqiRequestUrls.filter((url) => url.includes("api.culqi.com")),
    ).toHaveLength(0);

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

  test("CA-14: la validación del nombre sigue igual sin nombre de cuenta", async ({
    page,
  }) => {
    await loginAsAccountlessUser(page, "ca14");

    await page.getByRole("button", { name: "Continuar", exact: true }).click();

    // El campo es `required` nativo (sin cambios de este ticket): el navegador bloquea el envío él mismo.
    await expect(page).toHaveURL(/\/onboarding$/);
    const nameInput = page.getByLabel("Nombre de la cuenta");
    const validationMessage = await nameInput.evaluate(
      (input: HTMLInputElement) => input.validationMessage,
    );
    expect(validationMessage.length).toBeGreaterThan(0);
  });
});
