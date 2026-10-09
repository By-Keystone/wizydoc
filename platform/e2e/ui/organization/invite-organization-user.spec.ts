import type { Page } from "@playwright/test";
import { test, expect } from "../../support/test";
import {
  createClinicResource,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  type OnboardedAdmin,
  type SeededMember,
} from "../../support/accounts";
import { PLATFORM_BASE_URL } from "../../support/env";
import { getTestPrisma } from "../../support/db";
import { uniqueEmail, uniqueName } from "../../support/users";
import { loginViaUi } from "../../support/ui";

const USER_NOTICE_TITLE = "Acceso a todas las sedes";
const USER_NOTICE_TEXT =
  "Verá la agenda del día de cada sede y las fichas de los pacientes, incluidos sus datos de salud. Podrá actualizar el contacto de un paciente, pero no su información de salud.";
const ADMIN_NOTICE_TEXT =
  "Verá y editará las fichas de los pacientes, incluidos sus datos de salud, la agenda y el equipo de todas las sedes. También podrá invitar a otras personas y crear sedes y organizaciones. Elige este rol sólo para quien lo necesite.";

interface Fixture {
  admin: OnboardedAdmin;
  organizationId: string;
  organizationName: string;
  clinicId: string;
  existingUser: SeededMember;
  otherAccountAdmin: OnboardedAdmin;
}

async function setupFixture(): Promise<Fixture> {
  const admin = await createOnboardedAdmin({
    emailPrefix: "admin-orgui",
    name: "Alicia",
    lastName: "Administradora",
  });
  const organizationName = uniqueName("ORG-UI");
  const organizationId = await createOrganizationResource(
    admin,
    organizationName,
  );
  const clinicId = await createClinicResource(admin, organizationId, {
    name: uniqueName("Sede Larco"),
  });
  const existingUser = await createMemberWithRole({
    accountId: admin.accountId,
    resourceId: clinicId,
    role: "USER",
    createdBy: admin.userId,
    emailPrefix: "recepcion-orgui",
    name: "Rosa",
    lastName: "Recepción",
    phone: "+51911111111",
  });
  const otherAccountAdmin = await createOnboardedAdmin({
    emailPrefix: "otro-admin-orgui",
  });

  return {
    admin,
    organizationId,
    organizationName,
    clinicId,
    existingUser,
    otherAccountAdmin,
  };
}

