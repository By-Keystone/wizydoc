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
import { PLATFORM_BASE_URL } from "../../support/env";
import { invitePendingUser } from "../../support/invitations";
import {
  addDoctor,
  addDoctorProfile,
  addMember,
  adminAsProfileUser,
  createProfileWorld,
  type ProfileUser,
  type ProfileWorld,
} from "../../support/profile";
import { expect, test } from "../../support/test";
import { clinicDashboardUrl, loginViaUi } from "../../support/ui";
import { uniqueName } from "../../support/users";

// docs/features/doctor-profile-specialties/plan.md, PR 6: CA-68 a CA-79.

const NO_SPECIALTIES = "Sin especialidades";

const fullName = (user: { name: string; lastName: string }) =>
  `${user.name} ${user.lastName}`;

const usersPath = (user: ProfileUser, world: ProfileWorld, clinicId?: string) =>
  `/account/${user.accountId}/organization/${world.organizationId}/clinic/${clinicId ?? world.clinicId}/users`;

async function signIn(page: Page, user: ProfileUser, resourceId: string) {
  await loginViaUi(page, user.email, clinicDashboardUrl(user.accountId));
  await page.context().addCookies([
    { name: "resource_id", value: resourceId, url: PLATFORM_BASE_URL },
    { name: "resource_type", value: "ORGANIZATION", url: PLATFORM_BASE_URL },
  ]);
}

async function openUsers(
  page: Page,
  user: ProfileUser,
  world: ProfileWorld,
  clinicId?: string,
) {
  await signIn(page, user, world.organizationId);
  await page.goto(usersPath(user, world, clinicId));
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
}

const rowOf = (page: Page, text: string) =>
  page.getByRole("row").filter({ hasText: text });

const editButton = (page: Page, user: { name: string; lastName: string }) =>
  page.getByRole("button", {
    name: `Editar especialidades de ${fullName(user)}`,
    exact: true,
  });

const dialogOf = (page: Page, user: { name: string; lastName: string }) =>
  page.getByRole("dialog", {
    name: `Especialidades de ${fullName(user)}`,
    exact: true,
  });

const searchIn = (page: Page) =>
  page.getByRole("dialog").getByLabel("Especialidades", { exact: true });

const saveButton = (page: Page) =>
  page.getByRole("button", { name: "Guardar especialidades", exact: true });

const toast = (page: Page, text: string) =>
  page.getByText(text, { exact: true }).first();

const horizontalOverflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

async function pickSpecialty(page: Page, name: string) {
  await searchIn(page).fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
}

async function storedSpecialtyNames(profileId: string) {
  const prisma = await getTestPrisma();
  const profile = await prisma.doctorProfile.findUniqueOrThrow({
    where: { id: profileId },
    select: { specialties: { select: { name: true } } },
  });
  const specialties = profile.specialties as unknown as { name: string }[];
  return specialties.map((s) => s.name).sort();
}

async function profileIdOf(userId: string, clinicId: string) {
  const prisma = await getTestPrisma();
  const profile = await prisma.doctorProfile.findFirstOrThrow({
    where: { membership: { userId, resourceId: clinicId } },
  });
  return profile.id;
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

const ACTORS: {
  key: string;
  label: string;
  of: (world: ProfileWorld, label: string) => Promise<ProfileUser>;
}[] = [
  {
    key: "adm",
    label: "ADMIN de la organización",
    of: (world, label) =>
      addMember(world, "ADMIN", {
        label,
        clinicId: world.organizationId,
        name: uniqueName("Adm"),
        lastName: "Seis",
      }),
  },
  {
    key: "own",
    label: "dueño",
    of: async (world) => adminAsProfileUser(world),
  },
];

const VIEWPORTS = [
  { key: "mov", label: "375 px", size: { width: 375, height: 812 } },
  { key: "pc", label: "1280 px", size: { width: 1280, height: 800 } },
];

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
  return {
    admin,
    organizationId,
    organizationName,
    clinicId,
    clinicName,
    specialtyId: "",
    specialtyName: "",
  } satisfies ProfileWorld;
}

