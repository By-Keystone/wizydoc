import type { Page } from "@playwright/test";
import {
  createClinicResource,
  createClinicResourceViaPrisma,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
} from "../../support/accounts";
import { seedFullDayAvailability } from "../../support/availability";
import { getTestPrisma } from "../../support/db";
import {
  addDoctor,
  addDoctorProfile,
  addMember,
  adminAsProfileUser,
  createProfileWorld,
  loginAndOpenProfile,
  type ProfileUser,
  type ProfileWorkspace,
  type ProfileWorld,
  readStoredUser,
} from "../../support/profile";
import { expect, test } from "../../support/test";
import { uniqueName } from "../../support/users";

// docs/features/doctor-profile-specialties/plan.md, PR 5: CA-51 a CA-67.

const SAVED = "Guardamos tus especialidades.";
const NO_SCHEDULE =
  "Sin horarios en esta sede, todavía no apareces en el link de reserva.";
const FORBIDDEN = "Solo un administrador puede cambiar especialidades.";
const OTHER_CLINICS = "Otras sedes donde atiendes";

const section = (page: Page) =>
  page.getByRole("region", { name: "Dónde atiendes", exact: true });
const personal = (page: Page) =>
  page.getByRole("region", { name: "Datos personales", exact: true });
const searchField = (page: Page, clinicName: string) =>
  page.getByLabel(`Especialidades en ${clinicName}`, { exact: true });
const assignButton = (page: Page, clinicName: string) =>
  page.getByRole("button", {
    name: `Asignar especialidades en ${clinicName}`,
    exact: true,
  });
const editButton = (page: Page, clinicName: string) =>
  page.getByRole("button", {
    name: `Editar especialidades de ${clinicName}`,
    exact: true,
  });
const removeChip = (page: Page, specialtyName: string) =>
  page.getByRole("button", { name: `Quitar ${specialtyName}`, exact: true });
const saveButton = (page: Page) =>
  page.getByRole("button", { name: "Guardar especialidades", exact: true });
const cancelButton = (page: Page) =>
  section(page).getByRole("button", { name: "Cancelar", exact: true });

const toast = (page: Page, text: string) =>
  page.getByText(text, { exact: true }).first();

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

async function orgAdminOf(world: ProfileWorld, label: string) {
  return addMember(world, "ADMIN", {
    label,
    clinicId: world.organizationId,
  });
}

async function softDeleteOrganizationMembership(
  userId: string,
  organizationId: string,
) {
  const prisma = await getTestPrisma();
  await prisma.userResourceMembership.updateMany({
    where: { userId, resourceId: organizationId },
    data: { deletedAt: new Date() },
  });
}

async function storedSpecialtyIds(userId: string, clinicId: string) {
  const prisma = await getTestPrisma();
  const profile = await prisma.doctorProfile.findFirst({
    where: { membership: { userId, resourceId: clinicId } },
    select: { specialties: { select: { id: true } } },
  });
  const specialties = profile?.specialties as { id: string }[] | undefined;
  return specialties?.map((s) => s.id).sort() ?? null;
}

async function slowServerActions(page: Page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    await route.continue();
  });
}

function trackServerActions(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) {
      calls.push(request.url());
    }
  });
  return calls;
}

function bareOwner(world: Awaited<ReturnType<typeof createBareWorld>>) {
  const { admin } = world;
  return {
    email: admin.email,
    userId: admin.userId,
    accountId: admin.accountId,
    name: admin.name,
    lastName: admin.lastName,
  };
}

// Organización sin ninguna especialidad creada.
async function createBareWorld(label: string) {
  const admin = await createOnboardedAdmin({ emailPrefix: `admin-${label}` });
  const organizationName = uniqueName(`ORG-${label}`);
  const organizationId = await createOrganizationResource(
    admin,
    organizationName,
  );
  const clinicName = uniqueName(`Sede-${label}`);
  const clinicId = await createClinicResource(admin, organizationId, {
    name: clinicName,
  });
  return { admin, organizationId, organizationName, clinicId, clinicName };
}

