import { test, expect } from "../../support/test";
import {
  createApiContext,
  createClinicResource,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
} from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { createConfirmedUser, uniqueName } from "../../support/users";
import { loginViaUi } from "../../support/ui";

/**
 * docs/features/fix-org-clinic-creation-role/plan.md — CA-9, CA-10, CA-20 y
 * CA-21 ([e2e]).
 */

test("CA-9: un USER de una organización no ve el botón Crear organización ni puede abrir su modal", async ({
  page,
}) => {
  const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca9" });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName("ORG-CA9"),
  );
  const user = await createMemberWithRole({
    accountId: admin.accountId,
    resourceId: organizationId,
    role: "USER",
    createdBy: admin.userId,
    emailPrefix: "user-ca9",
  });

  await loginViaUi(
    page,
    user.email,
    new RegExp(`/account/${admin.accountId}/select$`),
  );

  await expect(
    page.getByRole("button", { name: "Crear organización" }),
  ).not.toBeVisible();
  // Sin botón no hay cómo abrir el modal: el campo "Nombre" de su formulario tampoco aparece.
  await expect(page.getByLabel("Nombre")).not.toBeVisible();
});

test("CA-20: un ADMIN sólo de una sede no ve el botón Crear organización", async ({
  page,
}) => {
  const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca20" });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName("ORG-CA20"),
  );
  const clinicId = await createClinicResource(admin, organizationId, {
    name: uniqueName("Sede CA-20"),
  });
  const adminOfClinic = await createMemberWithRole({
    accountId: admin.accountId,
    resourceId: clinicId,
    role: "ADMIN",
    createdBy: admin.userId,
    emailPrefix: "adminsede-ca20",
  });

  await loginViaUi(
    page,
    adminOfClinic.email,
    new RegExp(`/account/${admin.accountId}/select$`),
  );

  await expect(
    page.getByRole("button", { name: "Crear organización" }),
  ).not.toBeVisible();
});

test("CA-21: en una cuenta sin organizaciones, sólo el dueño ve el botón Crear organización", async ({
  page,
}) => {
  const owner = await createOnboardedAdmin({ emailPrefix: "owner-ca21" });

  const intruderContext = await createApiContext();
  const intruder = await createConfirmedUser(intruderContext, {
    emailPrefix: "intruso-ca21",
  });
  const prisma = await getTestPrisma();
  await prisma.user.update({
    where: { email: intruder.email },
    data: { accountId: owner.accountId, onboardingCompleted: true },
  });

  await loginViaUi(
    page,
    intruder.email,
    new RegExp(`/account/${owner.accountId}/select$`),
  );
  await expect(
    page.getByRole("button", { name: "Crear organización" }),
  ).not.toBeVisible();

  await page.context().clearCookies();
  await loginViaUi(
    page,
    owner.email,
    new RegExp(`/account/${owner.accountId}/select$`),
  );
  await expect(
    page.getByRole("button", { name: "Crear organización" }),
  ).toBeVisible();
});

test("CA-10: el dueño nuevo crea su organización y una sede desde /select", async ({
  page,
}) => {
  const owner = await createOnboardedAdmin({ emailPrefix: "owner-ca10" });

  await loginViaUi(
    page,
    owner.email,
    new RegExp(`/account/${owner.accountId}/select$`),
  );

  await expect(
    page.getByRole("button", { name: "Crear organización" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Crear organización" }).click();

  const organizationName = uniqueName("Consultorio CA-10");
  await page.getByLabel("Nombre").fill(organizationName);
  await page.getByRole("button", { name: "Crear" }).click();

  await expect(page.getByText("Organización creada")).toBeVisible();
  await expect(page.getByText(organizationName)).toBeVisible();

  await page.getByText("Entrar").click();
  await expect(page).toHaveURL(
    new RegExp(`/account/${owner.accountId}/organization/[^/]+$`),
  );

  await page.getByRole("link", { name: "Sedes" }).click();
  await expect(page).toHaveURL(/\/clinics$/);
  await expect(page.getByRole("heading", { name: "Sedes" })).toBeVisible();

  await page.getByRole("button", { name: "Crear sede" }).click();
  const clinicName = uniqueName("Sede CA-10");
  await page.getByLabel("Nombre de la sede").fill(clinicName);
  await page.getByLabel("Teléfono").fill("+51999888777");
  await page.getByLabel("Dirección").fill("Av. Siempre Viva 123");
  await page.getByRole("button", { name: "Crear" }).click();

  await expect(page.getByText("Sede creada")).toBeVisible();
  await expect(page.getByText(clinicName)).toBeVisible();

  // Confirma que el dueño quedó ADMIN de la organización: /select muestra su rol.
  await page.goto(`/account/${owner.accountId}/select`);
  await expect(page.getByText("Tu rol: ADMIN")).toBeVisible();
});
