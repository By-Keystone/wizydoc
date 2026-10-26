import type { Page } from "@playwright/test";
import {
  createApiContext,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
} from "../../support/accounts";
import { bookingHeader, bookFromDateStep } from "../../support/booking-ui";
import { getTestPrisma } from "../../support/db";
import { PLATFORM_BASE_URL } from "../../support/env";
import {
  addListedDoctor,
  buildLinkCase,
  CORAL,
  copyLinkButton,
  createLegacyOwnerClinic,
  firstSteps,
  LINK_DOWN_TITLE,
  LINK_READY_TEXT,
  linkNotice,
  openClinicDashboard,
  stepLink,
  stepNamed,
  viewAsPatientLink,
  WHITE,
} from "../../support/first-use";
import { expect, test } from "../../support/test";
import {
  fillOnboardingForm,
  loginViaUi,
  ONBOARDING_SPECIALTY,
} from "../../support/ui";
import { createConfirmedUser, uniqueName } from "../../support/users";

// docs/features/primer-uso/plan.md CA-30 a CA-35 y CA-37.

const BOOKING_PATH = (clinicId: string) =>
  `/clinic/${clinicId}/create-appointment`;

async function addMember(
  world: { accountId: string; ownerId: string; clinicId: string },
  role: "DOCTOR" | "USER",
  emailPrefix: string,
) {
  const member = await createMemberWithRole({
    accountId: world.accountId,
    resourceId: world.clinicId,
    role,
    createdBy: world.ownerId,
    emailPrefix,
  });
  if (role === "DOCTOR") {
    const prisma = await getTestPrisma();
    await prisma.doctorProfile.create({
      data: { membershipId: member.membershipId },
    });
  }
  return member;
}

async function expectLinkRow(page: Page, label: string) {
  await expect(page.getByText(LINK_READY_TEXT), label).toBeVisible();
  await expect(copyLinkButton(page), label).toHaveCSS(
    "background-color",
    CORAL,
  );
  await expect(viewAsPatientLink(page), label).toHaveCSS(
    "background-color",
    WHITE,
  );
  await expect(linkNotice(page), label).toHaveCount(0);
}

async function expectNoLinkAnywhere(page: Page, label: string) {
  await expect(copyLinkButton(page), label).toHaveCount(0);
  await expect(viewAsPatientLink(page), label).toHaveCount(0);
  await expect(page.getByText(LINK_READY_TEXT), label).toHaveCount(0);
}

test("CA-30: sin médicos en el link, nadie ve «Copiar link de reservas» ni «Ver como paciente»", async ({
  page,
}) => {
  const legacy = await createLegacyOwnerClinic({ emailPrefix: "link-ca30" });
  const world = {
    accountId: legacy.owner.accountId,
    ownerId: legacy.owner.userId,
    clinicId: legacy.clinicId,
  };
  const doctor = await addMember(world, "DOCTOR", "link-ca30-medico");
  const user = await addMember(world, "USER", "link-ca30-usuario");
  const nonAttendingAdmin = await buildLinkCase("notice-only");

  const actors = [
    { label: "ADMIN que atiende", email: legacy.owner.email, ...world },
    { label: "DOCTOR sin horario", email: doctor.email, ...world },
    { label: "USER", email: user.email, ...world },
    { label: "ADMIN que no atiende", ...nonAttendingAdmin },
  ];
  for (const actor of actors) {
    await page.context().clearCookies();
    await openClinicDashboard(page, actor);
    await expectNoLinkAnywhere(page, actor.label);
  }
});

test("CA-31: quien no atiende ve el aviso «El link de reservas todavía no funciona»; el ADMIN además el enlace a Usuarios y el USER no", async ({
  page,
}) => {
  const owner = await createOnboardedAdmin({ emailPrefix: "link-ca31" });
  const organizationId = await createOrganizationResource(owner);
  const clinicName = uniqueName("Sede CA-31");
  const clinicId = await createClinicResourceViaPrisma(owner, organizationId, {
    name: clinicName,
  });
  const user = await createMemberWithRole({
    accountId: owner.accountId,
    resourceId: clinicId,
    role: "USER",
    createdBy: owner.userId,
    emailPrefix: "link-ca31-usuario",
  });
  const assignLink = (target: Page) =>
    target.getByRole("link", {
      name: "Asignar médicos en Usuarios",
      exact: true,
    });

  await openClinicDashboard(page, {
    email: owner.email,
    accountId: owner.accountId,
    clinicId,
  });
  const notice = linkNotice(page);
  await expect(notice).toBeVisible();
  await expect(
    notice.getByRole("heading", { level: 2, name: LINK_DOWN_TITLE }),
  ).toBeVisible();
  await expect(notice).toContainText(
    `Funciona cuando un médico de ${clinicName} tenga especialidad y horario.`,
  );
  await expect(assignLink(page)).toHaveAttribute(
    "href",
    `/account/${owner.accountId}/clinic/${clinicId}/users`,
  );
  await assignLink(page).click();
  await expect(page).toHaveURL(
    `/account/${owner.accountId}/clinic/${clinicId}/users`,
  );
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();

  await page.context().clearCookies();
  await openClinicDashboard(page, {
    email: user.email,
    accountId: owner.accountId,
    clinicId,
  });
  await expect(linkNotice(page)).toContainText(LINK_DOWN_TITLE);
  await expect(assignLink(page)).toHaveCount(0);
});

