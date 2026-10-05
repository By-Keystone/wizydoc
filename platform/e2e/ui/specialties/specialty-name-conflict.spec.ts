import { test, expect } from "../../support/test";
import {
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
} from "../../support/accounts";
import { PLATFORM_BASE_URL } from "../../support/env";
import { uniqueName } from "../../support/users";
import { loginViaUi } from "../../support/ui";

/** docs/features/fix-specialty-account-scope/plan.md — CA-18. */

test("CA-18: crear un nombre repetido desde el panel muestra 'Ya existe esa especialidad', no un error genérico", async ({
  page,
}) => {
  const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca18" });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName("ORG-CA18"),
  );
  const specialtyName = uniqueName("Cardiología CA-18");
  await createSpecialty(admin, organizationId, specialtyName);

  await loginViaUi(
    page,
    admin.email,
    new RegExp(`/account/${admin.accountId}/select$`),
  );

  // Las páginas de organización exigen resource_id/resource_type; elegir sede no es parte de este flujo.
  await page.context().addCookies([
    {
      name: "resource_id",
      value: organizationId,
      url: PLATFORM_BASE_URL,
      sameSite: "Lax",
    },
    {
      name: "resource_type",
      value: "ORGANIZATION",
      url: PLATFORM_BASE_URL,
      sameSite: "Lax",
    },
  ]);

  await page.goto(
    `/account/${admin.accountId}/organization/${organizationId}/specialties`,
  );
  await expect(
    page.getByRole("heading", { name: "Especialidades" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Crear especialidad" }).click();
  await page.getByLabel("Nombre de la especialidad").fill(specialtyName);
  await page.getByRole("button", { name: "Crear", exact: true }).click();

  await expect(page.getByText("Ya existe esa especialidad")).toBeVisible();
});
