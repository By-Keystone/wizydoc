import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import {
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createSpecialty,
} from "../../support/accounts";
import {
  addPortalDoctor,
  createPortalScenario,
} from "../../support/appointment-portal";
import { getTestPrisma } from "../../support/db";
import {
  buildLinkCase,
  CORAL,
  copyLinkButton,
  createLegacyOwnerClinic,
  createOwnerWithFirstClinic,
  firstSteps,
  LINK_READY_TEXT,
  openClinicDashboard,
  stepLink,
  stepNamed,
  TEAL,
  WHITE,
} from "../../support/first-use";
import { createPatient } from "../../support/patients";
import { addDoctorProfile, findDoctorProfileId } from "../../support/profile";
import { expect, test } from "../../support/test";
import { uniqueName } from "../../support/users";

// docs/features/primer-uso/plan.md CA-22 a CA-29.

const SAVED_SPECIALTIES = "Guardamos tus especialidades.";
const SAVED_SCHEDULE = "Disponibilidad guardada correctamente";
const SCHEDULE_TITLE = "Define tu horario de atención";
const SPECIALTY_TITLE = "Elige tu especialidad";
const LINK_TITLE = "Comparte tu link de reservas";
const LINK_DOWN_TEXT =
  "Mientras tanto, tu link de reservas no funciona: quien lo abra no podrá reservar.";
const MONDAY = 1;

const toast = (page: Page, text: string) =>
  page.getByText(text, { exact: true }).first();

const goToStart = (page: Page) =>
  page.getByRole("link", { name: "Inicio", exact: true }).first().click();

async function seedMondaySchedule(doctorProfileId: string) {
  const prisma = await getTestPrisma();
  await prisma.availability.createMany({
    data: [
      {
        doctorProfileId,
        dayOfWeek: MONDAY,
        startTime: "09:00",
        endTime: "17:00",
      },
    ],
  });
}

test("CA-22: la guía sale debajo del saludo, sin botón para cerrarla, y no la ven quien no atiende ni quien ya aparece en el link", async ({
  page,
}) => {
  const attending = await buildLinkCase("guide-only");
  await openClinicDashboard(page, attending);

  const guide = firstSteps(page);
  await expect(guide).toBeVisible();
  await expect(guide.getByRole("button")).toHaveCount(0);
  const greeting = await page
    .getByRole("heading", { level: 1, name: /^Hola, / })
    .boundingBox();
  const guideBox = await guide.boundingBox();
  const todayBox = await page
    .getByRole("heading", { name: "Citas de hoy" })
    .boundingBox();
  expect(guideBox?.y ?? 0).toBeGreaterThan(
    (greeting?.y ?? 0) + (greeting?.height ?? 0),
  );
  expect(todayBox?.y ?? 0).toBeGreaterThan(guideBox?.y ?? 0);

  for (const name of [
    "notice-only",
    "link-only-bystander",
    "link-only-listed",
  ] as const) {
    await page.context().clearCookies();
    await openClinicDashboard(page, await buildLinkCase(name));
    await expect(firstSteps(page), name).toHaveCount(0);
  }
});

test("CA-23: el dueño de antes en una sede sin médicos ve «Te faltan 2 pasos» con la especialidad en coral, el horario en outline y el link bloqueado", async ({
  page,
}) => {
  const { owner, clinicId } = await createLegacyOwnerClinic({
    emailPrefix: "steps-ca23",
  });
  await openClinicDashboard(page, {
    email: owner.email,
    accountId: owner.accountId,
    clinicId,
  });

  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Te faltan 2 pasos para recibir citas",
    }),
  ).toBeVisible();
  await expect(firstSteps(page)).toContainText(LINK_DOWN_TEXT);

  const specialtyStep = stepNamed(page, SPECIALTY_TITLE);
  await expect(specialtyStep).toContainText(
    "Tus pacientes la ven al reservar.",
  );
  await expect(stepLink(specialtyStep, "Elegir especialidad")).toHaveCSS(
    "background-color",
    CORAL,
  );

  const scheduleStep = stepNamed(page, SCHEDULE_TITLE);
  await expect(scheduleStep).toContainText(
    "Elige los días y las horas en que atiendes. Tus pacientes solo podrán reservar en esos horarios.",
  );
  const scheduleLink = stepLink(scheduleStep, "Definir horario");
  await expect(scheduleLink).toHaveCSS("background-color", WHITE);
  await expect(scheduleLink).toHaveCSS("border-top-width", "1px");

  const linkStep = stepNamed(page, LINK_TITLE);
  await expect(linkStep).toContainText(
    "Cuando completes los pasos, aquí copias tu link para enviarlo por WhatsApp o ponerlo en tus redes.",
  );
  await expect(linkStep.getByRole("link")).toHaveCount(0);
  await expect(linkStep.getByRole("button")).toHaveCount(0);
});

