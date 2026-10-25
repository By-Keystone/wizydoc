import { test, expect } from "../../support/test";
import {
  createOnboardedAdmin,
  createOrganizationResource,
} from "../../support/accounts";
import { PLATFORM_BASE_URL } from "../../support/env";
import { loginViaUi } from "../../support/ui";
import { uniqueName } from "../../support/users";

const SERVER_ERROR_TOAST =
  "Algo salió mal de nuestro lado. Vuelve a intentarlo en unos minutos.";
const NUL = String.fromCharCode(0);

// Postgres rechaza el byte NUL en un texto y la validación del api lo deja pasar: es un 5xx reproducible sin tocar el servidor.
test("un 5xx del api al crear una especialidad muestra el aviso genérico y no el mensaje crudo", async ({
  page,
}) => {
  const admin = await createOnboardedAdmin({ emailPrefix: "admin-5xx" });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName("ORG-5xx"),
  );
  await loginViaUi(page, admin.email, `/account/${admin.accountId}/select`);
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

  await page.getByRole("button", { name: "Crear especialidad" }).click();
  await page.getByLabel("Nombre de la especialidad").fill(`Cardio${NUL}logía`);
  await page.getByRole("button", { name: "Crear", exact: true }).click();

  await expect(page.getByText(SERVER_ERROR_TOAST)).toBeVisible();
  await expect(
    page.getByText(/invalid byte sequence|prisma|Ocurrió un error/i),
  ).toHaveCount(0);
});