test("CA-32: con al menos un médico en el link, todos los roles de la sede ven la fila con «Copiar link de reservas» en coral y «Ver como paciente» en outline", async ({
  page,
}) => {
  const legacy = await createLegacyOwnerClinic({ emailPrefix: "link-ca32" });
  const { owner, organizationId, clinicId } = legacy;
  const { doctor: listedDoctor } = await addListedDoctor(
    owner,
    organizationId,
    clinicId,
  );
  const world = {
    accountId: owner.accountId,
    ownerId: owner.userId,
    clinicId,
  };
  const unlistedDoctor = await addMember(world, "DOCTOR", "link-ca32-medico");
  const user = await addMember(world, "USER", "link-ca32-usuario");
  const prisma = await getTestPrisma();
  const listedDoctorUser = await prisma.user.findUniqueOrThrow({
    where: { id: listedDoctor.userId },
  });
  const listedOwner = await buildLinkCase("link-only-listed");
  const outsideAdmin = await createOnboardedAdmin({
    emailPrefix: "link-ca32-sin-atender",
  });
  const outsideOrganizationId = await createOrganizationResource(outsideAdmin);
  const outsideClinicId = await createClinicResourceViaPrisma(
    outsideAdmin,
    outsideOrganizationId,
  );
  await addListedDoctor(outsideAdmin, outsideOrganizationId, outsideClinicId);

  const actors = [
    { label: "ADMIN que atiende", email: owner.email },
    { label: "DOCTOR sin aparecer", email: unlistedDoctor.email },
    { label: "DOCTOR que aparece", email: listedDoctorUser.email },
    { label: "USER", email: user.email },
  ];
  for (const actor of actors) {
    await page.context().clearCookies();
    await openClinicDashboard(page, {
      email: actor.email,
      accountId: owner.accountId,
      clinicId,
    });
    await expectLinkRow(page, actor.label);
  }

  await page.context().clearCookies();
  await openClinicDashboard(page, {
    email: outsideAdmin.email,
    accountId: outsideAdmin.accountId,
    clinicId: outsideClinicId,
  });
  await expectLinkRow(page, "ADMIN que no atiende");

  await page.context().clearCookies();
  await openClinicDashboard(page, listedOwner);
  await expectLinkRow(page, "dueño que aparece");
  await expect(firstSteps(page)).toHaveCount(0);
});

