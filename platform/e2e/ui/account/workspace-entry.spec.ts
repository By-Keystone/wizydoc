import type { Page } from "@playwright/test";
import {
  createClinicResourceViaPrisma,
  createOnboardedAdmin,
  createOrganizationResource,
} from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { PLATFORM_BASE_URL } from "../../support/env";
import {
  addDoctor,
  adminAsProfileUser,
  createProfileWorld,
  type ProfileUser,
  type ProfileWorld,
} from "../../support/profile";
import { expect, test } from "../../support/test";
import { loginViaUi } from "../../support/ui";
import { uniqueName } from "../../support/users";

const PRIMARY_BUTTON_BACKGROUND = "rgb(12, 126, 117)";
const LIST_HEADING = "Elige dónde entrar";

const clinicDashboardPath = (accountId: string, clinicId: string) =>
  `/account/${accountId}/clinic/${clinicId}/dashboard`;

const listPath = (accountId: string) => `/account/${accountId}/select`;

const enterButtons = (page: Page) =>
  page.getByRole("button", { name: "Entrar", exact: true });

const enterButtonOfClinic = (page: Page, clinicName: string) =>
  page
    .getByRole("listitem")
    .filter({ hasText: clinicName })
    .getByRole("button", { name: "Entrar", exact: true });

const entryActors = [
  {
    label: "ADMIN de la organización",
    of: async (world: ProfileWorld): Promise<ProfileUser> =>
      adminAsProfileUser(world),
  },
  {
    label: "DOCTOR de la sede",
    of: (world: ProfileWorld) => addDoctor(world, { label: "entry-doctor" }),
  },
];

for (const actor of entryActors) {
  test(`con una sola sede, el ${actor.label} entra directo a su dashboard tras iniciar sesión`, async ({
    page,
  }) => {
    const world = await createProfileWorld("entry-one");
    const user = await actor.of(world);

    await loginViaUi(
      page,
      user.email,
      clinicDashboardPath(user.accountId, world.clinicId),
    );

    await expect(page.getByText(/Este es el panel de /)).toBeVisible();
    await expect(page).toHaveTitle("Inicio · WizyDoc");
    await expect(page).toHaveURL(
      clinicDashboardPath(user.accountId, world.clinicId),
    );
  });
}

test("con dos sedes, el login se queda en la lista y «Entrar» de cada sede es el botón principal", async ({
  page,
}) => {
  const world = await createProfileWorld("entry-two");
  const secondClinicName = uniqueName("Sede-segunda");
  const secondClinicId = await createClinicResourceViaPrisma(
    world.admin,
    world.organizationId,
    { name: secondClinicName },
  );

  await loginViaUi(page, world.admin.email, listPath(world.admin.accountId));

  await expect(page.getByRole("heading", { name: LIST_HEADING })).toBeVisible();
  await expect(page).toHaveURL(listPath(world.admin.accountId));
  await expect(enterButtons(page)).toHaveCount(3);

  for (const clinicName of [world.clinicName, secondClinicName]) {
    await expect(enterButtonOfClinic(page, clinicName)).toHaveCSS(
      "background-color",
      PRIMARY_BUTTON_BACKGROUND,
    );
  }
  await expect(enterButtons(page).first()).not.toHaveCSS(
    "background-color",
    PRIMARY_BUTTON_BACKGROUND,
  );

  await enterButtonOfClinic(page, secondClinicName).click();
  await expect(page).toHaveURL(
    clinicDashboardPath(world.admin.accountId, secondClinicId),
  );
});

test("una organización sin sedes se queda en la lista y su «Entrar» es el botón principal", async ({
  page,
}) => {
  const admin = await createOnboardedAdmin({ emailPrefix: "entry-no-clinics" });
  await createOrganizationResource(admin, uniqueName("ORG-sin-sedes"));

  await loginViaUi(page, admin.email, listPath(admin.accountId));

  await expect(page.getByRole("heading", { name: LIST_HEADING })).toBeVisible();
  await expect(enterButtons(page)).toHaveCount(1);
  await expect(enterButtons(page)).toHaveCSS(
    "background-color",
    PRIMARY_BUTTON_BACKGROUND,
  );
});

const expiredSessionSpaces = [
  {
    label: "la sede",
    resourceType: "CLINIC",
    segment: "clinic",
    resourceId: (world: ProfileWorld) => world.clinicId,
  },
  {
    label: "la organización",
    resourceType: "ORGANIZATION",
    segment: "organization",
    resourceId: (world: ProfileWorld) => world.organizationId,
  },
];

for (const space of expiredSessionSpaces) {
  test(`con la sesión vencida, abrir ${space.label} lleva a /login con su raíz como callbackUrl`, async ({
    page,
  }) => {
    const world = await createProfileWorld("entry-expired");
    const { admin } = world;
    const resourceId = space.resourceId(world);
    const spacePath = `/account/${admin.accountId}/${space.segment}/${resourceId}`;
    await loginViaUi(
      page,
      admin.email,
      clinicDashboardPath(admin.accountId, world.clinicId),
    );
    await page.context().addCookies([
      {
        name: "resource_id",
        value: resourceId,
        url: PLATFORM_BASE_URL,
        sameSite: "Lax",
      },
      {
        name: "resource_type",
        value: space.resourceType,
        url: PLATFORM_BASE_URL,
        sameSite: "Lax",
      },
    ]);
    const prisma = await getTestPrisma();
    await prisma.session.deleteMany({ where: { userId: admin.userId } });

    await page.goto(`${spacePath}/me`);

    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/login" &&
        url.searchParams.get("callbackUrl") === spacePath,
    );
  });
}

test("«Cambiar de sede» muestra la lista aunque haya una sola sede", async ({
  page,
}) => {
  const world = await createProfileWorld("entry-switch");
  const { admin } = world;
  await loginViaUi(
    page,
    admin.email,
    clinicDashboardPath(admin.accountId, world.clinicId),
  );

  await page
    .getByRole("button", {
      name: `Tu cuenta: ${admin.name} ${admin.lastName}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Cambiar de sede", exact: true })
    .click();

  await expect(page).toHaveURL(`${listPath(admin.accountId)}?switch=1`);
  await expect(page.getByRole("heading", { name: LIST_HEADING })).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: world.clinicName }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: LIST_HEADING })).toBeVisible();
  await expect(page).toHaveURL(`${listPath(admin.accountId)}?switch=1`);

  await enterButtonOfClinic(page, world.clinicName).click();
  await expect(page).toHaveURL(
    clinicDashboardPath(admin.accountId, world.clinicId),
  );
});