test("CA-24: «Elegir especialidad» lleva a «Mi perfil»; al elegir una y volver a Inicio, queda 1 paso, la especialidad lista y el horario en coral", async ({
  page,
}) => {
  const { owner, organizationId, clinicId, clinicName } =
    await createLegacyOwnerClinic({ emailPrefix: "steps-ca24" });
  const specialtyName = uniqueName("Neurología");
  await createSpecialty(owner, organizationId, specialtyName);
  await openClinicDashboard(page, {
    email: owner.email,
    accountId: owner.accountId,
    clinicId,
  });

  await stepLink(
    stepNamed(page, SPECIALTY_TITLE),
    "Elegir especialidad",
  ).click();

  await expect(page).toHaveURL(
    `/account/${owner.accountId}/clinic/${clinicId}/me`,
  );
  const assign = page.getByRole("button", {
    name: `Asignar especialidades en ${clinicName}`,
    exact: true,
  });
  await expect(assign).toHaveText("Asignar especialidades");
  await assign.click();
  await page
    .getByLabel(`Especialidades en ${clinicName}`, { exact: true })
    .fill(specialtyName);
  await page.getByRole("button", { name: specialtyName, exact: true }).click();
  await page
    .getByRole("button", { name: "Guardar especialidades", exact: true })
    .click();
  await expect(toast(page, SAVED_SPECIALTIES)).toBeVisible();

  await goToStart(page);

  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Te falta 1 paso para recibir citas",
    }),
  ).toBeVisible();
  const specialtyStep = stepNamed(page, SPECIALTY_TITLE);
  await expect(specialtyStep).toContainText(specialtyName);
  await expect(
    specialtyStep.getByText(". Listo.", { exact: true }),
  ).toBeAttached();
  await expect(
    stepLink(stepNamed(page, SCHEDULE_TITLE), "Definir horario"),
  ).toHaveCSS("background-color", CORAL);
});