test("CA-33: «Copiar link de reservas» copia el link de la sede y «Ver como paciente» lo abre en una pestaña nueva", async ({
  page,
}) => {
  const listed = await buildLinkCase("link-only-listed");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: PLATFORM_BASE_URL,
  });
  await openClinicDashboard(page, listed);

  await copyLinkButton(page).click();
  await expect(page.getByText("¡Link copiado!")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${PLATFORM_BASE_URL}${BOOKING_PATH(listed.clinicId)}`,
  );

  const viewAsPatient = viewAsPatientLink(page);
  await expect(viewAsPatient).toHaveAccessibleName(
    "Ver como paciente (se abre en una pestaña nueva)",
  );
  await expect(viewAsPatient).toHaveAttribute("target", "_blank");
  await expect(viewAsPatient).toHaveAttribute("rel", /noopener/);
  const [popup] = await Promise.all([
    page.context().waitForEvent("page"),
    viewAsPatient.click(),
  ]);
  await popup.waitForLoadState();
  expect(popup.url()).toBe(
    `${PLATFORM_BASE_URL}${BOOKING_PATH(listed.clinicId)}`,
  );
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("CA-34: de punta a punta, tras el onboarding y el horario, un paciente sin sesión abre el link copiado y reserva; la cabecera lleva lo escrito en el onboarding", async ({
  page,
  browser,
}) => {
  const context = await createApiContext();
  const { email, name, lastName } = await createConfirmedUser(context, {
    emailPrefix: "link-ca34",
  });
  const clinicName = uniqueName("Consultorio Paredes");
  const address = "Av. José Larco 812, of. 304, Miraflores";
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: PLATFORM_BASE_URL,
  });
  await loginViaUi(page, email, /\/onboarding$/);

  await fillOnboardingForm(page, { name: clinicName, address });
  await page.getByRole("button", { name: "Crear mi consultorio" }).click();
  await expect(page).toHaveURL(/\/clinic\/[^/]+\/dashboard$/, {
    timeout: 20_000,
  });
  const clinicId = page.url().split("/clinic/")[1].split("/")[0];
  await expect(copyLinkButton(page)).toHaveCount(0);

  await stepLink(
    stepNamed(page, "Define tu horario de atención"),
    "Definir horario",
  ).click();
  await page.getByRole("button", { name: "Agregar rango" }).first().click();
  await page.getByRole("button", { name: "Guardar disponibilidad" }).click();
  await expect(
    page.getByText("Disponibilidad guardada correctamente"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Inicio", exact: true }).first().click();
  await copyLinkButton(page).click();
  await expect(page.getByText("¡Link copiado!")).toBeVisible();
  const copiedLink = await page.evaluate(() => navigator.clipboard.readText());

  const patientContext = await browser.newContext();
  const patientPage = await patientContext.newPage();
  await patientPage.goto(copiedLink);
  await expect(
    patientPage.getByRole("heading", {
      level: 1,
      name: `Reserva tu cita con ${name} ${lastName}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(bookingHeader(patientPage)).toContainText(ONBOARDING_SPECIALTY);
  await expect(bookingHeader(patientPage)).toContainText(
    `${clinicName} · ${address}`,
  );
  await bookFromDateStep(patientPage);
  await expect(
    patientPage.getByRole("heading", { name: "¡Cita reservada!" }),
  ).toBeVisible();
  await patientContext.close();

  const prisma = await getTestPrisma();
  expect(await prisma.appointment.count({ where: { clinicId } })).toBe(1);
});

test("CA-35: en una sede creada antes de #110, donde el dueño no atiende, ve el aviso con «Asignar médicos en Usuarios» y, al asignarse como Médico desde Usuarios, ve la guía", async ({
  page,
}) => {
  const owner = await createOnboardedAdmin({ emailPrefix: "link-ca35" });
  const organizationId = await createOrganizationResource(owner);
  const clinicId = await createClinicResourceViaPrisma(owner, organizationId, {
    name: uniqueName("Sede CA-35"),
  });
  const specialtyName = uniqueName("Neurología");
  await createSpecialty(owner, organizationId, specialtyName);
  await openClinicDashboard(page, {
    email: owner.email,
    accountId: owner.accountId,
    clinicId,
  });
  await expect(linkNotice(page)).toBeVisible();
  await expect(firstSteps(page)).toHaveCount(0);

  await page
    .getByRole("link", { name: "Asignar médicos en Usuarios", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
  await page.getByRole("button", { name: "Invitar usuario" }).click();
  await page.getByLabel("Correo electrónico").fill(owner.email);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Rol").selectOption("DOCTOR");
  await page.getByLabel("Especialidades", { exact: true }).fill(specialtyName);
  await page.getByRole("button", { name: specialtyName, exact: true }).click();
  await page
    .getByRole("button", {
      name: /^(Asignar|Guardar cambios|Enviar invitación)$/,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("link", { name: "Inicio", exact: true }).first().click();

  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Te falta 1 paso para recibir citas",
    }),
  ).toBeVisible();
  await expect(stepNamed(page, "Elige tu especialidad")).toContainText(
    specialtyName,
  );
  await expect(linkNotice(page)).toHaveCount(0);
});

test("CA-37: el dashboard de la organización no muestra la guía, la fila, el aviso ni «Copiar link de reservas»", async ({
  page,
}) => {
  const legacy = await createLegacyOwnerClinic({ emailPrefix: "link-ca37" });
  const { owner, organizationId, clinicId } = legacy;
  await openClinicDashboard(page, {
    email: owner.email,
    accountId: owner.accountId,
    clinicId,
  });
  await expect(firstSteps(page)).toBeVisible();

  await page.context().addCookies([
    { name: "resource_id", value: organizationId, url: PLATFORM_BASE_URL },
    { name: "resource_type", value: "ORGANIZATION", url: PLATFORM_BASE_URL },
  ]);
  await page.goto(
    `/account/${owner.accountId}/organization/${organizationId}/dashboard`,
  );

  await expect(page.getByText(/Este es el panel de /)).toBeVisible();
  await expect(firstSteps(page)).toHaveCount(0);
  await expect(linkNotice(page)).toHaveCount(0);
  await expectNoLinkAnywhere(page, "organización");
});
