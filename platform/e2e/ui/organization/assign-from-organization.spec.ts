import type { Page } from "@playwright/test";
import {
  createClinicResource,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  type OnboardedAdmin,
} from "../../support/accounts";
import {
  addPortalDoctor,
  type PortalDoctor,
} from "../../support/appointment-portal";
import { seedFullDayAvailability } from "../../support/availability";
import { getTestPrisma } from "../../support/db";
import { readUserEmail } from "../../support/doctor-treatment";
import { API_BASE_URL, PLATFORM_BASE_URL } from "../../support/env";
import { expect, test } from "../../support/test";
import { loginViaUi } from "../../support/ui";
import { uniqueEmail, uniqueName } from "../../support/users";

// docs/features/doctor-profile-membership/plan.md: formulario único de asignar, desde Usuarios de la organización.

interface World {
  admin: OnboardedAdmin;
  adminFullName: string;
  organizationId: string;
  organizationName: string;
  clinicId: string;
  clinicName: string;
  specialtyId: string;
  specialtyName: string;
  doctor: PortalDoctor;
  doctorFullName: string;
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
  const clinicName = uniqueName(`Sede-${label}`);
  const clinicId = await createClinicResource(admin, organizationId, {
    name: clinicName,
  });
  const specialtyName = uniqueName(`Especialidad-${label}`);
  const specialtyId = await createSpecialty(
    admin,
    organizationId,
    specialtyName,
  );
  const doctor = await addPortalDoctor({
    label,
    clinicId,
    admin,
    specialtyId,
    name: "Dario",
    lastName: uniqueName("Medico"),
  });

  return {
    admin,
    adminFullName: `${admin.name} ${admin.lastName}`,
    organizationId,
    organizationName,
    clinicId,
    clinicName,
    specialtyId,
    specialtyName,
    doctor,
    doctorFullName: `${doctor.name} ${doctor.lastName}`,
  };
}

async function setSpace(
  page: Page,
  type: "ORGANIZATION" | "CLINIC",
  resourceId: string,
) {
  await page.context().addCookies([
    { name: "resource_id", value: resourceId, url: PLATFORM_BASE_URL },
    { name: "resource_type", value: type, url: PLATFORM_BASE_URL },
  ]);
}

