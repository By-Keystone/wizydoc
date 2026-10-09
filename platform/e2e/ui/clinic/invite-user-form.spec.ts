import type { Page } from "@playwright/test";
import { test, expect } from "../../support/test";
import {
  createClinicResource,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  type OnboardedAdmin,
  type SeededMember,
} from "../../support/accounts";
import { PLATFORM_BASE_URL } from "../../support/env";
import { uniqueEmail, uniqueName } from "../../support/users";
import { softDeleteMembership } from "../../support/invitations";
import { loginViaUi } from "../../support/ui";

/**
 * docs/features/fix-user-by-email-scope/plan.md — CA-13, CA-15, CA-16, CA-18 y CA-19.
 * docs/features/fix-invite-role-check/plan.md — CA-1 y CA-7 ([e2e]).
 */

interface Fixture {
  admin: OnboardedAdmin;
  organizationId: string;
  clinicId: string;
  reception: SeededMember;
  doctor: SeededMember;
  otherAccountAdmin: OnboardedAdmin;
}

async function setupFixture(): Promise<Fixture> {
  const admin = await createOnboardedAdmin({
    emailPrefix: "admin-form",
    name: "Alicia",
    lastName: "Administradora",
  });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName("ORG-FORM"),
  );
  const clinicId = await createClinicResource(admin, organizationId, {
    name: uniqueName("Sede Larco"),
  });

  const reception = await createMemberWithRole({
    accountId: admin.accountId,
    resourceId: clinicId,
    role: "USER",
    createdBy: admin.userId,
    emailPrefix: "recepcion-form",
    name: "Rosa",
    lastName: "Recepción",
    phone: "+51911111111",
  });

  const doctor = await createMemberWithRole({
    accountId: admin.accountId,
    resourceId: clinicId,
    role: "DOCTOR",
    createdBy: admin.userId,
    emailPrefix: "doctor-form",
    name: "Darío",
    lastName: "Doctor",
    phone: "+51922222222",
  });

  const otherAccountAdmin = await createOnboardedAdmin({
    emailPrefix: "otro-admin-form",
    name: "Óscar",
    lastName: "Otro",
  });

  return {
    admin,
    organizationId,
    clinicId,
    reception,
    doctor,
    otherAccountAdmin,
  };
}

interface UsersPageActor {
  email: string;
  accountId: string;
}

async function goToUsersPage(
  page: Page,
  fixture: Fixture,
  actor: UsersPageActor = fixture.admin,
): Promise<void> {
  await loginViaUi(
    page,
    actor.email,
    new RegExp(`/account/${actor.accountId}/select$`),
  );

  // Las cookies resource_id/resource_type imitan "Entrar" en /select; elegir sede no es parte de este flujo.
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

  await page.goto(
    `/account/${actor.accountId}/organization/${fixture.organizationId}/clinic/${fixture.clinicId}/users`,
  );
}

async function openInviteModal(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Invitar usuario" }).click();
  await expect(page.getByLabel("Correo electrónico")).toBeVisible();
}

async function continueWithEmail(page: Page, email: string): Promise<void> {
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Continuar" }).click();
}

test("CA-15 y CA-16: el formulario precarga los datos de un usuario existente y los cambia al cambiar de correo", async ({
  page,
}) => {
  const fixture = await setupFixture();
  await goToUsersPage(page, fixture);
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
  await openInviteModal(page);

  // CA-15
  await continueWithEmail(page, fixture.reception.email);
  await expect(
    page.getByText("Ya tiene una cuenta — precargamos sus datos."),
  ).toBeVisible();
  await expect(page.getByLabel("Nombre")).toHaveValue(fixture.reception.name);
  await expect(page.getByLabel("Apellido")).toHaveValue(
    fixture.reception.lastName,
  );
  await expect(page.getByLabel("Teléfono")).toHaveValue(
    fixture.reception.phone,
  );

  // CA-16
  await page.getByRole("button", { name: "Cambiar" }).click();
  await continueWithEmail(page, fixture.doctor.email);
  await expect(page.getByLabel("Nombre")).toHaveValue(fixture.doctor.name);
  await expect(page.getByLabel("Apellido")).toHaveValue(
    fixture.doctor.lastName,
  );
  await expect(page.getByLabel("Teléfono")).toHaveValue(fixture.doctor.phone);
  await expect(page.getByLabel("Nombre")).not.toHaveValue(
    fixture.reception.name,
  );
});

test("CA-13: la búsqueda es una sola petición y el correo no aparece en ninguna URL vista por el navegador", async ({
  page,
}) => {
  // Es una server action: el navegador nunca ve el POST de verdad, sólo lo que esta prueba puede observar.
  const fixture = await setupFixture();
  await goToUsersPage(page, fixture);
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
  await openInviteModal(page);

  const requestsSeenDuringLookup: { url: string; method: string }[] = [];
  const onRequest = (request: { url: () => string; method: () => string }) => {
    requestsSeenDuringLookup.push({
      url: request.url(),
      method: request.method(),
    });
  };
  page.on("request", onRequest);

  await continueWithEmail(page, fixture.reception.email);
  await expect(
    page.getByText("Ya tiene una cuenta — precargamos sus datos."),
  ).toBeVisible();

  page.off("request", onRequest);

  const postRequestsSeen = requestsSeenDuringLookup.filter(
    (r) => r.method === "POST",
  );
  expect(postRequestsSeen).toHaveLength(1);

  for (const { url } of requestsSeenDuringLookup) {
    expect(url).not.toContain(fixture.reception.email);
    expect(url).not.toContain(encodeURIComponent(fixture.reception.email));
  }
});