for (const viewport of VIEWPORTS) {
  test.describe(`edición desde Usuarios de la sede (${viewport.label})`, () => {
    test.use({ viewport: viewport.size });
    const isMobile = viewport.key === "mov";

    for (const actor of ACTORS) {
      test(`CA-68 a CA-70 y CA-73: ${actor.label}: columna, botones, diálogo, elegir, crear y guardar`, async ({
        page,
      }) => {
        const label = `flow-${actor.key}-${viewport.key}`;
        const world = await createProfileWorld(label);
        const user = await actor.of(world, label);
        const extra = uniqueName("Extra");
        const extraId = await createSpecialty(
          world.admin,
          world.organizationId,
          extra,
        );
        const pending = await invitePendingUser(world.admin, {
          resourceId: world.clinicId,
          role: "DOCTOR",
          emailPrefix: `${label}-pend`,
          name: uniqueName("Pend"),
          lastName: "Tres",
          specialtyIds: [world.specialtyId],
        });
        const withSpecialty = await addDoctor(world, {
          label: `${label}-con`,
          name: uniqueName("Con"),
          lastName: "Uno",
          specialtyIds: [world.specialtyId],
        });
        const without = await addDoctor(world, {
          label: `${label}-sin`,
          name: uniqueName("Sin"),
          lastName: "Dos",
        });
        const pendingUser = {
          name: (await readName(pending.userId)).name,
          lastName: (await readName(pending.userId)).lastName,
        };
        const receptionist = await addMember(world, "USER", {
          label: `${label}-rec`,
          name: uniqueName("Rec"),
          lastName: "Cuatro",
        });
        const clinicAdmin = await addMember(world, "ADMIN", {
          label: `${label}-adm2`,
          name: uniqueName("Adm"),
          lastName: "Cinco",
        });

        await openUsers(page, user, world);

        await expect(
          page.getByText(`Personas con acceso a ${world.clinicName}.`, {
            exact: true,
          }),
        ).toBeVisible();
        const header = page.getByRole("columnheader", {
          name: "Especialidades",
          exact: true,
        });
        if (isMobile) {
          await expect(header).toBeHidden();
          await expect(
            page.getByRole("columnheader", { name: "Rol", exact: true }),
          ).toBeVisible();
          expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
        } else {
          await expect(header).toBeVisible();
        }

        const withRow = rowOf(page, fullName(withSpecialty));
        await expect(withRow.getByRole("listitem")).toHaveText([
          world.specialtyName,
        ]);
        await expect(
          rowOf(page, fullName(without))
            .getByText(NO_SPECIALTIES, { exact: true })
            .locator("visible=true"),
        ).toBeVisible();
        for (const person of [receptionist, clinicAdmin]) {
          await expect(
            rowOf(page, fullName(person))
              .getByRole("img", { name: "No aplica" })
              .or(rowOf(page, fullName(person)).getByText("—")),
          ).not.toHaveCount(0);
          await expect(
            rowOf(page, fullName(person)).getByRole("button", {
              name: /Editar especialidades/,
            }),
          ).toHaveCount(0);
        }
        await expect(editButton(page, withSpecialty)).toBeVisible();
        await expect(editButton(page, without)).toBeVisible();
        await expect(editButton(page, pendingUser)).toBeVisible();
        await expect(
          page.getByRole("button", { name: /^Editar especialidades de/ }),
        ).toHaveCount(4);
        void receptionist;

        await editButton(page, without).click();
        const dialog = dialogOf(page, without);
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByText(
            `En ${world.clinicName}. Son las que el paciente elige al reservar con este médico.`,
            { exact: true },
          ),
        ).toBeVisible();
        await expect(searchIn(page)).toBeFocused();
        await expect(
          dialog.getByRole("button", { name: /^Quitar/ }),
        ).toHaveCount(0);
        await expect(
          dialog.getByText(
            `Sin especialidades, ${without.name} deja de aparecer en el link de reserva de ${world.clinicName}. Sus citas ya reservadas no cambian.`,
            { exact: true },
          ),
        ).toBeVisible();
        if (isMobile) {
          const box = await dialog.boundingBox();
          expect(box?.x).toBeGreaterThanOrEqual(0);
          expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
          expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
        }

        await pickSpecialty(page, extra);
        const created = uniqueName("Creada");
        await searchIn(page).fill(created);
        await page
          .getByRole("dialog")
          .getByRole("button", { name: `Crear "${created}"`, exact: true })
          .click();
        await expect(
          dialog.getByRole("button", {
            name: `Quitar ${created}`,
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          dialog.getByRole("button", { name: `Quitar ${extra}`, exact: true }),
        ).toBeVisible();
        await expect(
          dialog.getByText("Sin especialidades,", { exact: false }),
        ).toHaveCount(0);

        await saveButton(page).click();
        await expect(
          toast(page, `Guardamos las especialidades de ${without.name}.`),
        ).toBeVisible();
        await expect(dialog).toBeHidden();
        const updatedRow = rowOf(page, fullName(without));
        await expect(updatedRow.getByRole("listitem")).toHaveText(
          [extra, created].sort(),
        );
        await expect(
          updatedRow.getByText(NO_SPECIALTIES, { exact: true }),
        ).toHaveCount(0);
        if (isMobile) {
          expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
        }

        const profileId = await profileIdOf(without.userId, world.clinicId);
        expect(await storedSpecialtyNames(profileId)).toEqual(
          [extra, created].sort(),
        );
        expect(extraId).toBeTruthy();
      });
    }
  });
}

async function readName(userId: string) {
  const prisma = await getTestPrisma();
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
  });
}

