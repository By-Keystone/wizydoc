import { test, expect } from "../../support/test";
import {
  createClinicResource,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
} from "../../support/accounts";
import { uniqueName } from "../../support/users";
import {
  invitePendingUser,
  markInvitationExpiredStatus,
  softDeleteMembership,
} from "../../support/invitations";

/** docs/features/fix-invitation-set-password/plan.md — CA-13 ([e2e]). */
test.describe("CA-13: invitación inválida antes de llegar al formulario de contraseña", () => {
  test("estado EXPIRED con fecha de caducidad aún futura", async ({ page }) => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca13-expired" });
    const organizationId = await createOrganizationResource(admin, uniqueName("ORG-CA13E"));
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA13E"),
    });

    const invited = await invitePendingUser(admin, {
      resourceId: clinicId,
      role: "USER",
      emailPrefix: "usuario-ca13-expired",
    });
    await markInvitationExpiredStatus(invited.token);

    await page.goto(`/invite/accept?token=${invited.token}`);

    await expect(page.getByText("Invitación inválida")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Aceptar invitación" })).toHaveCount(0);
  });

  test("membership borrada", async ({ page }) => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca13-deleted" });
    const organizationId = await createOrganizationResource(admin, uniqueName("ORG-CA13D"));
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA13D"),
    });
    const specialtyId = await createSpecialty(admin, organizationId, uniqueName("Dermatología"));

    const invited = await invitePendingUser(admin, {
      resourceId: clinicId,
      role: "DOCTOR",
      emailPrefix: "doctor-ca13-deleted",
      specialtyIds: [specialtyId],
    });
    await softDeleteMembership(invited.membershipId);

    await page.goto(`/invite/accept?token=${invited.token}`);

    await expect(page.getByText("Invitación inválida")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toHaveCount(0);
  });
});