test("CA-18: un correo de otra cuenta muestra Usuario nuevo y un toast de error al enviar", async ({
  page,
}) => {
  const fixture = await setupFixture();
  await goToUsersPage(page, fixture);
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
  await openInviteModal(page);

  await continueWithEmail(page, fixture.otherAccountAdmin.email);
  await expect(
    page.getByText("Usuario nuevo — completa sus datos."),
  ).toBeVisible();
  await expect(page.getByLabel("Nombre")).toHaveValue("");
  await expect(page.getByLabel("Apellido")).toHaveValue("");
  await expect(page.getByLabel("Teléfono")).toHaveValue("");

  await page.getByLabel("Nombre").fill("Cualquiera");
  await page.getByLabel("Apellido").fill("Cualquiera");
  await page.getByLabel("Teléfono").fill("+51900000000");
  await page.getByRole("button", { name: "Enviar invitación" }).click();

  // docs/features/fix-invite-role-check/plan.md CA-6: ahora el 422 llega con
  // su mensaje real (antes caía al 500 genérico del catch-all).
  await expect(
    page.getByText("Ya existe una cuenta con este correo en otra cuenta"),
  ).toBeVisible();
});

test("CA-19: un correo nuevo muestra Usuario nuevo y al completarlo y enviar se ve Invitación enviada", async ({
  page,
}) => {
  const fixture = await setupFixture();
  await goToUsersPage(page, fixture);
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
  await openInviteModal(page);

  const newEmail = uniqueEmail("nuevo-ca19");
  await continueWithEmail(page, newEmail);
  await expect(
    page.getByText("Usuario nuevo — completa sus datos."),
  ).toBeVisible();

  await page.getByLabel("Nombre").fill("Nueva");
  await page.getByLabel("Apellido").fill("Persona");
  await page.getByLabel("Teléfono").fill("+51900000001");
  await page.getByRole("button", { name: "Enviar invitación" }).click();

  await expect(page.getByText("Invitación enviada")).toBeVisible();
});

/** docs/features/fix-invite-role-check/plan.md — CA-1. */
test("CA-1: el administrador invita a una recepción (USER) y a un médico (DOCTOR); ambos quedan en la tabla", async ({
  page,
}) => {
  const fixture = await setupFixture();
  const specialtyName = uniqueName("Especialidad CA1");
  await createSpecialty(fixture.admin, fixture.organizationId, specialtyName);
  // El plan Gratis incluye un médico: sin liberar al del fixture, la invitación del médico nuevo da 402.
  await softDeleteMembership(fixture.doctor.membershipId);

  await goToUsersPage(page, fixture);
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();

  const newUserEmail = uniqueEmail("recepcion-ca1");
  await openInviteModal(page);
  await continueWithEmail(page, newUserEmail);
  await page.getByLabel("Nombre").fill("Rita");
  await page.getByLabel("Apellido").fill("Recepción");
  await page.getByLabel("Teléfono").fill("+51900000101");
  await page.getByRole("button", { name: "Enviar invitación" }).click();

  await expect(page.getByText("Invitación enviada")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: newUserEmail, exact: true }),
  ).toBeVisible();

  const newDoctorEmail = uniqueEmail("doctor-ca1");
  await openInviteModal(page);
  await continueWithEmail(page, newDoctorEmail);
  await page.getByLabel("Nombre").fill("Darío");
  await page.getByLabel("Apellido").fill("Médico");
  await page.getByLabel("Teléfono").fill("+51900000102");
  await page.getByLabel("Rol").selectOption("DOCTOR");
  await page.getByLabel("Especialidades").fill(specialtyName);
  await page.getByRole("button", { name: specialtyName, exact: true }).click();
  await page.getByRole("button", { name: "Enviar invitación" }).click();

  await expect(page.getByText("Invitación enviada")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: newDoctorEmail, exact: true }),
  ).toBeVisible();
});

/** docs/features/fix-invite-role-check/plan.md — CA-7. */
test("CA-7: la recepción no puede abrir a mano la página de Usuarios de su propia sede", async ({
  page,
}) => {
  const fixture = await setupFixture();

  await goToUsersPage(page, fixture, {
    email: fixture.reception.email,
    accountId: fixture.admin.accountId,
  });

  // La recepción no tiene membership en la organización: el layout de ese
  // segmento (no el error.tsx del segmento hijo) atrapa el NoMembershipError.
  await expect(page.getByText("No se pudo cargar el workspace")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usuarios" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Invitar usuario" }),
  ).toHaveCount(0);
});