test("CA-25: «Definir horario» lleva a «Mi Disponibilidad»; con el horario guardado, al volver a Inicio la guía ya no está y se ve la fila del link", async ({
  page,
}) => {
  const { owner, clinicId } = await createOwnerWithFirstClinic({
    emailPrefix: "steps-ca25",
  });
  await openClinicDashboard(page, {
    email: owner.email,
    accountId: owner.accountId,
    clinicId,
  });

  await stepLink(stepNamed(page, SCHEDULE_TITLE), "Definir horario").click();

  await expect(page).toHaveURL(
    `/account/${owner.accountId}/clinic/${clinicId}/profile/availability`,
  );
  await expect(
    page.getByRole("heading", { name: "Mi Disponibilidad" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Agregar rango" }).first().click();
  await page.getByRole("button", { name: "Guardar disponibilidad" }).click();
  await expect(toast(page, SAVED_SCHEDULE)).toBeVisible();

  await goToStart(page);

  await expect(page.getByText(LINK_READY_TEXT)).toBeVisible();
  await expect(firstSteps(page)).toHaveCount(0);
  await expect(copyLinkButton(page)).toBeVisible();
});

test("CA-26: si el médico borra todo su horario vuelve la guía con el paso 2 pendiente y desaparece la fila; sus citas de hoy siguen en «Citas de hoy»", async ({
  page,
}) => {
  const { owner, clinicId } = await createOwnerWithFirstClinic({
    emailPrefix: "steps-ca26",
  });
  const doctorProfileId =
    (await findDoctorProfileId(owner.userId, clinicId)) ?? "";
  await seedMondaySchedule(doctorProfileId);
  const patient = await createPatient(owner.accountId);
  const prisma = await getTestPrisma();
  await prisma.appointment.create({
    data: {
      doctorProfileId,
      clinicId,
      patientId: patient.id,
      scheduledAt: new Date(),
      durationMinutes: 30,
      specialty: "Dermatología",
    },
  });
  await openClinicDashboard(page, {
    email: owner.email,
    accountId: owner.accountId,
    clinicId,
  });
  await expect(page.getByText(LINK_READY_TEXT)).toBeVisible();
  await expect(firstSteps(page)).toHaveCount(0);

  await page
    .getByRole("link", { name: "Configuración", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Eliminar rango del lunes" }).click();
  await page.getByRole("button", { name: "Guardar disponibilidad" }).click();
  await expect(toast(page, SAVED_SCHEDULE)).toBeVisible();
  await goToStart(page);

  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Te falta 1 paso para recibir citas",
    }),
  ).toBeVisible();
  await expect(
    stepLink(stepNamed(page, SCHEDULE_TITLE), "Definir horario"),
  ).toBeVisible();
  await expect(page.getByText(LINK_READY_TEXT)).toHaveCount(0);
  await expect(copyLinkButton(page)).toHaveCount(0);
  await expect(page.getByText(patient.fullName)).toBeVisible();
});

test("CA-27: un médico invitado sin especialidad, en una sede con médicos, ve la fila del link y «Te faltan 2 pasos para aparecer en el link de reservas» con el paso 1 sin botón", async ({
  page,
}) => {
  const scenario = await createPortalScenario("steps-ca27");
  const doctor = await createMemberWithRole({
    accountId: scenario.admin.accountId,
    resourceId: scenario.clinicId,
    role: "DOCTOR",
    createdBy: scenario.admin.userId,
    emailPrefix: "steps-ca27-doctor",
  });
  const prisma = await getTestPrisma();
  await prisma.doctorProfile.create({
    data: { membershipId: doctor.membershipId },
  });
  await openClinicDashboard(page, {
    email: doctor.email,
    accountId: scenario.admin.accountId,
    clinicId: scenario.clinicId,
  });

  await expect(page.getByText(LINK_READY_TEXT)).toBeVisible();
  await expect(copyLinkButton(page)).toHaveCSS("background-color", CORAL);
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Te faltan 2 pasos para aparecer en el link de reservas",
    }),
  ).toBeVisible();
  await expect(firstSteps(page)).toContainText(
    `El link de ${scenario.clinicName} ya recibe citas con otros médicos.`,
  );

  const specialtyStep = stepNamed(page, SPECIALTY_TITLE);
  await expect(specialtyStep).toContainText(
    `Te la asigna un administrador de ${scenario.clinicName}.`,
  );
  await expect(specialtyStep.getByRole("link")).toHaveCount(0);
  await expect(specialtyStep.getByRole("button")).toHaveCount(0);
  await expect(
    stepLink(stepNamed(page, SCHEDULE_TITLE), "Definir horario"),
  ).toHaveCSS("background-color", TEAL);
  await expect(stepNamed(page, LINK_TITLE)).toHaveCount(0);
});