const WORKSPACES: {
  key: string;
  label: string;
  of: (world: { clinicId: string; organizationId: string }) => ProfileWorkspace;
}[] = [
  {
    key: "ws",
    label: "bajo los workspaces",
    of: () => ({ kind: "workspaces" }),
  },
  {
    key: "sede",
    label: "en la sede",
    of: ({ clinicId }) => ({ kind: "clinic", clinicId }),
  },
  {
    key: "org",
    label: "en la organización",
    of: ({ organizationId }) => ({ kind: "organization", organizationId }),
  },
];

const ACTORS: {
  key: string;
  label: string;
  of: (world: ProfileWorld, label: string) => Promise<ProfileUser>;
}[] = [
  {
    key: "adm",
    label: "ADMIN de la organización",
    of: (world, label) => orgAdminOf(world, label),
  },
  {
    key: "own",
    label: "dueño",
    of: async (world) => adminAsProfileUser(world),
  },
];

const VIEWPORTS = [
  { key: "mov", label: "375 px", size: { width: 375, height: 812 } },
  { key: "pc", label: "computadora", size: { width: 1280, height: 800 } },
];

for (const viewport of VIEWPORTS) {
  test.describe(`asignar especialidades a una sede sin ellas (${viewport.label})`, () => {
    test.use({ viewport: viewport.size });

    for (const actor of ACTORS) {
      for (const workspace of WORKSPACES) {
        test(`CA-51 a CA-54 y CA-65: ${actor.label}, ${workspace.label}: fila, búsqueda, chips, guardar con toast y foco`, async ({
          page,
        }) => {
          const label = `flow-${actor.key}-${workspace.key}-${viewport.key}`;
          const world = await createProfileWorld(label);
          const user = await actor.of(world, label);
          await addDoctorProfile(user.userId, world.clinicId, []);
          const searchable = uniqueName("Neuro");
          const searchableId = await createSpecialty(
            world.admin,
            world.organizationId,
            searchable,
          );
          await slowServerActions(page);

          await loginAndOpenProfile(page, user, workspace.of(world));

          await expect(section(page)).toBeVisible();
          await expect(
            section(page).getByText(
              "Elige las especialidades que atiendes en cada sede.",
              { exact: true },
            ),
          ).toBeVisible();
          await expect(
            section(page).getByText(
              `${world.organizationName} · Sin especialidades`,
              { exact: true },
            ),
          ).toBeVisible();
          await expect(assignButton(page, world.clinicName)).toHaveText(
            "Asignar especialidades",
          );
          await expect(
            section(page).getByText(OTHER_CLINICS, { exact: true }),
          ).toHaveCount(0);
          await expect(
            page.getByText("Tu plan no permite", { exact: false }),
          ).toHaveCount(0);
          if (viewport.key === "mov") {
            expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
          }

          await assignButton(page, world.clinicName).click();
          const search = searchField(page, world.clinicName);
          await expect(search).toBeFocused();
          await expect(search).toHaveAttribute(
            "placeholder",
            "Buscar especialidad...",
          );

          await search.fill(searchable.slice(0, 8));
          await section(page)
            .getByRole("button", { name: searchable, exact: true })
            .click();
          await expect(removeChip(page, searchable)).toBeVisible();
          await expect(search).toHaveValue("");

          await removeChip(page, searchable).click();
          await expect(removeChip(page, searchable)).toHaveCount(0);

          await search.fill(searchable);
          await section(page)
            .getByRole("button", { name: searchable, exact: true })
            .click();
          await search.fill(world.specialtyName);
          await section(page)
            .getByRole("button", { name: world.specialtyName, exact: true })
            .click();
          if (viewport.key === "mov") {
            expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
          }

          await saveButton(page).click();
          await expect(
            section(page).getByRole("button", {
              name: "Guardando…",
              exact: true,
            }),
          ).toBeVisible();

          await expect(toast(page, SAVED)).toBeVisible();
          await expect(editButton(page, world.clinicName)).toHaveText("Editar");
          await expect(editButton(page, world.clinicName)).toBeFocused();
          for (const name of [searchable, world.specialtyName]) {
            await expect(
              section(page).getByText(name, { exact: true }),
            ).toBeVisible();
          }
          await expect(
            section(page).getByText(NO_SCHEDULE, { exact: true }),
          ).toBeVisible();
          await expect(
            page.getByRole("alert").filter({ hasText: NO_SCHEDULE }),
          ).toHaveCount(0);
          if (viewport.key === "mov") {
            expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
          }

          await page.reload();
          await expect(editButton(page, world.clinicName)).toBeVisible();
          await expect(
            section(page).getByText(searchable, { exact: true }),
          ).toBeVisible();
          await expect(
            section(page).getByText(NO_SCHEDULE, { exact: true }),
          ).toBeVisible();
          expect(await storedSpecialtyIds(user.userId, world.clinicId)).toEqual(
            [searchableId, world.specialtyId].sort(),
          );
        });
      }
    }
  });
}

