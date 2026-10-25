import type { Page } from "@playwright/test";
import { createMemberWithRole } from "../../support/accounts";
import { createPortalScenario } from "../../support/appointment-portal";
import { readUserEmail } from "../../support/doctor-treatment";
import { PLATFORM_BASE_URL } from "../../support/env";
import { expect, test } from "../../support/test";
import { clinicDashboardUrl, loginViaUi } from "../../support/ui";

// docs/features/doctor-profile-membership/plan.md, decisión 8: «Usuarios» en el menú de la sede.

async function enterClinic(
  page: Page,
  email: string,
  accountId: string,
  clinicId: string,
  section: string,
) {
  await loginViaUi(page, email, clinicDashboardUrl(accountId));
  await page.context().addCookies([
    { name: "resource_id", value: clinicId, url: PLATFORM_BASE_URL },
    { name: "resource_type", value: "CLINIC", url: PLATFORM_BASE_URL },
  ]);
  await page.goto(`/account/${accountId}/clinic/${clinicId}/${section}`);
}

const usersLink = (page: Page) =>
  page.getByRole("link", { name: "Usuarios", exact: true });

test("el ADMIN ve «Usuarios» en el menú de la sede y llega a la página dentro del espacio de la sede", async ({
  page,
}) => {
  const scenario = await createPortalScenario("space-users-admin");
  const { admin, clinicId } = scenario;
  const doctorEmail = await readUserEmail(scenario.doctor.userId);

  await enterClinic(page, admin.email, admin.accountId, clinicId, "dashboard");
  // El ADMIN atiende por defecto desde que se crea la sede.
  await expect(
    page.getByRole("link", { name: "Configuración", exact: true }).first(),
  ).toBeVisible();
  await usersLink(page).first().click();

  await expect(page).toHaveURL(
    new RegExp(`/account/${admin.accountId}/clinic/${clinicId}/users$`),
  );
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
  await expect(
    page.getByText(`Personas con acceso a ${scenario.clinicName}.`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Pacientes", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: doctorEmail }),
  ).toBeVisible();
  const ownRow = page.getByRole("row").filter({ hasText: admin.email });
  await expect(ownRow.getByText("Tú", { exact: true })).toBeVisible();
  await expect(ownRow.getByText("Médico", { exact: true })).toBeVisible();
});

test("el formulario de la página de la sede trae la sede fija y sólo ofrece Médico y Usuario", async ({
  page,
}) => {
  const scenario = await createPortalScenario("space-users-form");
  const { admin, clinicId } = scenario;
  await enterClinic(page, admin.email, admin.accountId, clinicId, "users");

  await page.getByRole("button", { name: "Invitar usuario" }).click();
  await page.getByLabel("Correo electrónico").fill(scenario.admin.email);
  await page.getByRole("button", { name: "Continuar" }).click();

  const clinicField = page.getByLabel("Sede");
  await expect(clinicField).toHaveValue(scenario.clinicName);
  await expect(clinicField).toHaveJSProperty("readOnly", true);
  await expect(page.getByLabel("Rol").locator("option")).toHaveText([
    "Médico",
    "Usuario",
  ]);
});

test("un DOCTOR no ve «Usuarios» en el menú y, por URL, no ve la página ni la tabla", async ({
  page,
}) => {
  const scenario = await createPortalScenario("space-users-doctor");
  const { admin, clinicId, doctor } = scenario;
  const email = await readUserEmail(doctor.userId);

  await enterClinic(page, email, admin.accountId, clinicId, "dashboard");
  await expect(
    page.getByRole("link", { name: "Configuración", exact: true }).first(),
  ).toBeVisible();
  await expect(usersLink(page)).toHaveCount(0);

  await page.goto(`/account/${admin.accountId}/clinic/${clinicId}/users`);

  await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usuarios" })).toHaveCount(0);
  await expect(page.getByText(admin.email)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Invitar usuario" }),
  ).toHaveCount(0);
});

test("un USER no ve «Usuarios» en el menú y, por URL, no ve la página ni la tabla", async ({
  page,
}) => {
  const scenario = await createPortalScenario("space-users-user");
  const { admin, clinicId } = scenario;
  const user = await createMemberWithRole({
    accountId: admin.accountId,
    resourceId: clinicId,
    role: "USER",
    createdBy: admin.userId,
    emailPrefix: "space-users-user",
  });

  await enterClinic(page, user.email, admin.accountId, clinicId, "dashboard");
  await expect(
    page.getByRole("link", { name: "Pacientes", exact: true }).first(),
  ).toBeVisible();
  await expect(usersLink(page)).toHaveCount(0);

  await page.goto(`/account/${admin.accountId}/clinic/${clinicId}/users`);

  await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usuarios" })).toHaveCount(0);
  await expect(page.getByText(admin.email)).toHaveCount(0);
});