async function openOrganizationUsers(
  page: Page,
  world: World,
  email: string = world.admin.email,
) {
  await loginViaUi(
    page,
    email,
    new RegExp(`/account/${world.admin.accountId}/select$`),
  );
  await setSpace(page, "ORGANIZATION", world.organizationId);
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

async function pickSpecialty(page: Page, name: string) {
  await page.getByLabel("Especialidades").fill(name);
  await page.getByRole("button", { name, exact: true }).click();
}

const toast = (page: Page, text: string) =>
  page.getByText(text, { exact: true }).first();

async function membershipRole(email: string, resourceId: string) {
  const prisma = await getTestPrisma();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  const membership = await prisma.userResourceMembership.findFirst({
    where: { userId: user.id, resourceId },
  });
  return membership?.role ?? null;
}

async function openDoctorStep(page: Page, world: World) {
  await page.goto(`/clinic/${world.clinicId}/create-appointment`);
  await page
    .getByRole("button", { name: world.specialtyName, exact: true })
    .click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
}

test("el selector de sede ofrece «Todas las sedes» y cada sede, y los roles cambian según el alcance", async ({
  page,
}) => {
  const world = await createWorld("assign-org-select");
  const secondName = uniqueName("Sede B");
  await createClinicResourceViaPrisma(world.admin, world.organizationId, {
    name: secondName,
  });
  const recepcion = await createMemberWithRole({
    accountId: world.admin.accountId,
    resourceId: world.organizationId,
    role: "USER",
    createdBy: world.admin.userId,
    emailPrefix: "assign-org-select-user",
  });
  await openOrganizationUsers(page, world);

  await startForm(page, recepcion.email);

  const clinicSelect = page.getByLabel("Sede");
  const roleSelect = page.getByLabel("Rol");
  await expect(clinicSelect.locator("option")).toHaveCount(3);
  const [all, ...clinicOptions] = await clinicSelect
    .locator("option")
    .allTextContents();
  expect(all).toBe(`Todas las sedes de ${world.organizationName}`);
  expect([...clinicOptions].sort()).toEqual(
    [world.clinicName, secondName].sort(),
  );
  await expect(clinicSelect).toHaveValue("all");
  await expect(roleSelect.locator("option")).toHaveText([
    "Usuario",
    "Administrador",
  ]);
  await expect(page.getByLabel("Especialidades")).toHaveCount(0);

  await clinicSelect.selectOption({ label: secondName });
  await expect(roleSelect.locator("option")).toHaveText(["Médico", "Usuario"]);
  await roleSelect.selectOption("DOCTOR");
  await expect(page.getByLabel("Especialidades")).toBeVisible();
  await clinicSelect.selectOption("all");
  await expect(roleSelect).toHaveValue("USER");
  await expect(page.getByLabel("Especialidades")).toHaveCount(0);
});

test("asignar a «Todas las sedes» como Administrador y a una sola sede como Médico muestra el mensaje del api", async ({
  page,
}) => {
  const world = await createWorld("assign-org-scopes");
  await createClinicResourceViaPrisma(world.admin, world.organizationId);
  await openOrganizationUsers(page, world);
  const allClinics = uniqueEmail("assign-org-all");
  const oneClinic = uniqueEmail("assign-org-one");

  await startForm(page, allClinics);
  await page.getByLabel("Nombre").fill("Elena");
  await page.getByLabel("Apellido").fill("Todas");
  await page.getByLabel("Teléfono").fill("+51900000011");
  await page.getByLabel("Rol").selectOption("ADMIN");
  await page.getByRole("button", { name: "Enviar invitación" }).click();
  await expect(toast(page, "Invitación enviada.")).toBeVisible();

  await startForm(page, oneClinic);
  await page.getByLabel("Nombre").fill("Olga");
  await page.getByLabel("Apellido").fill("Sede");
  await page.getByLabel("Teléfono").fill("+51900000012");
  await page.getByLabel("Sede").selectOption({ label: world.clinicName });
  await page.getByLabel("Rol").selectOption("DOCTOR");
  await pickSpecialty(page, world.specialtyName);
  await page.getByRole("button", { name: "Enviar invitación" }).click();
  await expect(
    toast(
      page,
      `Invitación enviada. Olga Sede aparece en los usuarios de ${world.clinicName}.`,
    ),
  ).toBeVisible();

  expect(await membershipRole(allClinics, world.organizationId)).toBe("ADMIN");
  expect(await membershipRole(allClinics, world.clinicId)).toBeNull();
  expect(await membershipRole(oneClinic, world.clinicId)).toBe("DOCTOR");
  expect(await membershipRole(oneClinic, world.organizationId)).toBeNull();
});

test("el ADMIN se asigna como Médico: ve «Configuración» en esa sede y aparece en el booking cuando tiene horarios", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const world = await createWorld("assign-org-self");
  await openOrganizationUsers(page, world);

  await setSpace(page, "CLINIC", world.clinicId);
  await page.goto(
    `/account/${world.admin.accountId}/clinic/${world.clinicId}/dashboard`,
  );
  await expect(
    page.getByRole("link", { name: "Pacientes", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Configuración", exact: true }),
  ).toHaveCount(0);

  await setSpace(page, "ORGANIZATION", world.organizationId);
  await page.goto(
    `/account/${world.admin.accountId}/organization/${world.organizationId}/users`,
  );
  await startForm(page, world.admin.email);
  await expect(page.getByLabel("Sede")).toHaveValue(world.clinicId);
  await expect(page.getByLabel("Rol")).toHaveValue("DOCTOR");
  await expect(
    page.getByText(
      `Te asignas como médico de ${world.clinicName}. Sigues siendo administrador; configura tus horarios para aparecer en el link de reserva.`,
    ),
  ).toBeVisible();
  await pickSpecialty(page, world.specialtyName);
  await page.getByRole("button", { name: "Asignar", exact: true }).click();

  await expect(
    toast(
      page,
      `Listo. Ya atiendes en ${world.clinicName}. Configura tus horarios para aparecer en el link de reserva.`,
    ),
  ).toBeVisible();
  expect(await membershipRole(world.admin.email, world.clinicId)).toBe(
    "DOCTOR",
  );

  await setSpace(page, "CLINIC", world.clinicId);
  await page.goto(
    `/account/${world.admin.accountId}/clinic/${world.clinicId}/dashboard`,
  );
  await expect(
    page.getByRole("link", { name: "Configuración", exact: true }).first(),
  ).toBeVisible();

  await seedFullDayAvailability(world.admin.userId, world.clinicId);
  await openDoctorStep(page, world);
  await expect(
    page.getByRole("button", { name: world.adminFullName, exact: true }),
  ).toBeVisible();
});

test("modo edición: precarga el rol y las especialidades y «Guardar cambios» deja el mismo perfil", async ({
  page,
}) => {
  const world = await createWorld("assign-org-edit");
  const doctorEmail = await readUserEmail(world.doctor.userId);
  await openOrganizationUsers(page, world);

  await startForm(page, doctorEmail);

  await expect(page.getByLabel("Sede")).toHaveValue(world.clinicId);
  await expect(page.getByLabel("Rol")).toHaveValue("DOCTOR");
  await expect(
    page.getByRole("button", { name: `Quitar ${world.specialtyName}` }),
  ).toBeVisible();
  await expect(
    page.getByText(
      `${world.doctorFullName} ya atiende en ${world.clinicName}. Puedes cambiar sus especialidades.`,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Guardar cambios" }).click();

  await expect(
    toast(page, `Guardamos los cambios de ${world.doctorFullName}.`),
  ).toBeVisible();
  const prisma = await getTestPrisma();
  expect(
    await prisma.doctorProfile.count({
      where: { id: world.doctor.doctorProfileId },
    }),
  ).toBe(1);
});

test("pasar a un Médico a Usuario avisa antes de guardar y lo saca del booking", async ({
  page,
}) => {
  const world = await createWorld("assign-org-demote");
  const doctorEmail = await readUserEmail(world.doctor.userId);
  await openOrganizationUsers(page, world);
  await startForm(page, doctorEmail);

  await page.getByLabel("Rol").selectOption("USER");

  await expect(
    page.getByText(
      `${world.doctorFullName} dejará de atender en ${world.clinicName} y saldrá del link de reserva. Sus citas ya reservadas no cambian.`,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    toast(page, `Guardamos los cambios de ${world.doctorFullName}.`),
  ).toBeVisible();
  expect(await membershipRole(doctorEmail, world.clinicId)).toBe("USER");

  const listed = await page.request.get(
    `${API_BASE_URL}/clinic/${world.clinicId}/doctors`,
  );
  expect(
    ((await listed.json()) as { doctorProfileId: string }[]).map(
      (doctor) => doctor.doctorProfileId,
    ),
  ).not.toContain(world.doctor.doctorProfileId);
});

test("el ADMIN no puede cambiar su propio rol ni el del dueño en «Todas las sedes»: aviso ámbar y botón deshabilitado", async ({
  page,
}) => {
  const world = await createWorld("assign-org-blocked");
  const otherAdmin = await createMemberWithRole({
    accountId: world.admin.accountId,
    resourceId: world.organizationId,
    role: "ADMIN",
    createdBy: world.admin.userId,
    emailPrefix: "assign-org-blocked-admin",
  });
  await openOrganizationUsers(page, world, otherAdmin.email);

  await startForm(page, otherAdmin.email);
  await page.getByLabel("Sede").selectOption("all");
  await expect(page.getByLabel("Rol")).toHaveValue("ADMIN");
  await page.getByLabel("Rol").selectOption("USER");
  await expect(
    page.getByText("No puedes cambiar tu propio rol.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Guardar cambios" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Cambiar" }).click();
  await page.getByLabel("Correo electrónico").fill(world.admin.email);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Sede").selectOption("all");
  await page.getByLabel("Rol").selectOption("USER");
  await expect(
    page.getByText("El rol del dueño de la cuenta no se puede cambiar.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Guardar cambios" }),
  ).toBeDisabled();
});