test("CA-55: con un horario sembrado en la sede el aviso no aparece", async ({
  page,
}) => {
  const world = await createProfileWorld("sched");
  const user = adminAsProfileUser(world);
  await addDoctorProfile(user.userId, world.clinicId, [world.specialtyId]);

  await loginAndOpenProfile(page, user, {
    kind: "organization",
    organizationId: world.organizationId,
  });
  await expect(
    section(page).getByText(NO_SCHEDULE, { exact: true }),
  ).toBeVisible();

  await seedFullDayAvailability(user.userId, world.clinicId);
  await page.reload();

  await expect(editButton(page, world.clinicName)).toBeVisible();
  await expect(
    section(page).getByText(NO_SCHEDULE, { exact: true }),
  ).toHaveCount(0);
});

test("CA-56: con la organización sin especialidades, «Crear» la crea, la elige y se guarda", async ({
  page,
}) => {
  const world = await createBareWorld("create");
  const user = bareOwner(world);
  await addDoctorProfile(user.userId, world.clinicId, []);
  const created = uniqueName("Pediatría");

  await loginAndOpenProfile(page, user, {
    kind: "organization",
    organizationId: world.organizationId,
  });
  await assignButton(page, world.clinicName).click();

  await expect(
    section(page).getByText(
      `${world.organizationName} todavía no tiene especialidades. Escribe la que atiendes y elige «Crear».`,
      { exact: true },
    ),
  ).toBeVisible();

  await searchField(page, world.clinicName).fill(created);
  await page
    .getByRole("button", { name: `Crear "${created}"`, exact: true })
    .click();
  await expect(removeChip(page, created)).toBeVisible();
  await expect(
    section(page).getByText("todavía no tiene especialidades", {
      exact: false,
    }),
  ).toHaveCount(0);

  await saveButton(page).click();
  await expect(toast(page, SAVED)).toBeVisible();
  await expect(section(page).getByText(created, { exact: true })).toBeVisible();

  const prisma = await getTestPrisma();
  const stored = await prisma.specialty.findFirst({
    where: { name: created },
  });
  expect(stored).not.toBeNull();
  expect(await storedSpecialtyIds(user.userId, world.clinicId)).toEqual([
    stored?.id,
  ]);
});

test("CA-57: el dueño sin membership no ve «Crear» y, sin especialidades, lee que las crea un administrador", async ({
  page,
}) => {
  const world = await createBareWorld("owner-nocreate");
  const user = bareOwner(world);
  await addDoctorProfile(user.userId, world.clinicId, []);
  await softDeleteOrganizationMembership(user.userId, world.organizationId);

  await loginAndOpenProfile(page, user);
  await assignButton(page, world.clinicName).click();

  await expect(
    section(page).getByText(
      `${world.organizationName} todavía no tiene especialidades. Las crea un administrador de la organización.`,
      { exact: true },
    ),
  ).toBeVisible();
  await searchField(page, world.clinicName).fill("Algo nuevo");
  await expect(page.getByRole("button", { name: /^Crear/ })).toHaveCount(0);
});

