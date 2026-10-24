import type { Page } from "@playwright/test";
import {
  createClinicResource,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
} from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { seedPatient } from "../../support/doctor-treatment";
import { API_BASE_URL, PLATFORM_BASE_URL } from "../../support/env";
import { findDoctorProfileId } from "../../support/profile";
import { expect, test } from "../../support/test";
import { loginViaUi } from "../../support/ui";
import { uniqueName } from "../../support/users";

// docs/features/doctor-profile-membership/plan.md, iteración 2b: el aviso al bajar de Administrador a Usuario.

async function setup(label: string, withPendingAppointment: boolean) {
  const admin = await createOnboardedAdmin({ emailPrefix: `down-${label}` });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName(`ORG-${label}`),
  );
  const nameA = uniqueName("A-Sede");
  const clinicA = await createClinicResource(admin, organizationId, {
    name: nameA,
  });
  const nameB = uniqueName("B-Sede");
  const clinicB = await createClinicResourceViaPrisma(admin, organizationId, {
    name: nameB,
  });
  const person = await createMemberWithRole({
    accountId: admin.accountId,
    resourceId: organizationId,
    role: "USER",
    createdBy: admin.userId,
    emailPrefix: `down-person-${label}`,
  });
  const response = await admin.context.post(
    `${API_BASE_URL}/organization/${organizationId}/invitations`,
    {
      data: {
        email: person.email,
        name: person.name,
        lastName: person.lastName,
        phone: person.phone,
        role: "ADMIN",
      },
    },
  );
  expect(response.status()).toBe(200);

  if (withPendingAppointment) {
    const prisma = await getTestPrisma();
    await prisma.appointment.create({
      data: {
        doctorProfileId: (await findDoctorProfileId(
          person.userId,
          clinicB,
        )) as string,
        clinicId: clinicB,
        patientId: await seedPatient(admin.accountId),
        scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        durationMinutes: 30,
        specialty: "Medicina general",
      },
    });
  }
  return { admin, organizationId, nameA, nameB, person };
}

async function openForm(page: Page, world: Awaited<ReturnType<typeof setup>>) {
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
  await page.getByRole("button", { name: "Invitar usuario" }).click();
  await page.getByLabel("Correo electrónico").fill(world.person.email);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByLabel("Rol")).toBeVisible();
  await expect(page.getByLabel("Rol")).toHaveValue("ADMIN");
}

const list = (names: string[]) =>
  new Intl.ListFormat("es", { type: "conjunction" }).format(names);

test("sin citas pendientes: avisa que dejará de atender en todas sus sedes y que sus horarios se guardan", async ({
  page,
}) => {
  const world = await setup("sin-citas", false);
  await openForm(page, world);

  await page.getByLabel("Rol").selectOption("USER");

  const fullName = `${world.person.name} ${world.person.lastName}`;
  await expect(
    page.getByText(
      `${fullName} dejará de atender en ${list([world.nameA, world.nameB])}. Sus horarios se guardan por si vuelve a atender.`,
    ),
  ).toBeVisible();
  await expect(page.getByText(/citas? pendientes?:/)).toHaveCount(0);
});

test("con citas pendientes: avisa de la sede donde seguirá atendiendo", async ({
  page,
}) => {
  const world = await setup("con-citas", true);
  await openForm(page, world);

  await page.getByLabel("Rol").selectOption("USER");

  const fullName = `${world.person.name} ${world.person.lastName}`;
  await expect(
    page.getByText(
      `${fullName} dejará de atender en ${world.nameA}. Sus horarios se guardan por si vuelve a atender.`,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      `En ${world.nameB} tiene 1 cita pendiente: seguirá atendiendo ahí. Pásalo a Usuario en esa sede cuando ya no tenga citas.`,
    ),
  ).toBeVisible();

  await page.getByLabel("Rol").selectOption("ADMIN");
  await expect(page.getByText(/dejará de atender/)).toHaveCount(0);
});
