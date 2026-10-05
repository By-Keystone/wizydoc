import { test, expect } from "../../support/test";
import {
  createClinicResource,
  createClinicResourceViaPrisma,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  inviteUserViaApi,
} from "../../support/accounts";
import { authPost, uniqueName } from "../../support/users";
import { extractLink, readLatestEmailTo } from "../../support/email";
import { loginViaUi } from "../../support/ui";
import { invitePendingUser } from "../../support/invitations";

const DOCTOR_PASSWORD = "Clave-Medico-2026";

/** docs/features/fix-invitation-set-password/plan.md — CA-4 ([e2e]). */
test("CA-4: médico que ya tiene contraseña e es invitado a otra sede ve 'Aceptar invitación', no el formulario de contraseña", async ({
  page,
}) => {
  const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca4" });
  const organizationId = await createOrganizationResource(admin, uniqueName("ORG-CA4"));
  const clinicA = await createClinicResource(admin, organizationId, {
    name: uniqueName("Sede A CA4"),
  });
  const specialtyId = await createSpecialty(admin, organizationId, uniqueName("Pediatría"));

  const doctor = await invitePendingUser(admin, {
    resourceId: clinicA,
    role: "DOCTOR",
    emailPrefix: "doctor-con-clave-ca4",
    specialtyIds: [specialtyId],
  });

  await authPost(admin.context, "/invitations/set-password", {
    token: doctor.token,
    password: DOCTOR_PASSWORD,
  });

  // Otra sede de la misma cuenta: el plan Gratis limita a una, así que la de
  // control se crea por Prisma, igual que en lookup-fixture.ts.
  const clinicB = await createClinicResourceViaPrisma(admin, organizationId, {
    name: uniqueName("Sede B CA4"),
  });

  await inviteUserViaApi(admin, {
    email: doctor.email,
    name: "Lucía",
    lastName: "Paredes",
    phone: "+51987654321",
    role: "USER",
    resourceId: clinicB,
  });

  await expect
    .poll(() => readLatestEmailTo(doctor.email)?.subject)
    .toBe("WizyDoc - Invitación");
  const secondInvitationEmail = readLatestEmailTo(doctor.email);
  const secondInvitationLink = extractLink(secondInvitationEmail!.html, "/invite/accept");

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