test("CA-71: Escape y «Cancelar» cierran el diálogo sin enviar nada y el foco vuelve al botón", async ({
  page,
}) => {
  const world = await createProfileWorld("close");
  const doctor = await addDoctor(world, {
    label: "close-doc",
    name: uniqueName("Cierra"),
    lastName: "Uno",
    specialtyIds: [world.specialtyId],
  });
  const extra = uniqueName("Extra");
  await createSpecialty(world.admin, world.organizationId, extra);
  const calls = trackServerActions(page);
  await openUsers(page, adminAsProfileUser(world), world);
  const baseline = calls.length;

  await editButton(page, doctor).click();
  await expect(searchIn(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialogOf(page, doctor)).toBeHidden();
  await expect(editButton(page, doctor)).toBeFocused();

  await editButton(page, doctor).click();
  await pickSpecialty(page, extra);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await expect(dialogOf(page, doctor)).toBeHidden();
  await expect(editButton(page, doctor)).toBeFocused();

  await editButton(page, doctor).click();
  await expect(
    page.getByRole("button", {
      name: `Quitar ${world.specialtyName}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Quitar ${extra}`, exact: true }),
  ).toHaveCount(0);

  expect(calls.length).toBe(baseline);
  const profileId = await profileIdOf(doctor.userId, world.clinicId);
  expect(await storedSpecialtyNames(profileId)).toEqual([world.specialtyName]);
});

test("CA-72: con la selección vacía avisa en una región aria-live y se puede guardar", async ({
  page,
}) => {
  const world = await createProfileWorld("empty");
  const doctor = await addDoctor(world, {
    label: "empty-doc",
    name: uniqueName("Vacía"),
    lastName: "Uno",
    specialtyIds: [world.specialtyId],
  });
  await openUsers(page, adminAsProfileUser(world), world);

  await editButton(page, doctor).click();
  const dialog = dialogOf(page, doctor);
  const warning = `Sin especialidades, ${doctor.name} deja de aparecer en el link de reserva de ${world.clinicName}. Sus citas ya reservadas no cambian.`;
  await expect(dialog.getByText(warning, { exact: true })).toHaveCount(0);

  await dialog
    .getByRole("button", { name: `Quitar ${world.specialtyName}`, exact: true })
    .click();
  await expect(dialog.getByText(warning, { exact: true })).toBeVisible();
  await expect(
    dialog.locator('[aria-live="polite"]').filter({ hasText: warning }),
  ).toHaveCount(1);

  await saveButton(page).click();
  await expect(
    toast(page, `Guardamos las especialidades de ${doctor.name}.`),
  ).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(
    rowOf(page, fullName(doctor))
      .getByText(NO_SPECIALTIES, { exact: true })
      .locator("visible=true"),
  ).toBeVisible();
  const profileId = await profileIdOf(doctor.userId, world.clinicId);
  expect(await storedSpecialtyNames(profileId)).toEqual([]);
});

for (const actor of ACTORS) {
  for (const viewport of VIEWPORTS) {
    test(`CA-75: ${actor.label}, ${viewport.label}: con la organización sin especialidades el diálogo lo dice y «Crear» funciona`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport.size);
      const world = await createBareWorld(`bare-${actor.key}-${viewport.key}`);
      const owner = {
        email: world.admin.email,
        userId: world.admin.userId,
        accountId: world.admin.accountId,
        name: world.admin.name,
        lastName: world.admin.lastName,
      };
      const user =
        actor.key === "own"
          ? owner
          : await addMember(world, "ADMIN", {
              label: `bare-${actor.key}-${viewport.key}`,
              clinicId: world.organizationId,
            });
      const doctor = await addDoctor(world, {
        label: `bare-doc-${actor.key}-${viewport.key}`,
        name: uniqueName("Bare"),
        lastName: "Uno",
      });
      await openUsers(page, user, world);

      await editButton(page, doctor).click();
      const dialog = dialogOf(page, doctor);
      await expect(
        dialog.getByText(
          `${world.organizationName} todavía no tiene especialidades. Escribe la que atiendes y elige «Crear».`,
          { exact: true },
        ),
      ).toBeVisible();

      const created = uniqueName("Pediatría");
      await searchIn(page).fill(created);
      await dialog
        .getByRole("button", { name: `Crear "${created}"`, exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: `Quitar ${created}`, exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByText("todavía no tiene especialidades", { exact: false }),
      ).toHaveCount(0);

      await saveButton(page).click();
      await expect(
        toast(page, `Guardamos las especialidades de ${doctor.name}.`),
      ).toBeVisible();
      await expect(
        rowOf(page, fullName(doctor)).getByRole("listitem"),
      ).toHaveText([created]);
      const profileId = await profileIdOf(doctor.userId, world.clinicId);
      expect(await storedSpecialtyNames(profileId)).toEqual([created]);
    });
  }
}

