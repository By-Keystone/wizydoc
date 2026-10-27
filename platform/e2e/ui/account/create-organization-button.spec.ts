import { test, expect } from "../../support/test";
import {
  createApiContext,
  createClinicResource,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
} from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { readFirstClinicRecords } from "../../support/first-use";
import { createConfirmedUser, uniqueName } from "../../support/users";
import {
  clinicDashboardUrl,
  fillOnboardingForm,
  loginViaUi,
} from "../../support/ui";

// docs/features/fix-org-clinic-creation-role/plan.md CA-9, CA-10, CA-20 y CA-21; docs/features/primer-uso/plan.md CA-18 a CA-20.

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
    clinicDashboardUrl(admin.accountId),
  );
  await page.goto(`/account/${admin.accountId}/select?switch=1`);

  await expect(
    page.getByRole("button", { name: "Crear organización" }),
  ).not.toBeVisible();
});

test("CA-21: en una cuenta sin organizaciones, quien no es el dueño no ve Crear organización y el dueño llega a Termina de crear tu consultorio", async ({
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
  await expect(
    page.getByText("No perteneces a ninguna organización todavía."),
  ).toBeVisible();

  await page.context().clearCookies();
  await loginViaUi(page, owner.email, /\/onboarding$/);
  await expect(
    page.getByRole("heading", { name: "Termina de crear tu consultorio" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Crear organización" }),
  ).toHaveCount(0);
});

test("CA-10: el dueño nuevo crea su organización y su sede desde Termina de crear tu consultorio y queda Administrador y médico de la sede", async ({
  page,
}) => {
  const owner = await createOnboardedAdmin({ emailPrefix: "owner-ca10" });

  await loginViaUi(page, owner.email, /\/onboarding$/);
  await expect(
    page.getByRole("heading", { name: "Termina de crear tu consultorio" }),
  ).toBeVisible();

  const clinicName = uniqueName("Consultorio CA-10");
  await fillOnboardingForm(page, { name: clinicName });
  await page.getByRole("button", { name: "Crear mi consultorio" }).click();
  await expect(page).toHaveURL(clinicDashboardUrl(owner.accountId), {
    timeout: 20_000,
  });

  // Confirma que el dueño quedó ADMIN de la organización: /select muestra su rol.
  await page.goto(`/account/${owner.accountId}/select?switch=1`);
  await expect(page.getByText("Tu rol: Administrador")).toBeVisible();
  await expect(page.getByText(clinicName).first()).toBeVisible();

  const records = await readFirstClinicRecords(owner.accountId, owner.userId);
  expect(records.organizationMembership?.role).toBe("ADMIN");
  expect(records.clinicMembership?.role).toBe("DOCTOR");
  expect(records.clinicMembership?.doctorProfile).not.toBeNull();
});
