import type { Page } from "@playwright/test";
import {
  createClinicResource,
  createOnboardedAdmin,
  createOrganizationResource,
} from "../../support/accounts";
import { PLATFORM_BASE_URL } from "../../support/env";
import { expect, test } from "../../support/test";
import { clinicDashboardUrl, loginViaUi } from "../../support/ui";
import { uniqueName } from "../../support/users";

const REDIRECT_TIMEOUT = 20_000;

async function setup(label: string) {
  const admin = await createOnboardedAdmin({ emailPrefix: `url-${label}` });
  const cookieOrganizationName = uniqueName(`ORG-cookie-${label}`);
  const cookieOrganizationId = await createOrganizationResource(
    admin,
    cookieOrganizationName,
  );
  const urlOrganizationName = uniqueName(`ORG-url-${label}`);
  const urlOrganizationId = await createOrganizationResource(
    admin,
    urlOrganizationName,
  );
  const clinicName = uniqueName(`Sede-${label}`);
  const clinicId = await createClinicResource(admin, urlOrganizationId, {
    name: clinicName,
  });
  return {
    admin,
    cookieOrganizationName,
    cookieOrganizationId,
    urlOrganizationName,
    urlOrganizationId,
    clinicName,
    clinicId,
  };
}

type World = Awaited<ReturnType<typeof setup>>;

async function signIn(page: Page, world: World) {
  await loginViaUi(
    page,
    world.admin.email,
    clinicDashboardUrl(world.admin.accountId),
  );
}

async function setActiveOrganization(page: Page, organizationId: string) {
  await page.context().addCookies([
    { name: "resource_id", value: organizationId, url: PLATFORM_BASE_URL },
    { name: "resource_type", value: "ORGANIZATION", url: PLATFORM_BASE_URL },
  ]);
}

const sidebar = (page: Page) => page.getByRole("complementary");

test("con la cookie de otra organización, la URL de una organización pinta su menú y su nombre", async ({
  page,
}) => {
  const world = await setup("cookie-otra");
  const { accountId } = world.admin;
  await signIn(page, world);
  await setActiveOrganization(page, world.cookieOrganizationId);

  await page.goto(
    `/account/${accountId}/organization/${world.urlOrganizationId}/users`,
  );

  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
  await expect(
    sidebar(page).getByText(world.urlOrganizationName, { exact: true }),
  ).toBeVisible();
  await expect(
    sidebar(page).getByText(world.cookieOrganizationName, { exact: true }),
  ).toHaveCount(0);
  await expect(
    sidebar(page).getByRole("link", { name: "Sedes", exact: true }),
  ).toHaveAttribute(
    "href",
    `/account/${accountId}/organization/${world.urlOrganizationId}/clinics`,
  );
});

test("con la cookie de otra organización, la raíz de la URL lleva al dashboard de esa organización", async ({
  page,
}) => {
  const world = await setup("cookie-raiz");
  const { accountId } = world.admin;
  await signIn(page, world);
  await setActiveOrganization(page, world.cookieOrganizationId);

  await page.goto(
    `/account/${accountId}/organization/${world.urlOrganizationId}`,
  );

  await expect(page).toHaveURL(
    `/account/${accountId}/organization/${world.urlOrganizationId}/dashboard`,
    { timeout: REDIRECT_TIMEOUT },
  );
  await expect(
    sidebar(page).getByText(world.urlOrganizationName, { exact: true }),
  ).toBeVisible();
});

test("sin cookie de recurso, la URL de una organización se abre en vez de mandar a la lista", async ({
  page,
}) => {
  const world = await setup("sin-cookie");
  const { accountId } = world.admin;
  await signIn(page, world);

  await page.goto(
    `/account/${accountId}/organization/${world.urlOrganizationId}/users`,
  );

  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
  await expect(page).toHaveURL(
    `/account/${accountId}/organization/${world.urlOrganizationId}/users`,
  );
  await expect(
    sidebar(page).getByText(world.urlOrganizationName, { exact: true }),
  ).toBeVisible();
});

test("el id de una sede en la URL de organización lleva a esa sede y no pinta el menú de organización", async ({
  page,
}) => {
  const world = await setup("sede-en-org");
  const { accountId } = world.admin;
  await signIn(page, world);
  await setActiveOrganization(page, world.urlOrganizationId);

  await page.goto(`/account/${accountId}/organization/${world.clinicId}/users`);

  await expect(page).toHaveURL(
    `/account/${accountId}/clinic/${world.clinicId}/dashboard`,
    { timeout: REDIRECT_TIMEOUT },
  );
  await expect(
    sidebar(page).getByText(world.clinicName, { exact: true }),
  ).toBeVisible();
  await expect(
    sidebar(page).getByRole("link", { name: "Sedes", exact: true }),
  ).toHaveCount(0);
});

test("el id de una organización en la URL de sede lleva a esa organización y no pinta el menú de sede", async ({
  page,
}) => {
  const world = await setup("org-en-sede");
  const { accountId } = world.admin;
  await signIn(page, world);

  await page.goto(
    `/account/${accountId}/clinic/${world.urlOrganizationId}/dashboard`,
  );

  await expect(page).toHaveURL(
    `/account/${accountId}/organization/${world.urlOrganizationId}/dashboard`,
    { timeout: REDIRECT_TIMEOUT },
  );
  await expect(
    sidebar(page).getByText(world.urlOrganizationName, { exact: true }),
  ).toBeVisible();
  await expect(
    sidebar(page).getByRole("link", { name: "Sedes", exact: true }),
  ).toBeVisible();
});
