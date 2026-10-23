import { test, expect } from "../../support/test";
import {
  createApiContext,
  createClinicResource,
  createClinicResourceViaPrisma,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  inviteUserViaApi,
} from "../../support/accounts";
import { authPost, uniqueName } from "../../support/users";
import {
  extractLink,
  readEmailsTo,
  readLatestEmailTo,
} from "../../support/email";
import { loginViaUi } from "../../support/ui";
import { invitePendingUser } from "../../support/invitations";

const DOCTOR_PASSWORD = "Clave-Medico-2026";

/** docs/features/fix-invitation-set-password/plan.md — CA-4 ([e2e]). */
test("CA-4: médico con dos invitaciones pendientes fija la contraseña con la primera y la segunda muestra 'Aceptar invitación', no el formulario de contraseña", async ({
  page,
}) => {
  const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca4" });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName("ORG-CA4"),
  );
  const clinicA = await createClinicResource(admin, organizationId, {
    name: uniqueName("Sede A CA4"),
  });
  const specialtyId = await createSpecialty(
    admin,
    organizationId,
    uniqueName("Pediatría"),
  );

  const doctor = await invitePendingUser(admin, {
    resourceId: clinicA,
    role: "DOCTOR",
    emailPrefix: "doctor-con-clave-ca4",
    specialtyIds: [specialtyId],
  });

  // Otra sede de la misma cuenta: el plan Gratis limita a una, así que la de
  // control se crea por Prisma, igual que en lookup-fixture.ts.
  const clinicB = await createClinicResourceViaPrisma(admin, organizationId, {
    name: uniqueName("Sede B CA4"),
  });

  // Sin contraseña todavía, una segunda sede genera una segunda invitación con su propio correo.
  const emailsBefore = readEmailsTo(doctor.email).length;
  await inviteUserViaApi(admin, {
    email: doctor.email,
    name: "Lucía",
    lastName: "Paredes",
    phone: "+51987654321",
    role: "USER",
    resourceId: clinicB,
  });

  await expect
    .poll(() => readEmailsTo(doctor.email).length)
    .toBe(emailsBefore + 1);
  const secondInvitationEmail = readLatestEmailTo(doctor.email);
  const secondInvitationLink = extractLink(
    secondInvitationEmail!.html,
    "/invite/accept",
  );

  // Contexto propio: set-password inicia sesión como el médico y pisaría la cookie del administrador.
  await authPost(await createApiContext(), "/invitations/set-password", {
    token: doctor.token,
    password: DOCTOR_PASSWORD,
  });

  await page.goto(secondInvitationLink);

  await expect(page.getByText("te invitaron a")).toBeVisible();
  await expect(
    page.getByText("Acepta la invitación para unirte al equipo."),
  ).toBeVisible();
  await expect(page.getByLabel("Contraseña")).toHaveCount(0);

  await page.getByRole("button", { name: "Aceptar invitación" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await loginViaUi(
    page,
    doctor.email,
    new RegExp(`/account/${admin.accountId}/select$`),
    DOCTOR_PASSWORD,
  );
});

test("CA-4b: asignar a otra sede a quien ya tiene contraseña no envía correo", async () => {
  const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca4b" });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName("ORG-CA4B"),
  );
  const clinicA = await createClinicResource(admin, organizationId, {
    name: uniqueName("Sede A CA4B"),
  });
  const clinicB = await createClinicResourceViaPrisma(admin, organizationId, {
    name: uniqueName("Sede B CA4B"),
  });
  const doctor = await invitePendingUser(admin, {
    resourceId: clinicA,
    role: "USER",
    emailPrefix: "usuario-con-clave-ca4b",
  });
  await authPost(await createApiContext(), "/invitations/set-password", {
    token: doctor.token,
    password: DOCTOR_PASSWORD,
  });
  const emailsBefore = readEmailsTo(doctor.email).length;

  const response = await inviteUserViaApi(admin, {
    email: doctor.email,
    name: "Lucía",
    lastName: "Paredes",
    phone: "+51987654321",
    role: "USER",
    resourceId: clinicB,
  });

  expect(await response.json()).toMatchObject({
    outcome: "created",
    invitationSent: false,
  });
  expect(readEmailsTo(doctor.email)).toHaveLength(emailsBefore);
});
