import type { Page } from "@playwright/test";
import { PLATFORM_BASE_URL } from "../../support/env";
import {
  addMember,
  adminAsProfileUser,
  createProfileWorld,
  type ProfileWorld,
} from "../../support/profile";
import { expect, test } from "../../support/test";
import { clinicDashboardUrl, loginViaUi } from "../../support/ui";

// docs/features/doctor-profile-specialties/plan.md — PR 1, CA-1 a CA-3.

const NAME = "Marta";
const LAST_NAME = "Quispe";
const FULL_NAME = `${NAME} ${LAST_NAME}`;
const MOBILE = { width: 375, height: 812 };

type Place = "clinic" | "organization";

const avatar = (page: Page, fullName: string) =>
  page.getByRole("button", { name: `Tu cuenta: ${fullName}`, exact: true });

const profileItem = (page: Page) =>
  page.getByRole("menuitem", { name: "Mi perfil", exact: true });

async function signInAt(
  page: Page,
  user: { email: string; accountId: string },
  world: ProfileWorld,
  place: Place,
) {
  await loginViaUi(page, user.email, clinicDashboardUrl(user.accountId));
  const isClinic = place === "clinic";
  const resourceId = isClinic ? world.clinicId : world.organizationId;
  await page.context().addCookies([
    {
      name: "resource_id",
      value: resourceId,
      url: PLATFORM_BASE_URL,
      sameSite: "Lax",
    },
    {
      name: "resource_type",
      value: isClinic ? "CLINIC" : "ORGANIZATION",
      url: PLATFORM_BASE_URL,
      sameSite: "Lax",
    },
  ]);
  return `/account/${user.accountId}/${place}/${resourceId}`;
}

// El panel de la organización solo lo abre un miembro de la organización: ahí
// entra su ADMIN. En la sede basta un usuario de recepción.
async function memberAt(world: ProfileWorld, place: Place, label: string) {
  const user =
    place === "organization"
      ? adminAsProfileUser(world)
      : await addMember(world, "USER", {
          label,
          name: NAME,
          lastName: LAST_NAME,
        });
  return { user, fullName: `${user.name} ${user.lastName}` };
}

async function openAvatarMenu(page: Page, button: ReturnType<typeof avatar>) {
  await button.click();
  await expect(profileItem(page)).toBeVisible();
}

async function expectAvatarCurrent(page: Page, fullName: string) {
  const viewport = page.viewportSize();
  const mobile = viewport !== null && viewport.width < 768;
  if (mobile) {
    await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
    await expect(
      page.getByRole("dialog").getByRole("button", {
        name: `Tu cuenta: ${fullName}`,
        exact: true,
      }),
    ).toHaveAttribute("aria-current", "page");
    return;
  }
  await expect(avatar(page, fullName)).toHaveAttribute("aria-current", "page");
}

for (const place of ["clinic", "organization"] as const) {
  test(`CA-1 y CA-2: en «Mi perfil» de la ${place === "clinic" ? "sede" : "organización"}, el avatar y el ítem «Mi perfil» son la página actual`, async ({
    page,
  }) => {
    const world = await createProfileWorld(`aria-${place}`);
    const { user, fullName } = await memberAt(world, place, `aria-${place}`);
    const base = await signInAt(page, user, world, place);

    await page.goto(`${base}/me`);
    await expect(
      page.getByRole("heading", { level: 1, name: fullName }),
    ).toBeVisible();

    await expect(avatar(page, fullName)).toHaveAttribute(
      "aria-current",
      "page",
    );

    await avatar(page, fullName).click();
    await expect(profileItem(page)).toHaveAttribute("aria-current", "page");
  });

  test(`CA-1: a 375 px, en «Mi perfil» de la ${place === "clinic" ? "sede" : "organización"}, el avatar del menú desplegable es la página actual`, async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    const world = await createProfileWorld(`aria-mobile-${place}`);
    const { user, fullName } = await memberAt(
      world,
      place,
      `aria-mobile-${place}`,
    );
    const base = await signInAt(page, user, world, place);

    await page.goto(`${base}/me`);
    await expect(
      page.getByRole("heading", { level: 1, name: fullName }),
    ).toBeVisible();

    await expectAvatarCurrent(page, fullName);
  });
}

test("CA-3: en el inicio de la sede, ni el avatar ni «Mi perfil» son la página actual", async ({
  page,
}) => {
  const world = await createProfileWorld("aria-off-clinic");
  const user = await addMember(world, "USER", {
    label: "aria-off-clinic",
    name: NAME,
    lastName: LAST_NAME,
  });
  const base = await signInAt(page, user, world, "clinic");

  await page.goto(`${base}/dashboard`);

  const button = avatar(page, FULL_NAME);
  await expect(button).toBeVisible();
  await expect(button).not.toHaveAttribute("aria-current", /.*/);
  await openAvatarMenu(page, button);
  await expect(profileItem(page)).not.toHaveAttribute("aria-current", /.*/);
});

for (const section of ["clinics", "users"] as const) {
  test(`CA-3: en «${section === "clinics" ? "Sedes" : "Usuarios"}» de la organización, ni el avatar ni «Mi perfil» son la página actual`, async ({
    page,
  }) => {
    const world = await createProfileWorld(`aria-off-${section}`);
    const admin = world.admin;
    const fullName = `${admin.name} ${admin.lastName}`;
    const base = await signInAt(page, admin, world, "organization");

    await page.goto(`${base}/${section}`);

    const button = avatar(page, fullName);
    await expect(button).toBeVisible();
    await expect(button).not.toHaveAttribute("aria-current", /.*/);
    await openAvatarMenu(page, button);
    await expect(profileItem(page)).not.toHaveAttribute("aria-current", /.*/);
  });
}
