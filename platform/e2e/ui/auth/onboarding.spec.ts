import { test, expect } from "@playwright/test";
import { API_BASE_URL, PLATFORM_BASE_URL } from "../../support/env";
import { uniqueEmail, uniqueName } from "../../support/users";
import {
  clinicDashboardUrl,
  completeOnboardingViaUi,
  confirmEmailViaLink,
  registerViaUi,
} from "../../support/ui";

// docs/features/fix-auth-user-fields-input/plan.md CA-12; docs/features/primer-uso/plan.md CA-12 y CA-13.
test("CA-12: registro, confirmación, login y onboarding dejan al médico en el dashboard de su sede nueva, con la guía", async ({
  page,
}) => {
  const email = uniqueEmail("ca12");

  await registerViaUi(page, {
    name: "Ana",
    lastName: "García",
    phone: "999888777",
    email,
  });

  await confirmEmailViaLink(page, email);

  // autoSignInAfterVerification deja sesión iniciada; sin cuenta, la app redirige sola a /onboarding.
  await expect(page).toHaveURL(/\/onboarding$/);

  await completeOnboardingViaUi(page, {
    name: uniqueName("Consultorio CA-12"),
  });

  const meResponse = await page.request.get(`${API_BASE_URL}/user/me`, {
    headers: { Origin: PLATFORM_BASE_URL },
  });
  expect(meResponse.status()).toBe(200);

  const me = await meResponse.json();
  expect(me.role).toBe("USER");
  expect(me.onboardingCompleted).toBe(true);
  expect(me.accountId).toBeTruthy();

  await expect(page).toHaveURL(clinicDashboardUrl(me.accountId));
  await expect(
    page.getByRole("heading", { name: "Te falta 1 paso para recibir citas" }),
  ).toBeVisible();
});
