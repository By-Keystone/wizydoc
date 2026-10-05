import { test, expect } from "@playwright/test";
import { getTestPrisma } from "../../support/db";
import { uniqueEmail } from "../../support/users";
import { confirmEmailViaLink, registerViaUi } from "../../support/ui";

test("un usuario nuevo se registra, confirma su correo y llega al onboarding", async ({
  page,
}) => {
  const email = uniqueEmail("registro");

  await registerViaUi(page, {
    name: "Ana",
    lastName: "García",
    phone: "999888777",
    email,
  });

  await confirmEmailViaLink(page, email);
  await expect(page).toHaveURL(/\/onboarding/);

  const testPrisma = await getTestPrisma();
  const user = await testPrisma.user.findUnique({ where: { email } });
  expect(user?.confirmed).toBe(true);
});
