import type { Page } from "@playwright/test";
import { createPortalScenario } from "../../support/appointment-portal";
import { PLATFORM_BASE_URL } from "../../support/env";
import { expect, test } from "../../support/test";
import { clinicDashboardUrl, loginViaUi } from "../../support/ui";

const COPY_LINK_BUTTON = "Copiar link de reservas";
const WELCOME_TEXT = /Este es el panel de /;

type ResourceType = "CLINIC" | "ORGANIZATION";

async function signIn(page: Page, email: string, accountId: string) {
  await loginViaUi(page, email, clinicDashboardUrl(accountId));
}

async function visitDashboard(
  page: Page,
  accountId: string,
  resourceId: string,
  resourceType: ResourceType,
) {
  await page.context().addCookies([
    { name: "resource_id", value: resourceId, url: PLATFORM_BASE_URL },
    { name: "resource_type", value: resourceType, url: PLATFORM_BASE_URL },
  ]);
  const space = resourceType === "CLINIC" ? "clinic" : "organization";
  await page.goto(`/account/${accountId}/${space}/${resourceId}/dashboard`);
  await expect(page.getByText(WELCOME_TEXT)).toBeVisible();
}

test("el dashboard de la sede copia el link público de reservas de esa sede", async ({
  page,
}) => {
  const { admin, clinicId } = await createPortalScenario("dash-link-clinic");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: PLATFORM_BASE_URL,
  });

  await signIn(page, admin.email, admin.accountId);
  await visitDashboard(page, admin.accountId, clinicId, "CLINIC");
  await page.getByRole("button", { name: COPY_LINK_BUTTON }).click();

  await expect(page.getByText("¡Link copiado!")).toBeVisible();
  const copiedLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedLink).toBe(
    `${PLATFORM_BASE_URL}/clinic/${clinicId}/create-appointment`,
  );
});

test("el dashboard de la organización no ofrece copiar el link de reservas", async ({
  page,
}) => {
  const { admin, organizationId, clinicId } =
    await createPortalScenario("dash-link-org");
  const copyLinkButton = page.getByRole("button", { name: COPY_LINK_BUTTON });

  await signIn(page, admin.email, admin.accountId);
  await visitDashboard(page, admin.accountId, clinicId, "CLINIC");
  await expect(copyLinkButton).toBeVisible();

  await visitDashboard(page, admin.accountId, organizationId, "ORGANIZATION");
  await expect(copyLinkButton).toHaveCount(0);
});
