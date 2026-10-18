import {
  createClinicResource,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
} from "../../support/accounts";
import { seedFullDayAvailability } from "../../support/availability";
import { setDoctorTreatment } from "../../support/doctor-treatment";
import { invitePendingUser } from "../../support/invitations";
import { getTestPrisma } from "../../support/db";
import { expect, test } from "../../support/test";
import { uniqueEmail, uniqueName } from "../../support/users";

// docs/features/perfil-usuario/plan.md — PR 2, CA-17 a CA-19.

test.use({ viewport: { width: 375, height: 812 } });

const DRA_NAME = "Valeria";
const DRA_LAST_NAME = "Montes";
const PLAIN_NAME = "Ernesto";
const PLAIN_LAST_NAME = "Salazar";
const DRA_FULL_NAME = `Dra. ${DRA_NAME} ${DRA_LAST_NAME}`;
const PLAIN_FULL_NAME = `${PLAIN_NAME} ${PLAIN_LAST_NAME}`;

async function createScenario() {
  const admin = await createOnboardedAdmin({ emailPrefix: "admin-treat-book" });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName("ORG-treat-book"),
  );
  const clinicId = await createClinicResource(admin, organizationId, {
    name: uniqueName("Sede treat book"),
  });
  const specialtyName = uniqueName("Pediatría");
  const specialtyId = await createSpecialty(
    admin,
    organizationId,
    specialtyName,
  );

  const prisma = await getTestPrisma();
  await prisma.subscription.update({
    where: { accountId: admin.accountId },
    data: { plan: "CLINICA", status: "ACTIVE" },
  });

  const dra = await invitePendingUser(admin, {
    resourceId: clinicId,
    role: "DOCTOR",
    emailPrefix: "dra-treat-book",
    name: DRA_NAME,
    lastName: DRA_LAST_NAME,
    specialtyIds: [specialtyId],
  });
  const plain = await invitePendingUser(admin, {
    resourceId: clinicId,
    role: "DOCTOR",
    emailPrefix: "plain-treat-book",
    name: PLAIN_NAME,
    lastName: PLAIN_LAST_NAME,
    specialtyIds: [specialtyId],
  });
  await setDoctorTreatment(dra.userId, "DRA");
  await seedFullDayAvailability(dra.userId, clinicId);
  await seedFullDayAvailability(plain.userId, clinicId);

  return { clinicId, specialtyName };
}

test("CA-17: el paso del médico muestra «Dra. …» con tratamiento y solo el nombre sin él", async ({
  page,
}) => {
  const { clinicId, specialtyName } = await createScenario();

  await page.goto(`/clinic/${clinicId}/create-appointment`);
  await page.getByRole("button", { name: specialtyName, exact: true }).click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  await expect(
    page.getByRole("button", { name: DRA_FULL_NAME, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: PLAIN_FULL_NAME, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(`Dr. ${PLAIN_FULL_NAME}`)).toHaveCount(0);
});

test("CA-18: el resumen y el éxito dicen «con Dra. …» para la médica con tratamiento", async ({
  page,
}) => {
  const { clinicId, specialtyName } = await createScenario();

  await page.goto(`/clinic/${clinicId}/create-appointment`);
  await page.getByRole("button", { name: specialtyName, exact: true }).click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await page.getByRole("button", { name: DRA_FULL_NAME, exact: true }).click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  await page.getByRole("button", { name: "Semana siguiente" }).click();
  await page
    .getByRole("button", {
      name: /^(Lu|Ma|Mi|Ju|Vi|Sá|Do)\s*\d{1,2}$/,
      disabled: false,
    })
    .first()
    .click();
  await page
    .getByRole("button", { name: /^\d{2}:\d{2}$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  await expect(page.getByText(DRA_FULL_NAME, { exact: true })).toBeVisible();

  await page.getByLabel("Nombre").fill("Camila");
  await page.getByLabel("Apellido").fill("Rivas");
  await page.getByLabel("N° de documento").fill("45678912");
  await page.getByLabel("Fecha de nacimiento").fill("1990-05-20");
  await page.getByLabel("Teléfono").fill("988888888");
  await page.getByLabel("Email").fill(uniqueEmail("paciente-treat-book"));
  await page.getByRole("button", { name: "Confirmar reserva" }).click();

  await expect(page.getByText("¡Cita reservada!")).toBeVisible();
  await expect(page.getByText(DRA_FULL_NAME, { exact: true })).toBeVisible();
});

test("CA-19: con un médico sin tratamiento ningún paso muestra «Dr.» ni «Dra.»", async ({
  page,
}) => {
  const { clinicId, specialtyName } = await createScenario();
  const noTitle = page.getByText(/\bDra?\.\s/);

  await page.goto(`/clinic/${clinicId}/create-appointment`);
  await page.getByRole("button", { name: specialtyName, exact: true }).click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await page
    .getByRole("button", { name: PLAIN_FULL_NAME, exact: true })
    .click();
  // El otro médico de la sede sí tiene «Dra.»: se comprueba solo tras elegir.
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  await page.getByRole("button", { name: "Semana siguiente" }).click();
  await page
    .getByRole("button", {
      name: /^(Lu|Ma|Mi|Ju|Vi|Sá|Do)\s*\d{1,2}$/,
      disabled: false,
    })
    .first()
    .click();
  await page
    .getByRole("button", { name: /^\d{2}:\d{2}$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  await expect(page.getByText(PLAIN_FULL_NAME, { exact: true })).toBeVisible();
  await expect(noTitle).toHaveCount(0);

  await page.getByLabel("Nombre").fill("Camila");
  await page.getByLabel("Apellido").fill("Rivas");
  await page.getByLabel("N° de documento").fill("45678913");
  await page.getByLabel("Fecha de nacimiento").fill("1990-05-20");
  await page.getByLabel("Teléfono").fill("988888888");
  await page.getByLabel("Email").fill(uniqueEmail("paciente-treat-book"));
  await page.getByRole("button", { name: "Confirmar reserva" }).click();

  await expect(page.getByText("¡Cita reservada!")).toBeVisible();
  await expect(page.getByText(PLAIN_FULL_NAME, { exact: true })).toBeVisible();
  await expect(noTitle).toHaveCount(0);
});