test("CA-57: el dueño sin membership no ve «Crear» con especialidades y puede elegir una y guardar", async ({
  page,
}) => {
  const world = await createProfileWorld("owner-nomember");
  const user = adminAsProfileUser(world);
  await addDoctorProfile(user.userId, world.clinicId, []);
  await softDeleteOrganizationMembership(user.userId, world.organizationId);

  await loginAndOpenProfile(page, user);
  await assignButton(page, world.clinicName).click();
  await expect(
    section(page).getByText("todavía no tiene especialidades", {
      exact: false,
    }),
  ).toHaveCount(0);

  await searchField(page, world.clinicName).fill("Inexistente");
  await expect(page.getByRole("button", { name: /^Crear/ })).toHaveCount(0);

  await searchField(page, world.clinicName).fill(world.specialtyName);
  await section(page)
    .getByRole("button", { name: world.specialtyName, exact: true })
    .click();
  await saveButton(page).click();

  await expect(toast(page, SAVED)).toBeVisible();
  expect(await storedSpecialtyIds(user.userId, world.clinicId)).toEqual([
    world.specialtyId,
  ]);
});

test("CA-58: «Cancelar» descarta lo editado sin enviar nada y devuelve el foco; abrir otra sede cierra la abierta", async ({
  page,
}) => {
  const world = await createProfileWorld("cancel");
  const user = await orgAdminOf(world, "cancel");
  const second = uniqueName("Sede-segunda");
  const secondClinicId = await createClinicResourceViaPrisma(
    world.admin,
    world.organizationId,
    { name: second },
  );
  const extra = uniqueName("Extra");
  await createSpecialty(world.admin, world.organizationId, extra);
  await addDoctorProfile(user.userId, world.clinicId, [world.specialtyId]);
  await addDoctorProfile(user.userId, secondClinicId, []);
  const calls = trackServerActions(page);

  await loginAndOpenProfile(page, user, {
    kind: "organization",
    organizationId: world.organizationId,
  });

  await editButton(page, world.clinicName).click();
  await removeChip(page, world.specialtyName).click();
  await searchField(page, world.clinicName).fill(extra);
  await section(page).getByRole("button", { name: extra, exact: true }).click();
  await cancelButton(page).click();

  await expect(editButton(page, world.clinicName)).toBeFocused();
  await expect(searchField(page, world.clinicName)).toHaveCount(0);
  await expect(
    section(page).getByText(world.specialtyName, { exact: true }),
  ).toBeVisible();
  await expect(section(page).getByText(extra, { exact: true })).toHaveCount(0);
  expect(calls).toHaveLength(0);
  expect(await storedSpecialtyIds(user.userId, world.clinicId)).toEqual([
    world.specialtyId,
  ]);

  await editButton(page, world.clinicName).click();
  await expect(searchField(page, world.clinicName)).toBeVisible();
  await assignButton(page, second).click();

  await expect(searchField(page, second)).toBeFocused();
  await expect(searchField(page, world.clinicName)).toHaveCount(0);
  await expect(editButton(page, world.clinicName)).toBeVisible();
  expect(calls).toHaveLength(0);
});

test("CA-59: quitar todos los chips y guardar deja la sede otra vez como fila", async ({
  page,
}) => {
  const world = await createProfileWorld("remove-all");
  const user = adminAsProfileUser(world);
  await addDoctorProfile(user.userId, world.clinicId, [world.specialtyId]);

  await loginAndOpenProfile(page, user);
  await editButton(page, world.clinicName).click();
  await removeChip(page, world.specialtyName).click();
  await saveButton(page).click();

  await expect(toast(page, SAVED)).toBeVisible();
  await expect(assignButton(page, world.clinicName)).toBeVisible();
  await expect(assignButton(page, world.clinicName)).toBeFocused();
  await expect(editButton(page, world.clinicName)).toHaveCount(0);
  await expect(
    section(page).getByText(`${world.organizationName} · Sin especialidades`, {
      exact: true,
    }),
  ).toBeVisible();
  expect(await storedSpecialtyIds(user.userId, world.clinicId)).toEqual([]);
});

