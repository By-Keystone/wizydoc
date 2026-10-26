import type { Page } from "@playwright/test";
import {
  createApiContext,
  createClinicResource,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  type SeedMembershipRole,
} from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { API_BASE_URL } from "../../support/env";
import {
  firstSteps,
  readAccountFootprint,
  readFirstClinicRecords,
  stepNamed,
  visibleCoralElements,
} from "../../support/first-use";
import { enablePatientRecords } from "../../support/patients";
import { expect, test } from "../../support/test";
import {
  clinicDashboardUrl,
  fillOnboardingForm,
  loginViaUi,
  ONBOARDING_ADDRESS,
  ONBOARDING_SPECIALTY,
} from "../../support/ui";
import { createConfirmedUser, uniqueName } from "../../support/users";

// docs/features/primer-uso/plan.md CA-18 a CA-21 y CA-38 (el modo «Termina» tampoco lleva coral).

const FINISH_TITLE = "Termina de crear tu consultorio";
const FINISH_DESCRIPTION = "Te falta este paso para tener tu link de reservas.";
const BETA_PHRASE =
  "Durante la beta, todas las cuentas empiezan en Gratis y los planes de pago se activan a pedido.";

const createButton = (page: Page) =>
  page.getByRole("button", { name: "Crear mi consultorio", exact: true });

test.describe("Dueño de la beta sin organización (CA-18, CA-19)", () => {
  test("CA-18: al iniciar sesión y al abrir /select, con o sin ?switch=1, llega al formulario «Termina de crear tu consultorio», sin la frase de la beta", async ({
    page,
  }) => {
    const owner = await createOnboardedAdmin({ emailPrefix: "termina-ca18" });

    await loginViaUi(page, owner.email, /\/onboarding$/);

    await expect(
      page.getByRole("heading", { level: 1, name: FINISH_TITLE, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(FINISH_DESCRIPTION, { exact: true }),
    ).toBeVisible();
    for (const label of [
      "Nombre del consultorio",
      "Dirección",
      "Tu especialidad",
    ]) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
    await expect(createButton(page)).toBeVisible();
    await expect(page.getByText(BETA_PHRASE)).toHaveCount(0);
    expect(await visibleCoralElements(page)).toEqual([]);

    for (const query of ["", "?switch=1"]) {
      await page.goto(`/account/${owner.accountId}/select${query}`);
      await expect(page).toHaveURL(/\/onboarding$/);
      await expect(
        page.getByRole("heading", { name: FINISH_TITLE }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Elige dónde entrar" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Crear organización" }),
      ).toHaveCount(0);
    }
  });

  test("CA-19: al crear, la cuenta y la suscripción Gratis son las mismas, queda lo de CA-7 y el dueño llega a la guía de CA-13", async ({
    page,
  }) => {
    const owner = await createOnboardedAdmin({ emailPrefix: "termina-ca19" });
    const name = uniqueName("Consultorio Paredes");
    const footprintBefore = await readAccountFootprint(owner.accountId);
    await loginViaUi(page, owner.email, /\/onboarding$/);

    await fillOnboardingForm(page, { name });
    await createButton(page).click();

    await expect(page).toHaveURL(clinicDashboardUrl(owner.accountId), {
      timeout: 20_000,
    });
    const me = await owner.context.get(`${API_BASE_URL}/user/me`);
    expect((await me.json()).accountId).toBe(owner.accountId);

    const prisma = await getTestPrisma();
    expect(
      await prisma.account.count({ where: { ownerId: owner.userId } }),
    ).toBe(1);
    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { accountId: owner.accountId },
    });
    expect(subscription.plan).toBe("FREE");
    expect(await readAccountFootprint(owner.accountId)).toEqual({
      ...footprintBefore,
      resources: 2,
      organizations: 1,
      clinics: 1,
      memberships: 2,
      doctorProfiles: 1,
      specialties: 1,
    });

    const records = await readFirstClinicRecords(owner.accountId, owner.userId);
    expect(records.organization?.name).toBe(name);
    expect(records.clinic).toMatchObject({
      name,
      address: ONBOARDING_ADDRESS,
      phone: "",
    });
    expect(records.organizationMembership?.role).toBe("ADMIN");
    expect(records.clinicMembership?.role).toBe("DOCTOR");
    expect(
      records.clinicMembership?.doctorProfile?.specialties.map(
        (specialty) => specialty.name,
      ),
    ).toEqual([ONBOARDING_SPECIALTY]);

    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Te falta 1 paso para recibir citas",
      }),
    ).toBeVisible();
    await expect(stepNamed(page, "Elige tu especialidad")).toContainText(
      ONBOARDING_SPECIALTY,
    );
  });

  test("CA-19: con un plan de pago sembrado por Prisma la cuenta conserva su plan y el dueño llega a la guía", async ({
    page,
  }) => {
    const owner = await createOnboardedAdmin({ emailPrefix: "termina-pago" });
    await enablePatientRecords(owner.accountId);
    await loginViaUi(page, owner.email, /\/onboarding$/);

    await fillOnboardingForm(page, { name: uniqueName("Consultorio de pago") });
    await createButton(page).click();

    await expect(page).toHaveURL(clinicDashboardUrl(owner.accountId), {
      timeout: 20_000,
    });
    await expect(firstSteps(page)).toBeVisible();
    const prisma = await getTestPrisma();
    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { accountId: owner.accountId },
    });
    expect(subscription.plan).toBe("CONSULTORIO");
    expect(subscription.status).toBe("ACTIVE");
    expect(
      await prisma.subscription.count({
        where: { accountId: owner.accountId },
      }),
    ).toBe(1);
  });
});