for (const actor of ACTORS) {
  for (const viewport of VIEWPORTS) {
    test(`CA-76: ${actor.label}, ${viewport.label}: la fila propia dice «Tú» y se edita como las demás`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport.size);
      const label = `self-${actor.key}-${viewport.key}`;
      const world = await createProfileWorld(label);
      const user = await actor.of(world, label);
      // Crea su membership DOCTOR si falta; el dueño ya la tiene por la sede.
      await addDoctorProfile(user.userId, world.clinicId, [world.specialtyId]);
      const other = await addDoctor(world, {
        label: `${label}-otro`,
        name: uniqueName("Otro"),
        lastName: "Uno",
      });
      const extra = uniqueName("Extra");
      await createSpecialty(world.admin, world.organizationId, extra);
      await openUsers(page, user, world);

      const ownRow = rowOf(page, "Tú");
      await expect(ownRow).toHaveCount(1);
      await expect(ownRow.getByText("Tú", { exact: true })).toBeVisible();
      await expect(ownRow.getByRole("listitem")).toHaveText([
        world.specialtyName,
      ]);
      await expect(
        ownRow.getByRole("link", { name: "Edítalas en Mi perfil" }),
      ).toHaveCount(0);
      await expect(editButton(page, user)).toBeVisible();
      await expect(editButton(page, other)).toBeVisible();
      // Más la fila del dueño, que atiende por defecto, cuando el actor es otro ADMIN.
      await expect(
        page.getByRole("button", { name: /^Editar especialidades de/ }),
      ).toHaveCount(actor.key === "own" ? 2 : 3);

      await editButton(page, user).click();
      await expect(dialogOf(page, user)).toBeVisible();
      await pickSpecialty(page, extra);
      await saveButton(page).click();
      await expect(
        toast(page, `Guardamos las especialidades de ${user.name}.`),
      ).toBeVisible();
      await expect(dialogOf(page, user)).toBeHidden();
      await expect(rowOf(page, "Tú").getByRole("listitem")).toHaveText(
        [world.specialtyName, extra].sort(),
      );
      const profileId = await profileIdOf(user.userId, world.clinicId);
      expect(await storedSpecialtyNames(profileId)).toEqual(
        [world.specialtyName, extra].sort(),
      );
    });
  }
}