test("CA-60: con tres sedes, el bloque va primero y las dos filas, bajo «Otras sedes donde atiendes»", async ({
  page,
}) => {
  const world = await createProfileWorld("three");
  const user = adminAsProfileUser(world);
  const rowA = uniqueName("Sede-fila-a");
  const rowB = uniqueName("Sede-fila-b");
  for (const name of [rowA, rowB]) {
    const rowClinicId = await createClinicResourceViaPrisma(
      world.admin,
      world.organizationId,
      { name },
    );
    await addDoctorProfile(user.userId, rowClinicId, []);
  }
  await addDoctorProfile(user.userId, world.clinicId, [world.specialtyId]);

  await loginAndOpenProfile(page, user);

  await expect(
    section(page).getByText(OTHER_CLINICS, { exact: true }),
  ).toBeVisible();
  const order = await section(page).evaluate((element) => {
    const text = element.textContent ?? "";
    return {
      buttons: Array.from(element.querySelectorAll("button")).map((button) =>
        button.getAttribute("aria-label"),
      ),
      headingAt: text.indexOf("Otras sedes donde atiendes"),
      blockAt: text.indexOf("Editar"),
    };
  });
  expect(order.buttons[0]).toBe(`Editar especialidades de ${world.clinicName}`);
  expect(order.buttons.slice(1).sort()).toEqual(
    [
      `Asignar especialidades en ${rowA}`,
      `Asignar especialidades en ${rowB}`,
    ].sort(),
  );
  expect(order.blockAt).toBeLessThan(order.headingAt);

  await assignButton(page, rowA).click();
  const placement = await section(page).evaluate((element) => {
    const text = element.textContent ?? "";
    return {
      heading: text.indexOf("Otras sedes donde atiendes"),
      editor: text.indexOf("Guardar especialidades"),
    };
  });
  expect(placement.editor).toBeGreaterThan(placement.heading);
  await cancelButton(page).click();
  await expect(assignButton(page, rowA)).toBeFocused();

  const availabilityLink = page.getByRole("link", {
    name: "Mi disponibilidad en esta sede →",
  });
  await editButton(page, world.clinicName).focus();
  await page.keyboard.press("Tab");
  await expect(availabilityLink.first()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: /^Asignar especialidades en / }).first(),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: /^Asignar especialidades en / }).last(),
  ).toBeFocused();
});

test("CA-61: si el api falla, el toast muestra su mensaje y el bloque sigue en edición con lo elegido", async ({
  page,
}) => {
  const world = await createProfileWorld("api-fail");
  const user = adminAsProfileUser(world);
  await addDoctorProfile(user.userId, world.clinicId, []);
  const doomed = uniqueName("Borrada");
  const doomedId = await createSpecialty(
    world.admin,
    world.organizationId,
    doomed,
  );

  await loginAndOpenProfile(page, user);
  await assignButton(page, world.clinicName).click();
  for (const name of [world.specialtyName, doomed]) {
    await searchField(page, world.clinicName).fill(name);
    await section(page).getByRole("button", { name, exact: true }).click();
  }
  const prisma = await getTestPrisma();
  await prisma.specialty.deleteMany({ where: { id: doomedId } });

  await saveButton(page).click();

  await expect(toast(page, "Especialidad no encontrada")).toBeVisible();
  await expect(searchField(page, world.clinicName)).toBeVisible();
  await expect(removeChip(page, world.specialtyName)).toBeVisible();
  await expect(saveButton(page)).toBeEnabled();
});

