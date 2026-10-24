import type { Page } from "@playwright/test";
import {
  createClinicResource,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  inviteUserViaApi,
  type OnboardedAdmin,
} from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { readEmailsTo } from "../../support/email";
import { PLATFORM_BASE_URL } from "../../support/env";
import { softDeleteMembership } from "../../support/invitations";
import { addDoctorProfile, findDoctorProfileId } from "../../support/profile";
import { expect, test } from "../../support/test";
import { loginViaUi } from "../../support/ui";
import { uniqueEmail, uniqueName } from "../../support/users";

// docs/features/doctor-profile-membership/plan.md, iteración 2: asignar varias sedes a la vez desde el formulario único.

interface World {
  admin: OnboardedAdmin;
  organizationId: string;
  organizationName: string;
  clinics: { id: string; name: string }[];
  specialtyId: string;
  specialtyName: string;
}

async function createWorld(label: string): Promise<World> {
  const admin = await createOnboardedAdmin({
    emailPrefix: `admin-${label}`,
    name: "Alicia",
    lastName: uniqueName("Admin"),
  });
  const organizationName = uniqueName(`ORG-${label}`);
  const organizationId = await createOrganizationResource(
    admin,
    organizationName,
  );
  const nameA = uniqueName("A-Sede");
  const clinicA = await createClinicResource(admin, organizationId, {
    name: nameA,
  });
  const nameB = uniqueName("B-Sede");
  const clinicB = await createClinicResourceViaPrisma(admin, organizationId, {
    name: nameB,
  });
  const nameC = uniqueName("C-Sede");
  const clinicC = await createClinicResourceViaPrisma(admin, organizationId, {
    name: nameC,
  });
  const specialtyName = uniqueName(`Especialidad-${label}`);
  const specialtyId = await createSpecialty(
    admin,
    organizationId,
    specialtyName,
  );
  return {
    admin,
    organizationId,
    organizationName,
    clinics: [
      { id: clinicA, name: nameA },
      { id: clinicB, name: nameB },
      { id: clinicC, name: nameC },
    ],
    specialtyId,
    specialtyName,
  };
}

