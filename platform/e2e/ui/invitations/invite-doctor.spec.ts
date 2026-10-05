import { test, expect } from "../../support/test";
import { API_BASE_URL, PLATFORM_BASE_URL } from "../../support/env";
import {
  createOnboardedAdmin,
  createClinicResource,
  createOrganizationResource,
  createSpecialty,
  inviteUserViaApi,
} from "../../support/accounts";
import { uniqueEmail, uniqueName } from "../../support/users";
import { extractLink, readLatestEmailTo } from "../../support/email";
import { loginViaUi } from "../../support/ui";

const INVITED_DOCTOR_PASSWORD = "Clave-Doctora-2026";

/**
 * docs/features/fix-auth-user-fields-input/plan.md — CA-13 y CA-14.
 * docs/features/fix-invitation-set-password/plan.md — CA-1, CA-2, CA-3 y CA-11 ([e2e]).
 */
test("CA-1, CA-2 y CA-3 (y CA-13/CA-14 de fix-auth-user-fields-input): la médica invitada ve el formulario de contraseña directamente, entra con sesión y vuelve a entrar con esa contraseña tras cerrar sesión", async ({
  page,
}) => {
  const victim = await createOnboardedAdmin({
    emailPrefix: "victima-ca13",
    name: "Victoria",
    lastName: "Rojas",
  });
  const organizationId = await createOrganizationResource(
    victim,
    uniqueName("ORG-CA13"),
  );
  const clinicId = await createClinicResource(victim, organizationId, {
    name: uniqueName("Sede CA-13"),
  });
  const specialtyId = await createSpecialty(
    victim,
    organizationId,
    uniqueName("Cardiología"),
  );

  const doctorEmail = uniqueEmail("doctora-ca13");
  await inviteUserViaApi(victim, {
    email: doctorEmail,
    name: "Daniela",
    lastName: "Flores",
    phone: "+51955555555",
    role: "DOCTOR",
    resourceId: clinicId,
    specialtyIds: [specialtyId],
  });

  await expect
    .poll(() => readLatestEmailTo(doctorEmail)?.subject)
    .toBe("WizyDoc - Invitación");
  const invitationEmail = readLatestEmailTo(doctorEmail);
  const invitationLink = extractLink(invitationEmail!.html, "/invite/accept");

  await page.goto(invitationLink);

  // CA-1: directamente el formulario de contraseña, sin paso previo de "Aceptar invitación".
  await expect(page.getByText("te invitaron a")).toBeVisible();
  await expect(
    page.getByText("Configura una contraseña para activar tu cuenta."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aceptar invitación" }),
  ).toHaveCount(0);

  const passwordInput = page.getByLabel("Contraseña");
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(INVITED_DOCTOR_PASSWORD);
  await page.getByRole("button", { name: "Activar cuenta" }).click();

  // CA-2: sesión iniciada directo a /select, sin pasar por /login.
  await expect(page).toHaveURL(
    new RegExp(`/account/${victim.accountId}/select$`),
  );

  const doctorMeResponse = await page.request.get(`${API_BASE_URL}/user/me`, {
    headers: { Origin: PLATFORM_BASE_URL },
  });
  expect(doctorMeResponse.status()).toBe(200);
  const doctorMe = await doctorMeResponse.json();
  expect(doctorMe.accountId).toBe(victim.accountId);
  expect(doctorMe.onboardingCompleted).toBe(true);

  // CA-11: reabrir el mismo link tras fijar la contraseña muestra "Invitación inválida".
  await page.goto(invitationLink);
  await expect(page.getByText("Invitación inválida")).toBeVisible();
  await expect(page.getByLabel("Contraseña")).toHaveCount(0);

  await page.context().clearCookies();

  // CA-3: cierra sesión e inicia con la contraseña que acaba de fijar.
  await loginViaUi(
    page,
    doctorEmail,
    new RegExp(`/account/${victim.accountId}/select$`),
    INVITED_DOCTOR_PASSWORD,
  );

  await page.context().clearCookies();
  await loginViaUi(
    page,
    victim.email,
    new RegExp(`/account/${victim.accountId}/select$`),
  );
});