test("CA-74: «Especialidad no encontrada»: toast con el mensaje del api y el diálogo sigue abierto con lo elegido", async ({
  page,
}) => {
  const world = await createProfileWorld("err-spec");
  const doctor = await addDoctor(world, {
    label: "err-spec-doc",
    name: uniqueName("ErrEsp"),
    lastName: "Uno",
  });
  const doomed = uniqueName("Borrada");
  await createSpecialty(world.admin, world.organizationId, doomed);
  await openUsers(page, adminAsProfileUser(world), world);

  await editButton(page, doctor).click();
  await pickSpecialty(page, doomed);
  const prisma = await getTestPrisma();
  await prisma.specialty.deleteMany({ where: { name: doomed } });
  await saveButton(page).click();

  await expect(toast(page, "Especialidad no encontrada")).toBeVisible();
  const dialog = dialogOf(page, doctor);
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: `Quitar ${doomed}`, exact: true }),
  ).toBeVisible();
  await expect(saveButton(page)).toBeEnabled();
});

test("CA-74: «Médico no encontrado» cuando le quitan la membership con el diálogo abierto", async ({
  page,
}) => {
  const world = await createProfileWorld("err-doc");
  const doctor = await addDoctor(world, {
    label: "err-doc-doc",
    name: uniqueName("ErrDoc"),
    lastName: "Uno",
  });
  await openUsers(page, adminAsProfileUser(world), world);

  await editButton(page, doctor).click();
  await pickSpecialty(page, world.specialtyName);
  const prisma = await getTestPrisma();
  await prisma.userResourceMembership.updateMany({
    where: { userId: doctor.userId, resourceId: world.clinicId },
    data: { deletedAt: new Date() },
  });
  await saveButton(page).click();

  await expect(toast(page, "Médico no encontrado")).toBeVisible();
  await expect(dialogOf(page, doctor)).toBeVisible();
  await expect(rowOf(page, fullName(doctor))).toHaveCount(0);
});

test("CA-74: el ADMIN pierde su rol con el diálogo abierto: toast de permiso y el diálogo sigue abierto", async ({
  page,
}) => {
  const world = await createProfileWorld("err-forbidden");
  const admin = await addMember(world, "ADMIN", {
    label: "err-forbidden",
    clinicId: world.organizationId,
  });
  const doctor = await addDoctor(world, {
    label: "err-forbidden-doc",
    name: uniqueName("ErrPerm"),
    lastName: "Uno",
  });
  await openUsers(page, admin, world);

  await editButton(page, doctor).click();
  await pickSpecialty(page, world.specialtyName);
  const prisma = await getTestPrisma();
  await prisma.userResourceMembership.updateMany({
    where: { userId: admin.userId },
    data: { deletedAt: new Date() },
  });
  await saveButton(page).click();

  await expect(
    toast(page, "Solo un administrador puede cambiar especialidades."),
  ).toBeVisible();
  await expect(dialogOf(page, doctor)).toBeVisible();
  const profileId = await profileIdOf(doctor.userId, world.clinicId);
  expect(await storedSpecialtyNames(profileId)).toEqual([]);
});

