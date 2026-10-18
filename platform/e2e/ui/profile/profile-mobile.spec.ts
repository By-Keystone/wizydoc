import type { Page } from "@playwright/test";
import { expect, test } from "../../support/test";
import {
  addDoctor,
  addDoctorToSecondClinic,
  createProfileWorld,
  loginAndOpenProfile,
  type ProfileWorkspace,
} from "../../support/profile";
import { uniqueName } from "../../support/users";

// docs/features/perfil-usuario/plan.md — PR 4, CA-73.

test.use({ viewport: { width: 375, height: 812 } });

const LONG_NAME = "W".repeat(60);

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

async function scenario(label: string) {
  const world = await createProfileWorld(label);
  const doctor = await addDoctor(world, {
    label,
    name: LONG_NAME,
    lastName: "Quispe",
    treatment: "DRA",
    specialtyIds: [world.specialtyId],
  });
  await addDoctorToSecondClinic(world, doctor, uniqueName("Sede-segunda"), []);
  return { world, doctor };
}

const WORKSPACES: {
  label: string;
  workspace: (clinicId: string) => ProfileWorkspace;
}[] = [
  { label: "workspaces", workspace: () => ({ kind: "workspaces" }) },
  {
    label: "dentro de la sede",
    workspace: (clinicId) => ({ kind: "clinic", clinicId }),
  },
];

for (const { label, workspace } of WORKSPACES) {
  test(`CA-73: a 375 px no hay desplazamiento horizontal (${label}) en lectura, edición y con la contraseña abierta`, async ({
    page,
  }) => {
    const { world, doctor } = await scenario(`mobile-${label.slice(0, 4)}`);

    await loginAndOpenProfile(page, doctor, workspace(world.clinicId));
    const personal = page.getByRole("region", { name: "Datos personales" });
    await expect(personal).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await personal.getByRole("button", { name: "Editar", exact: true }).click();
    await expect(
      personal.getByRole("button", { name: "Guardar cambios", exact: true }),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await page
      .getByRole("region", { name: "Contraseña" })
      .getByRole("button", { name: "Cambiar contraseña", exact: true })
      .click();
    await expect(
      page.getByLabel("Contraseña actual", { exact: true }),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
}