test("CA-28: la guía y la fila no nombran a otros médicos ni sus especialidades, y el paso 1 sólo muestra las del médico en esta sede", async ({
  page,
}) => {
  const { owner, organizationId, clinicId, clinicName } =
    await createLegacyOwnerClinic({ emailPrefix: "steps-ca28" });
  const ownSpecialty = uniqueName("Cardiología");
  const otherClinicSpecialty = uniqueName("Oftalmología");
  const colleagueSpecialty = uniqueName("Urología");
  const ownSpecialtyId = await createSpecialty(
    owner,
    organizationId,
    ownSpecialty,
  );
  const otherClinicSpecialtyId = await createSpecialty(
    owner,
    organizationId,
    otherClinicSpecialty,
  );
  const colleagueSpecialtyId = await createSpecialty(
    owner,
    organizationId,
    colleagueSpecialty,
  );
  const colleagueLastName = `Ventura${randomUUID().slice(0, 8)}`;
  await addPortalDoctor({
    label: "steps-ca28-colega",
    clinicId,
    admin: owner,
    specialtyId: colleagueSpecialtyId,
    name: "Zoraida",
    lastName: colleagueLastName,
  });

  const viewer = await createMemberWithRole({
    accountId: owner.accountId,
    resourceId: clinicId,
    role: "DOCTOR",
    createdBy: owner.userId,
    emailPrefix: "steps-ca28-ver",
    name: "Víctor",
    lastName: "Salazar",
  });
  await addDoctorProfile(viewer.userId, clinicId, [ownSpecialtyId]);
  const otherClinicId = await createClinicResourceViaPrisma(
    owner,
    organizationId,
    { name: uniqueName("Otra sede") },
  );
  const prisma = await getTestPrisma();
  await prisma.userResourceMembership.create({
    data: {
      userId: viewer.userId,
      resourceId: otherClinicId,
      accountId: owner.accountId,
      role: "DOCTOR",
      createdBy: owner.userId,
    },
  });
  await addDoctorProfile(viewer.userId, otherClinicId, [
    otherClinicSpecialtyId,
  ]);

  await openClinicDashboard(page, {
    email: viewer.email,
    accountId: owner.accountId,
    clinicId,
  });

  await expect(page.getByText(LINK_READY_TEXT)).toBeVisible();
  await expect(firstSteps(page)).toContainText(
    `El link de ${clinicName} ya recibe citas con otros médicos.`,
  );
  await expect(stepNamed(page, SPECIALTY_TITLE)).toContainText(ownSpecialty);
  const dashboardText = await page.getByRole("main").innerText();
  for (const hidden of [
    "Zoraida",
    colleagueLastName,
    colleagueSpecialty,
    otherClinicSpecialty,
  ]) {
    expect(dashboardText).not.toContain(hidden);
  }
});

test.describe("CA-29: accesibilidad de la guía", () => {
  test("la sección apunta a su título, los pasos van en un ol con su estado en texto, los íconos van ocultos y los botones son enlaces con nombre", async ({
    page,
  }) => {
    const { owner, clinicId } = await createLegacyOwnerClinic({
      emailPrefix: "steps-ca29",
    });
    await openClinicDashboard(page, {
      email: owner.email,
      accountId: owner.accountId,
      clinicId,
    });

    const guide = firstSteps(page);
    const title = guide.getByRole("heading", { level: 2 });
    const titleId = await title.getAttribute("id");
    expect(titleId).toBeTruthy();
    expect(await guide.getAttribute("aria-labelledby")).toBe(titleId);
    expect(await guide.evaluate((section) => section.tagName)).toBe("SECTION");

    const steps = guide.getByRole("list");
    await expect(steps).toHaveCount(1);
    expect(await steps.evaluate((list) => list.tagName)).toBe("OL");
    await expect(steps.getByRole("listitem")).toHaveCount(3);

    await expect(
      stepNamed(page, SPECIALTY_TITLE).getByText(". Pendiente.", {
        exact: true,
      }),
    ).toBeAttached();
    await expect(
      stepNamed(page, SCHEDULE_TITLE).getByText(". Pendiente.", {
        exact: true,
      }),
    ).toBeAttached();
    await expect(
      stepNamed(page, LINK_TITLE).getByText(
        ". Disponible al completar los pasos anteriores.",
        { exact: true },
      ),
    ).toBeAttached();

    await expect(guide.locator("svg:not([aria-hidden='true'])")).toHaveCount(0);

    const base = `/account/${owner.accountId}/clinic/${clinicId}`;
    await expect(
      stepLink(stepNamed(page, SPECIALTY_TITLE), "Elegir especialidad"),
    ).toHaveAttribute("href", `${base}/me`);
    await expect(
      stepLink(stepNamed(page, SCHEDULE_TITLE), "Definir horario"),
    ).toHaveAttribute("href", `${base}/profile/availability`);
  });

  test("un paso listo dice «Listo» en texto y su círculo no aporta nombre propio", async ({
    page,
  }) => {
    const { owner, clinicId } = await createOwnerWithFirstClinic({
      emailPrefix: "steps-ca29-listo",
    });
    await openClinicDashboard(page, {
      email: owner.email,
      accountId: owner.accountId,
      clinicId,
    });

    const doneStep = stepNamed(page, SPECIALTY_TITLE);
    await expect(
      doneStep.getByText(". Listo.", { exact: true }),
    ).toBeAttached();
    await expect(doneStep.locator("svg:not([aria-hidden='true'])")).toHaveCount(
      0,
    );
    await expect(doneStep.getByRole("link")).toHaveCount(0);
  });
});