async function openOrganizationUsers(page: Page, world: World) {
  await loginViaUi(
    page,
    world.admin.email,
    new RegExp(`/account/${world.admin.accountId}/select$`),
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

async function startForm(page: Page, email: string) {
  await page.getByRole("button", { name: "Invitar usuario" }).click();
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByLabel("Rol")).toBeVisible();
}

const toast = (page: Page, text: string) =>
  page.getByText(text, { exact: true }).first();

const clinicBox = (page: Page, name: string) =>
  page.getByRole("checkbox", { name });

async function pickSpecialty(page: Page, name: string) {
  await page.getByLabel("Especialidades", { exact: true }).fill(name);
  await page.getByRole("button", { name, exact: true }).click();
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

const list = (names: string[]) =>
  new Intl.ListFormat("es", { type: "conjunction" }).format(names);

async function liveRole(userId: string, clinicId: string) {
  const prisma = await getTestPrisma();
  const membership = await prisma.userResourceMembership.findFirst({
    where: { userId, resourceId: clinicId, deletedAt: null },
  });
  return membership?.role ?? null;
}

const VIEWPORTS = [
  { key: "pc", label: "1280 px", size: { width: 1280, height: 800 } },
  { key: "mov", label: "375 px", size: { width: 375, height: 812 } },
];

for (const viewport of VIEWPORTS) {
  test.describe(`varias sedes (${viewport.label})`, () => {
    test.use({ viewport: viewport.size });

    test("«Sedes específicas» muestra una casilla por sede; sin marcar ninguna, error, sin petición y con el foco en la primera casilla", async ({
      page,
    }) => {
      const world = await createWorld(`many-validate-${viewport.key}`);
      await openOrganizationUsers(page, world);
      await startForm(page, uniqueEmail(`many-validate-${viewport.key}`));
      await page.getByLabel("Nombre").fill("Nora");
      await page.getByLabel("Apellido").fill("Nueva");
      await page.getByLabel("Teléfono").fill("+51900000021");
      const calls: string[] = [];
      page.on("request", (request) => {
        if (request.method() === "POST" && request.headers()["next-action"])
          calls.push(request.url());
      });

      await page.getByRole("radio", { name: "Sedes específicas" }).check();
      await expect(page.getByRole("checkbox")).toHaveCount(3);
      await page.getByLabel("Rol").selectOption("USER");
      await page.getByRole("button", { name: "Enviar invitación" }).click();

      await expect(page.getByRole("alert")).toHaveText(
        "Elige al menos una sede",
      );
      await expect(page.getByRole("checkbox").first()).toBeFocused();
      expect(calls).toHaveLength(0);
      if (viewport.key === "mov") {
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      }
    });

    test("it2-cl-4: tres sedes (USER viva, borrada, nueva) como Médico con una especialidad: aviso, toast compuesto, un solo correo y el mismo perfil de la borrada", async ({
      page,
    }) => {
      const world = await createWorld(`many-three-${viewport.key}`);
      const [first, second, third] = world.clinics;
      const email = uniqueEmail(`many-three-${viewport.key}`);
      const emailsBefore = readEmailsTo(email).length;
      await inviteUserViaApi(world.admin, {
        email,
        name: "Marta",
        lastName: "Tres",
        phone: "+51900000022",
        role: "USER",
        resourceId: second.id,
      });
      const prisma = await getTestPrisma();
      const user = await prisma.user.findUnique({ where: { email } });
      const userId = (user as { id: string }).id;
      const deleted = await prisma.userResourceMembership.create({
        data: {
          userId,
          resourceId: third.id,
          accountId: world.admin.accountId,
          role: "DOCTOR",
          createdBy: world.admin.userId,
        },
      });
      await addDoctorProfile(userId, third.id, [world.specialtyId]);
      const oldProfileId = await findDoctorProfileId(userId, third.id);
      await softDeleteMembership(deleted.id);
      await openOrganizationUsers(page, world);

      await startForm(page, email);
      await page.getByRole("radio", { name: "Sedes específicas" }).check();
      for (const clinic of world.clinics) {
        await clinicBox(page, clinic.name).check();
      }
      await expect(
        page.getByText(
          `Marta Tres ya tiene acceso a ${second.name}: ahí se reemplazan su rol y sus especialidades.`,
        ),
      ).toBeVisible();
      await pickSpecialty(page, world.specialtyName);
      if (viewport.key === "mov") {
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      }
      await page.getByRole("button", { name: "Asignar", exact: true }).click();

      await expect(
        toast(
          page,
          `Listo. Guardamos el acceso de Marta Tres a ${list(
            world.clinics.map((c) => c.name),
          )}.`,
        ),
      ).toBeVisible();
      for (const clinic of world.clinics) {
        expect(await liveRole(userId, clinic.id)).toBe("DOCTOR");
      }
      expect(await findDoctorProfileId(userId, third.id)).toBe(oldProfileId);
      expect(await findDoctorProfileId(userId, first.id)).not.toBeNull();
      expect(readEmailsTo(email).length - emailsBefore).toBeLessThanOrEqual(1);

      const row = page.getByRole("row", { name: /Marta Tres/ });
      await expect(row).toBeVisible();
      for (const clinic of world.clinics) {
        await expect(
          row.getByText(`${clinic.name} · Médico`, { exact: true }),
        ).toBeVisible();
      }
      if (viewport.key === "mov") {
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      }
    });
  });
}

test("it2-cl-6: un error a mitad guarda la primera, no toca la tercera, deja el modal abierto y reintentar tiene éxito", async ({
  page,
}) => {
  const world = await createWorld("many-partial");
  const [first, second, third] = world.clinics;
  const person = await createMemberWithRole({
    accountId: world.admin.accountId,
    resourceId: world.organizationId,
    role: "USER",
    createdBy: world.admin.userId,
    emailPrefix: "many-partial",
  });
  await openOrganizationUsers(page, world);
  await startForm(page, person.email);
  await page.getByRole("radio", { name: "Sedes específicas" }).check();
  for (const clinic of world.clinics) {
    await clinicBox(page, clinic.name).check();
  }
  await pickSpecialty(page, world.specialtyName);
  const prisma = await getTestPrisma();
  const seeded = await prisma.userResourceMembership.create({
    data: {
      userId: person.userId,
      resourceId: second.id,
      accountId: world.admin.accountId,
      role: "ADMIN",
      createdBy: world.admin.userId,
    },
  });

  await page.getByRole("button", { name: "Asignar", exact: true }).click();

  await expect(
    toast(
      page,
      `Guardamos ${first.name}. No se pudo en ${second.name} (El rol de un administrador de la sede no se puede cambiar). Vuelve a intentarlo: lo ya guardado no se duplica.`,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Invitar usuario" }),
  ).toBeVisible();
  expect(await liveRole(person.userId, first.id)).toBe("DOCTOR");
  expect(await liveRole(person.userId, third.id)).toBeNull();

  await prisma.userResourceMembership.update({
    where: { id: seeded.id },
    data: { role: "USER" },
  });
  await page.getByRole("button", { name: /Guardar cambios|Asignar/ }).click();

  await expect(
    toast(
      page,
      `Listo. Guardamos el acceso de ${person.name} ${person.lastName} a ${list(
        world.clinics.map((c) => c.name),
      )}.`,
    ),
  ).toBeVisible();
  for (const clinic of world.clinics) {
    expect(await liveRole(person.userId, clinic.id)).toBe("DOCTOR");
  }
});

test("desde Usuarios de la sede no hay radios: la sede queda fija", async ({
  page,
}) => {
  const world = await createWorld("many-fixed");
  await loginViaUi(
    page,
    world.admin.email,
    new RegExp(`/account/${world.admin.accountId}/select$`),
  );
  await page.context().addCookies([
    { name: "resource_id", value: world.clinics[0].id, url: PLATFORM_BASE_URL },
    { name: "resource_type", value: "CLINIC", url: PLATFORM_BASE_URL },
  ]);
  await page.goto(
    `/account/${world.admin.accountId}/clinic/${world.clinics[0].id}/users`,
  );
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();

  await startForm(page, uniqueEmail("many-fixed"));

  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  const field = page.getByLabel("Sede", { exact: true });
  await expect(field).toHaveValue(world.clinics[0].name);
  await expect(field).toHaveJSProperty("readOnly", true);
});