async function signInIntoOrganization(
  page: Page,
  fixture: Fixture,
  email: string = fixture.admin.email,
): Promise<void> {
  await loginViaUi(
    page,
    email,
    new RegExp(`/account/${fixture.admin.accountId}/select$`),
  );

  // Las cookies resource_id/resource_type imitan "Entrar" en /select; entrar no es lo que se prueba.
  await page.context().addCookies([
    {
      name: "resource_id",
      value: fixture.organizationId,
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
}

function organizationPath(fixture: Fixture, section: string): string {
  return `/account/${fixture.admin.accountId}/organization/${fixture.organizationId}/${section}`;
}

async function goToUsersPage(page: Page, fixture: Fixture): Promise<void> {
  await signInIntoOrganization(page, fixture);
  await page.goto(organizationPath(fixture, "users"));
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
}

async function openInviteModal(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Invitar usuario" }).click();
  await expect(
    page.getByRole("dialog", { name: "Invitar a la organización" }),
  ).toBeVisible();
}

async function continueWithEmail(page: Page, email: string): Promise<void> {
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Continuar" }).click();
}

async function fillNewUserDetails(page: Page): Promise<void> {
  await page.getByLabel("Nombre").fill("Nueva");
  await page.getByLabel("Apellido").fill("Persona");
  await page.getByLabel("Teléfono").fill("+51900000001");
}

test("el ADMIN llega a Usuarios desde el menú y, estando solo, ve su fila con Tú y la pista hacia Sedes", async ({
  page,
}) => {
  const fixture = await setupFixture();
  await signInIntoOrganization(page, fixture);
  await page.goto(organizationPath(fixture, "clinics"));

  await page.getByRole("link", { name: "Usuarios" }).first().click();

  await expect(page).toHaveURL(/\/organization\/[^/]+\/users$/);
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
  await expect(
    page.getByText(
      `Personas con acceso a todas las sedes de ${fixture.organizationName}.`,
    ),
  ).toBeVisible();

  const ownRow = page.getByRole("row", { name: /Alicia/ });
  await expect(ownRow.getByText("Tú", { exact: true })).toBeVisible();
  await expect(
    ownRow.getByText("Administrador", { exact: true }),
  ).toBeVisible();
  await expect(ownRow.getByText("Invitación pendiente")).toHaveCount(0);

  await expect(
    page.getByText("Aún no has invitado a nadie a la organización"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sedes", exact: true }).last(),
  ).toHaveAttribute("href", organizationPath(fixture, "clinics"));
});

test("un USER de la organización que abre la página por URL ve el estado de error sin datos", async ({
  page,
}) => {
  const fixture = await setupFixture();
  const userOfOrganization = await createMemberWithRole({
    accountId: fixture.admin.accountId,
    resourceId: fixture.organizationId,
    role: "USER",
    createdBy: fixture.admin.userId,
    emailPrefix: "user-orgui",
  });

  await signInIntoOrganization(page, fixture, userOfOrganization.email);
  await page.goto(organizationPath(fixture, "users"));

  await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect(page.getByText(fixture.admin.email)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Invitar usuario" }),
  ).toHaveCount(0);
});

test("el modal valida el correo, precarga a un usuario existente y ofrece sólo Usuario y Administrador sin especialidades", async ({
  page,
}) => {
  const fixture = await setupFixture();
  await goToUsersPage(page, fixture);
  await openInviteModal(page);

  await expect(page.getByLabel("Correo electrónico")).toBeFocused();

  await continueWithEmail(page, "sin-arroba");
  await expect(
    page.getByText("Ingresa un correo electrónico válido"),
  ).toBeVisible();
  await expect(page.getByLabel("Nombre")).toHaveCount(0);

  await continueWithEmail(page, fixture.existingUser.email);
  await expect(
    page.getByText("Ya tiene una cuenta — precargamos sus datos."),
  ).toBeVisible();
  await expect(page.getByLabel("Nombre")).toHaveValue(
    fixture.existingUser.name,
  );
  await expect(page.getByLabel("Apellido")).toHaveValue(
    fixture.existingUser.lastName,
  );
  await expect(page.getByLabel("Teléfono")).toHaveValue(
    fixture.existingUser.phone,
  );

  const roleSelect = page.getByLabel("Rol");
  await expect(roleSelect).toHaveValue("USER");
  await expect(roleSelect.locator("option")).toHaveText([
    "Usuario",
    "Administrador",
  ]);
  await expect(page.getByLabel("Especialidades")).toHaveCount(0);

  await page.getByRole("button", { name: "Cambiar" }).click();
  await continueWithEmail(page, uniqueEmail("nuevo-orgui"));
  await expect(
    page.getByText("Usuario nuevo — completa sus datos."),
  ).toBeVisible();
  await expect(page.getByLabel("Nombre")).toHaveValue("");
  await expect(page.getByLabel("Rol")).toHaveValue("USER");
});

test("el aviso de acceso cambia con el rol elegido", async ({ page }) => {
  const fixture = await setupFixture();
  await goToUsersPage(page, fixture);
  await openInviteModal(page);
  await continueWithEmail(page, uniqueEmail("aviso-orgui"));

  const userNotice = page.getByText(USER_NOTICE_TEXT);
  const adminNoticeTitle = page.getByText(
    `Acceso total a ${fixture.organizationName}`,
  );

  await expect(
    page.getByText(USER_NOTICE_TITLE, { exact: true }),
  ).toBeVisible();
  await expect(userNotice).toBeVisible();
  await expect(adminNoticeTitle).toHaveCount(0);

  await page.getByLabel("Rol").selectOption("ADMIN");
  await expect(adminNoticeTitle).toBeVisible();
  await expect(page.getByText(ADMIN_NOTICE_TEXT)).toBeVisible();
  await expect(userNotice).toHaveCount(0);

  await page.getByLabel("Rol").selectOption("USER");
  await expect(userNotice).toBeVisible();
  await expect(adminNoticeTitle).toHaveCount(0);
});

test("enviar sin nombre muestra el error del campo y el modal sigue abierto con lo escrito", async ({
  page,
}) => {
  const fixture = await setupFixture();
  await goToUsersPage(page, fixture);
  await openInviteModal(page);
  const email = uniqueEmail("sin-nombre-orgui");
  await continueWithEmail(page, email);

  await page.getByLabel("Apellido").fill("Persona");
  await page.getByLabel("Teléfono").fill("+51900000001");
  await page.getByRole("button", { name: "Enviar invitación" }).click();

  await expect(page.getByText("Ingresa el nombre")).toBeVisible();
  await expect(page.getByLabel("Apellido")).toHaveValue("Persona");
  await expect(page.getByLabel("Teléfono")).toHaveValue("+51900000001");
  await expect(
    page.getByRole("dialog", { name: "Invitar a la organización" }),
  ).toBeVisible();
});

test("si el api rechaza el envío, se ve el mensaje del api y el modal sigue abierto con lo escrito", async ({
  page,
}) => {
  const fixture = await setupFixture();
  await goToUsersPage(page, fixture);
  await openInviteModal(page);
  await continueWithEmail(page, fixture.otherAccountAdmin.email);
  await fillNewUserDetails(page);

  await page.getByRole("button", { name: "Enviar invitación" }).click();

  await expect(
    page.getByText("Ya existe una cuenta con este correo en otra cuenta"),
  ).toBeVisible();
  await expect(page.getByLabel("Nombre")).toHaveValue("Nueva");
  await expect(
    page.getByRole("button", { name: "Enviar invitación" }),
  ).toBeEnabled();
});

test("invitar a un USER cierra el modal, muestra Invitación enviada y la fila nueva con Invitación pendiente; al aceptar la etiqueta desaparece", async ({
  page,
}) => {
  const fixture = await setupFixture();
  await goToUsersPage(page, fixture);
  await openInviteModal(page);

  const email = uniqueEmail("invitado-orgui");
  await continueWithEmail(page, email);
  await fillNewUserDetails(page);
  await page.getByRole("button", { name: "Enviar invitación" }).click();

  await expect(page.getByText("Invitación enviada")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Invitar a la organización" }),
  ).toHaveCount(0);

  const invitedRow = page.getByRole("row", { name: /Nueva Persona/ });
  await expect(invitedRow).toBeVisible();
  await expect(invitedRow.getByText("Usuario", { exact: true })).toBeVisible();
  await expect(invitedRow.getByText("Invitación pendiente")).toBeVisible();
  await expect(
    page.getByText("Aún no has invitado a nadie a la organización"),
  ).toHaveCount(0);

  const prisma = await getTestPrisma();
  const invitation = await prisma.userInvitation.findFirst({
    where: { membership: { user: { email } } },
  });
  expect(invitation).not.toBeNull();
  await prisma.userInvitation.update({
    where: { id: invitation!.id },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });
  await page.reload();
  await expect(
    page
      .getByRole("row", { name: /Nueva Persona/ })
      .getByText("Invitación pendiente"),
  ).toHaveCount(0);
});

test("la tabla de usuarios de la sede muestra el rol en español y nunca Invitación pendiente", async ({
  page,
}) => {
  const fixture = await setupFixture();
  await signInIntoOrganization(page, fixture);
  await page.goto(
    organizationPath(fixture, `clinic/${fixture.clinicId}/users`),
  );

  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
  await expect(
    page.getByText("Usuario", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("USER", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Invitación pendiente")).toHaveCount(0);
});