test.describe("Quién ve el formulario (CA-20, CA-21)", () => {
  async function ownerWithClinic() {
    const owner = await createOnboardedAdmin({ emailPrefix: "termina-ca20" });
    const organizationId = await createOrganizationResource(owner);
    const clinicId = await createClinicResource(owner, organizationId);
    return { owner, organizationId, clinicId };
  }

  async function expectRedirectedAwayFromOnboarding(
    page: Page,
    email: string,
    accountId: string,
  ) {
    await loginViaUi(page, email, new RegExp(`/account/${accountId}/`));
    await page.goto("/onboarding");
    await expect(page).toHaveURL(new RegExp(`/account/${accountId}/`));
    await expect(page).not.toHaveURL(/\/onboarding/);
  }

  test("CA-20: el dueño con organización es redirigido fuera del formulario", async ({
    page,
  }) => {
    const owner = await createOnboardedAdmin({ emailPrefix: "termina-dueno" });
    await createOrganizationResource(owner);

    await expectRedirectedAwayFromOnboarding(
      page,
      owner.email,
      owner.accountId,
    );
  });

  const invitedRoles: { role: SeedMembershipRole; onOrganization: boolean }[] =
    [
      { role: "ADMIN", onOrganization: true },
      { role: "DOCTOR", onOrganization: false },
      { role: "USER", onOrganization: false },
    ];

  for (const { role, onOrganization } of invitedRoles) {
    test(`CA-20: un ${role} invitado es redirigido fuera del formulario`, async ({
      page,
    }) => {
      const world = await ownerWithClinic();
      const member = await createMemberWithRole({
        accountId: world.owner.accountId,
        resourceId: onOrganization ? world.organizationId : world.clinicId,
        role,
        createdBy: world.owner.userId,
        emailPrefix: `termina-${role.toLowerCase()}`,
      });

      await expectRedirectedAwayFromOnboarding(
        page,
        member.email,
        world.owner.accountId,
      );
    });
  }

  test("CA-20: quien no es el dueño y no tiene memberships es redirigido y sigue viendo «No perteneces a ninguna organización todavía.», sin Crear organización", async ({
    page,
  }) => {
    const owner = await createOnboardedAdmin({ emailPrefix: "termina-vecino" });
    const bystanderContext = await createApiContext();
    const bystander = await createConfirmedUser(bystanderContext, {
      emailPrefix: "termina-sin-membership",
    });
    const prisma = await getTestPrisma();
    await prisma.user.update({
      where: { email: bystander.email },
      data: { accountId: owner.accountId, onboardingCompleted: true },
    });

    await expectRedirectedAwayFromOnboarding(
      page,
      bystander.email,
      owner.accountId,
    );

    await expect(
      page.getByText("No perteneces a ninguna organización todavía."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Crear organización" }),
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { name: FINISH_TITLE })).toHaveCount(
      0,
    );
  });

  test("CA-21: con organización y sin sede, «Elige dónde entrar» muestra la organización sin redirigir al formulario, y el ADMIN sigue viendo Crear organización", async ({
    page,
  }) => {
    const owner = await createOnboardedAdmin({ emailPrefix: "termina-ca21" });
    const organizationName = uniqueName("ORG-CA21");
    await createOrganizationResource(owner, organizationName);

    await loginViaUi(
      page,
      owner.email,
      new RegExp(`/account/${owner.accountId}/select$`),
    );

    await expect(
      page.getByRole("heading", { name: "Elige dónde entrar" }),
    ).toBeVisible();
    await expect(page.getByText(organizationName)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Crear organización" }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/\/onboarding/);
  });
});
