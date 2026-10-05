import { test, expect } from "@playwright/test";
import { API_BASE_URL, PLATFORM_BASE_URL } from "../../support/env";
import { uniqueEmail, uniqueName } from "../../support/users";
import {
  completeOnboardingViaUi,
  confirmEmailViaLink,
  registerViaUi,
} from "../../support/ui";

/** docs/features/fix-auth-user-fields-input/plan.md — CA-12. */
test("CA-12: registro, confirmación, login y onboarding dejan al médico en su cuenta nueva", async ({
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

  await completeOnboardingViaUi(page, uniqueName("Consultorio CA-12"));

  const meResponse = await page.request.get(`${API_BASE_URL}/user/me`, {
    headers: { Origin: PLATFORM_BASE_URL },
  });
  expect(meResponse.status()).toBe(200);

  const me = await meResponse.json();
  expect(me.role).toBe("USER");
  expect(me.onboardingCompleted).toBe(true);
  expect(me.accountId).toBeTruthy();

  await expect(page).toHaveURL(new RegExp(`/account/${me.accountId}/select$`));
});