test("CA-61: con la sesión vencida avisa que expiró y lleva a /login", async ({
  page,
}) => {
  const world = await createProfileWorld("expired");
  const user = adminAsProfileUser(world);
  await addDoctorProfile(user.userId, world.clinicId, []);

  await loginAndOpenProfile(page, user);
  await assignButton(page, world.clinicName).click();
  await searchField(page, world.clinicName).fill(world.specialtyName);
  await section(page)
    .getByRole("button", { name: world.specialtyName, exact: true })
    .click();
  const prisma = await getTestPrisma();
  await prisma.session.deleteMany({ where: { userId: user.userId } });

  await saveButton(page).click();

  await expect(
    toast(page, "Tu sesión ha expirado. Vuelve a iniciar sesión."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("CA-62: si el ADMIN pierde el rol con la página abierta, guardar avisa y la edición se cierra", async ({
  page,
}) => {
  const world = await createProfileWorld("lost-role");
  const user = await orgAdminOf(world, "lost-role");
  await addDoctorProfile(user.userId, world.clinicId, []);

  await loginAndOpenProfile(page, user, {
    kind: "organization",
    organizationId: world.organizationId,
  });
  await assignButton(page, world.clinicName).click();
  await searchField(page, world.clinicName).fill(world.specialtyName);
  await section(page)
    .getByRole("button", { name: world.specialtyName, exact: true })
    .click();
  await softDeleteOrganizationMembership(user.userId, world.organizationId);

  await saveButton(page).click();

  await expect(toast(page, FORBIDDEN)).toBeVisible();
  await expect(searchField(page, world.clinicName)).toHaveCount(0);
  await expect(assignButton(page, world.clinicName)).toBeVisible();
  expect(await storedSpecialtyIds(user.userId, world.clinicId)).toEqual([]);
});

test("CA-63: el DOCTOR ve sus sedes en solo lectura con el enlace a su disponibilidad", async ({
  page,
}) => {
  const world = await createProfileWorld("doctor-ro");
  const doctor = await addDoctor(world, {
    label: "doctor-ro",
    specialtyIds: [world.specialtyId],
  });

  await loginAndOpenProfile(page, doctor, {
    kind: "clinic",
    clinicId: world.clinicId,
  });

  await expect(section(page)).toBeVisible();
  await expect(
    section(page).getByText(world.specialtyName, { exact: true }),
  ).toBeVisible();
  await expect(
    section(page).getByText("Te las asigna un administrador.", { exact: true }),
  ).toBeVisible();
  await expect(
    section(page).getByRole("link", {
      name: "Mi disponibilidad en esta sede →",
      exact: true,
    }),
  ).toBeVisible();
  await expect(section(page).getByRole("button")).toHaveCount(0);
});

test("CA-63: la recepción no ve «Dónde atiendes»", async ({ page }) => {
  const world = await createProfileWorld("reception");
  const receptionist = await addMember(world, "USER", { label: "reception" });

  await loginAndOpenProfile(page, receptionist, {
    kind: "clinic",
    clinicId: world.clinicId,
  });

  await expect(personal(page)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Dónde atiendes", exact: true }),
  ).toHaveCount(0);
  await expect(section(page)).toHaveCount(0);
});

test("CA-64: el ADMIN que atiende ve «Tratamiento», lo guarda y ve la vista previa; el enlace de disponibilidad sale una vez por cada sede donde atiende, también en las filas", async ({
  page,
}) => {
  const world = await createProfileWorld("treatment");
  const user = await orgAdminOf(world, "treatment");
  const withProfile = uniqueName("Sede-con-perfil");
  const otherClinicId = await createClinicResourceViaPrisma(
    world.admin,
    world.organizationId,
    { name: withProfile },
  );
  const prisma = await getTestPrisma();
  await prisma.userResourceMembership.create({
    data: {
      userId: user.userId,
      resourceId: world.clinicId,
      accountId: world.admin.accountId,
      role: "DOCTOR",
      createdBy: world.admin.userId,
    },
  });
  await addDoctorProfile(user.userId, world.clinicId, [world.specialtyId]);
  await addDoctorProfile(user.userId, otherClinicId, [world.specialtyId]);
  const doctorRowClinicId = await createClinicResourceViaPrisma(
    world.admin,
    world.organizationId,
    { name: uniqueName("Sede-fila-doctor") },
  );
  await prisma.userResourceMembership.create({
    data: {
      userId: user.userId,
      resourceId: doctorRowClinicId,
      accountId: world.admin.accountId,
      role: "DOCTOR",
      createdBy: world.admin.userId,
    },
  });
  await addDoctorProfile(user.userId, doctorRowClinicId, []);

  await loginAndOpenProfile(page, user, {
    kind: "organization",
    organizationId: world.organizationId,
  });

  const treatment = personal(page).getByLabel("Tratamiento", { exact: true });
  await expect(treatment).toBeVisible();
  await expect(treatment).toBeDisabled();
  await expect(
    section(page).getByRole("link", {
      name: "Mi disponibilidad en esta sede →",
    }),
  ).toHaveCount(3);
  await expect(
    section(page).getByText(world.clinicName, { exact: true }),
  ).toHaveCount(1);
  await expect(
    section(page).getByText(withProfile, { exact: true }),
  ).toHaveCount(1);

  await personal(page)
    .getByRole("button", { name: "Editar", exact: true })
    .click();
  await treatment.selectOption("DRA");
  await personal(page)
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();

  await expect(toast(page, "Guardamos tus datos.")).toBeVisible();
  expect((await readStoredUser(user.userId)).treatment).toBe("DRA");
  await expect(
    personal(page).getByText(`Dra. ${user.name} ${user.lastName}`, {
      exact: true,
    }),
  ).toBeVisible();
});

test("CA-64: el ADMIN que no atiende no ve «Tratamiento» y lee el aviso con «Ir a Sedes»", async ({
  page,
}) => {
  const world = await createProfileWorld("treatment-bare");
  const user = await orgAdminOf(world, "treatment-bare");

  await loginAndOpenProfile(page, user);

  await expect(
    personal(page).getByLabel("Tratamiento", { exact: true }),
  ).toHaveCount(0);
  await expect(
    section(page).getByText(
      "Todavía no atiendes en ninguna sede. Al crear una sede quedas como médico de ella; después eliges aquí tus especialidades.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    section(page).getByRole("link", { name: "Ir a Sedes", exact: true }),
  ).toHaveAttribute(
    "href",
    `/account/${user.accountId}/organization/${world.organizationId}/clinics`,
  );
});

test.describe("a 375 px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("CA-66: con seis chips en edición y tres sedes no hay desplazamiento horizontal y los botones ocupan todo el ancho", async ({
    page,
  }) => {
    const world = await createProfileWorld("mobile-six");
    const user = adminAsProfileUser(world);
    const ids = [world.specialtyId];
    for (let index = 0; index < 5; index += 1) {
      ids.push(
        await createSpecialty(
          world.admin,
          world.organizationId,
          uniqueName(`Especialidad-larga-${index}`),
        ),
      );
    }
    for (const name of [uniqueName("Sede-b"), uniqueName("Sede-c")]) {
      const extraClinicId = await createClinicResourceViaPrisma(
        world.admin,
        world.organizationId,
        { name },
      );
      await addDoctorProfile(user.userId, extraClinicId, []);
    }
    await addDoctorProfile(user.userId, world.clinicId, ids);

    await loginAndOpenProfile(page, user);
    await expect(editButton(page, world.clinicName)).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await editButton(page, world.clinicName).click();
    await expect(saveButton(page)).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    const form = (await section(page).locator("form").boundingBox()) ?? fail();
    const cancel = (await cancelButton(page).boundingBox()) ?? fail();
    const save = (await saveButton(page).boundingBox()) ?? fail();
    const slack = 20;
    expect(cancel.x).toBeLessThanOrEqual(form.x + slack);
    expect(save.x + save.width).toBeGreaterThanOrEqual(
      form.x + form.width - slack,
    );
  });
});

function fail(): never {
  throw new Error("El elemento no tiene caja visible");
}

test("Escape cierra la lista de sugerencias sin cancelar la edición", async ({
  page,
}) => {
  const world = await createProfileWorld("escape");
  const user = adminAsProfileUser(world);
  await addDoctorProfile(user.userId, world.clinicId, []);

  await loginAndOpenProfile(page, user);
  await assignButton(page, world.clinicName).click();
  await searchField(page, world.clinicName).fill(world.specialtyName);
  const option = section(page).getByRole("button", {
    name: world.specialtyName,
    exact: true,
  });
  await expect(option).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(option).toHaveCount(0);
  await expect(searchField(page, world.clinicName)).toBeVisible();
  await expect(saveButton(page)).toBeVisible();
});