test("el booking refleja el cambio: el médico con horarios aparece con la especialidad nueva y deja de aparecer sin especialidades", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const world = await createProfileWorld("booking");
  const doctor = await addDoctor(world, {
    label: "booking-doc",
    name: uniqueName("Reserva"),
    lastName: "Uno",
    specialtyIds: [world.specialtyId],
  });
  await seedFullDayAvailability(doctor.userId, world.clinicId);
  const fresh = uniqueName("Nueva");
  await createSpecialty(world.admin, world.organizationId, fresh);
  const bookingUrl = `/clinic/${world.clinicId}/create-appointment`;
  const specialtyOption = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const specialtyShown = (name: string) =>
    page.getByText(name, { exact: true });

  await page.goto(bookingUrl);
  await expect(
    page.getByRole("heading", { name: "Elige fecha y horario" }),
  ).toBeVisible();
  await expect(specialtyShown(world.specialtyName)).toBeVisible();
  await expect(specialtyShown(fresh)).toHaveCount(0);

  await openUsers(page, adminAsProfileUser(world), world);
  await editButton(page, doctor).click();
  await pickSpecialty(page, fresh);
  await saveButton(page).click();
  await expect(
    toast(page, `Guardamos las especialidades de ${doctor.name}.`),
  ).toBeVisible();

  await page.goto(bookingUrl);
  await expect(
    page.getByRole("heading", { name: "¿Qué especialidad necesitas?" }),
  ).toBeVisible();
  await expect(specialtyOption(fresh)).toBeVisible();
  await expect(specialtyOption(world.specialtyName)).toBeVisible();

  await page.goto(usersPath(adminAsProfileUser(world), world));
  await editButton(page, doctor).click();
  for (const name of [fresh, world.specialtyName]) {
    await dialogOf(page, doctor)
      .getByRole("button", { name: `Quitar ${name}`, exact: true })
      .click();
  }
  await saveButton(page).click();
  await expect(
    toast(page, `Guardamos las especialidades de ${doctor.name}.`),
  ).toBeVisible();

  await page.goto(bookingUrl);
  await expect(
    page.getByText(
      "Esta sede todavía no tiene médicos disponibles para reservar citas.",
    ),
  ).toBeVisible();
  await expect(specialtyShown(world.specialtyName)).toHaveCount(0);
  await expect(specialtyShown(fresh)).toHaveCount(0);
});

test("CA-78: un DOCTOR y un USER que abren la URL ven el estado de error, sin tabla ni botones", async ({
  page,
}) => {
  const world = await createProfileWorld("forbidden-roles");
  for (const role of ["DOCTOR", "USER"] as const) {
    const member =
      role === "DOCTOR"
        ? await addDoctor(world, { label: "fr-doc" })
        : await addMember(world, "USER", { label: "fr-user" });
    await openUsersExpectingError(page, member, world);
  }
});

async function openUsersExpectingError(
  page: Page,
  user: ProfileUser,
  world: ProfileWorld,
) {
  await page.context().clearCookies();
  await signIn(page, user, world.clinicId);
  await page.goto(usersPath(user, world));
  await expect(
    page.getByText("Algo salió mal", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Editar especialidades|Invitar usuario/ }),
  ).toHaveCount(0);
}

test("CA-79: la tabla de Usuarios de la organización no tiene columna «Especialidades» y la sede vacía sigue diciendo que no tiene usuarios", async ({
  page,
}) => {
  const world = await createProfileWorld("org-table");
  const user = adminAsProfileUser(world);
  await addDoctor(world, {
    label: "org-table-doc",
    name: uniqueName("OrgDoc"),
    lastName: "Uno",
    specialtyIds: [world.specialtyId],
  });
  await addMember(world, "ADMIN", {
    label: "org-table-adm",
    clinicId: world.organizationId,
  });
  await signIn(page, user, world.organizationId);

  await page.goto(
    `/account/${user.accountId}/organization/${world.organizationId}/users`,
  );
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Especialidades" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Editar especialidades/ }),
  ).toHaveCount(0);

  const emptyClinic = await createClinicResourceViaPrisma(
    world.admin,
    world.organizationId,
    { name: uniqueName("Sede-vacía") },
  );
  await page.goto(usersPath(user, world, emptyClinic));
  await expect(
    page.getByText("Esta sede aún no tiene usuarios.", { exact: true }),
  ).toBeVisible();
});

test("CA-77: a 375 px un correo largo no esconde «Rol» ni desplaza la página", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const world = await createProfileWorld("long-email");
  const doctor = await addDoctor(world, {
    label: "long-email-doc",
    name: uniqueName("Largo"),
    lastName: "Uno",
    specialtyIds: [world.specialtyId],
  });
  const prisma = await getTestPrisma();
  const longEmail = `${"a".repeat(70)}.${Date.now()}@${"b".repeat(40)}.example.com`;
  await prisma.user.update({
    where: { id: doctor.userId },
    data: { email: longEmail },
  });
  await openUsers(page, adminAsProfileUser(world), world);

  const row = rowOf(page, fullName(doctor));
  await expect(row.getByText("Médico", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Rol", exact: true }),
  ).toBeVisible();
  await expect(editButton(page, doctor)).toBeVisible();
  const box = await row.getByText("Médico", { exact: true }).boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
