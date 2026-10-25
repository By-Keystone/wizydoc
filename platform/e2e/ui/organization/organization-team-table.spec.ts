import type { Page } from "@playwright/test";
import {
  createApiContext,
  createClinicResource,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
} from "../../support/accounts";
import { PLATFORM_BASE_URL } from "../../support/env";
import { invitePendingUser } from "../../support/invitations";
import { expect, test } from "../../support/test";
import { clinicDashboardUrl, loginViaUi } from "../../support/ui";
import { authPost, E2E_PASSWORD, uniqueName } from "../../support/users";

// docs/features/doctor-profile-membership/plan.md, iteración 2: la tabla de la organización muestra a todo el equipo con sus accesos.

const horizontalOverflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

async function setup(label: string) {
  const admin = await createOnboardedAdmin({
    emailPrefix: `team-${label}`,
    name: "Alicia",
    lastName: "Equipo",
  });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName(`ORG-${label}`),
  );
  const clinicName = uniqueName("Sede-equipo");
  const clinicId = await createClinicResource(admin, organizationId, {
    name: clinicName,
  });
  return { admin, organizationId, clinicName, clinicId };
}

async function openUsers(page: Page, world: Awaited<ReturnType<typeof setup>>) {
  await loginViaUi(
    page,
    world.admin.email,
    clinicDashboardUrl(world.admin.accountId),
  );
  await page.context().addCookies([
    {
      name: "resource_id",
      value: world.organizationId,
      url: PLATFORM_BASE_URL,
    },
    { name: "resource_type", value: "ORGANIZATION", url: PLATFORM_BASE_URL },
  ]);
  await page.goto(
    `/account/${world.admin.accountId}/organization/${world.organizationId}/users`,
  );
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
}

for (const viewport of [
  { key: "pc", label: "1280 px", size: { width: 1280, height: 800 } },
  { key: "mov", label: "375 px", size: { width: 375, height: 812 } },
]) {
  test.describe(`tabla del equipo (${viewport.label})`, () => {
    test.use({ viewport: viewport.size });

    test("los accesos salen como chips con su aria-label, con «Tú» y «Invitación pendiente», y sin desplazamiento horizontal", async ({
      page,
    }) => {
      const world = await setup(`chips-${viewport.key}`);
      const doctor = await createMemberWithRole({
        accountId: world.admin.accountId,
        resourceId: world.clinicId,
        role: "DOCTOR",
        createdBy: world.admin.userId,
        emailPrefix: `team-doctor-${viewport.key}`,
        name: "Dario",
        lastName: uniqueName("Medico"),
      });
      const invited = await invitePendingUser(world.admin, {
        resourceId: world.clinicId,
        role: "USER",
        emailPrefix: `team-invited-${viewport.key}`,
        name: "Ines",
        lastName: uniqueName("Pendiente"),
      });
      await openUsers(page, world);

      const ownRow = page.getByRole("row", { name: /Alicia Equipo/ });
      await expect(ownRow.getByText("Tú", { exact: true })).toBeVisible();
      const ownAccesses = page.getByRole("list", {
        name: "Accesos de Alicia Equipo",
      });
      await expect(ownAccesses.getByRole("listitem")).toHaveText([
        "Todas las sedes · Administrador",
        `${world.clinicName} · Médico`,
      ]);
      const doctorAccesses = page.getByRole("list", {
        name: `Accesos de ${doctor.name} ${doctor.lastName}`,
      });
      await expect(doctorAccesses.getByRole("listitem")).toHaveText([
        `${world.clinicName} · Médico`,
      ]);
      const invitedRow = page.getByRole("row", { name: /Ines/ });
      await expect(invitedRow.getByText("Invitación pendiente")).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      await authPost(await createApiContext(), "/invitations/set-password", {
        token: invited.token,
        password: E2E_PASSWORD,
      });
      await page.reload();
      await expect(
        page
          .getByRole("row", { name: /Ines/ })
          .getByText("Invitación pendiente"),
      ).toHaveCount(0);
    });

    test("estando solo, se ve el texto nuevo del vacío", async ({ page }) => {
      const world = await setup(`empty-${viewport.key}`);
      await openUsers(page, world);

      await expect(
        page.getByText(
          "Invita a quien trabaje en todas las sedes, o asigna a cada médico las sedes donde atiende.",
        ),
      ).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}
