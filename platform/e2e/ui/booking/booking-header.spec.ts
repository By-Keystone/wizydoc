import type { Page } from "@playwright/test";
import {
  createClinicResourceViaPrisma,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
} from "../../support/accounts";
import { addPortalDoctor } from "../../support/appointment-portal";
import {
  addScenarioDoctor,
  createClinicScenario,
  createMultiSpecialtyScenario,
  createScenarioClinic,
  createScenarioSpecialty,
  createSimpleClinicScenario,
  createSoloScenario,
  createTeamScenario,
  removeClinicRow,
  setClinicAddress,
  type SoloScenario,
} from "../../support/booking-scenarios";
import {
  bookFromDateStep,
  bookingHeader,
  boxOf,
  chooseSlotAndGoToPatientStep,
  clickBack,
  clickNext,
  confirmBooking,
  expectStep,
  MOBILE_VIEWPORT,
  openBooking,
  optionButton,
  pageHeading,
  pickSlot,
  stepTitle,
} from "../../support/booking-ui";
import { expect, test } from "../../support/test";
import { uniqueName } from "../../support/users";

// booking-cabecera-y-pasos CA-16 a CA-23, CA-25, CA-26, CA-28 y CA-40.

test.use({ viewport: MOBILE_VIEWPORT });
test.describe.configure({ timeout: 90_000 });

const NO_DOCTORS_MESSAGE =
  "Esta sede todavía no tiene médicos disponibles para reservar citas.";
const LOAD_ERROR_MESSAGE = /algo salió mal|no pudimos|no se pudo/i;
const DOCTOR_TITLE = /\bDra?\.\s/;

async function expectSoloHeader(page: Page, scenario: SoloScenario) {
  const header = bookingHeader(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    pageHeading(page, `Reserva tu cita con ${scenario.doctor.displayName}`),
  ).toBeVisible();
  await expect(
    header.getByText(scenario.specialty.name, { exact: true }),
  ).toBeVisible();
  await expect(
    header.getByText(`${scenario.clinicName} · ${scenario.clinicAddress}`, {
      exact: true,
    }),
  ).toBeVisible();
}

test("CA-16: en Independiente la cabecera del médico, su especialidad y la sede van arriba desde el horario hasta «Tus datos»", async ({
  page,
}) => {
  const scenario = await createSoloScenario("header-ca16");

  await openBooking(page, scenario.clinicId);

  await expectStep(page, "datetime");
  await expectSoloHeader(page, scenario);
  const headerBox = await boxOf(bookingHeader(page));
  const titleBox = await boxOf(stepTitle(page, "datetime"));
  expect(headerBox.y + headerBox.height).toBeLessThanOrEqual(titleBox.y);

  await chooseSlotAndGoToPatientStep(page);

  await expectSoloHeader(page, scenario);
});

test("CA-17: la cabecera usa el nombre del api con «Dra.» cuando la médica tiene tratamiento", async ({
  page,
}) => {
  const scenario = await createSoloScenario("header-ca17-dra", {
    treatment: "DRA",
  });

  await openBooking(page, scenario.clinicId);

  await expect(
    pageHeading(page, "Reserva tu cita con Dra. Lucía Paredes Quispe"),
  ).toBeVisible();
});

test("CA-17: sin tratamiento la cabecera dice solo el nombre y ningún paso muestra «Dr.» ni «Dra.»", async ({
  page,
}) => {
  const scenario = await createSoloScenario("header-ca17-plain");
  const noTitle = page.getByText(DOCTOR_TITLE);

  await openBooking(page, scenario.clinicId);

  await expect(
    pageHeading(page, "Reserva tu cita con Lucía Paredes Quispe"),
  ).toBeVisible();
  await expectStep(page, "datetime");
  await expect(noTitle).toHaveCount(0);

  await chooseSlotAndGoToPatientStep(page);
  await expect(noTitle).toHaveCount(0);

  await confirmBooking(page);
  await expect(noTitle).toHaveCount(0);
});

test("CA-18: en Equipo la cabecera muestra la sede hasta «Siguiente» y después al médico, que se mantiene al volver", async ({
  page,
}) => {
  const scenario = await createTeamScenario("header-ca18");
  const [, chosen, other] = scenario.doctors;
  const header = bookingHeader(page);
  const locationLine = `${scenario.clinicName} · ${scenario.clinicAddress}`;

  await openBooking(page, scenario.clinicId);

  await expectStep(page, "doctor");
  await expect(
    pageHeading(page, `Reserva tu cita en ${scenario.clinicName}`),
  ).toBeVisible();
  await expect(
    header.getByText(scenario.specialty.name, { exact: true }),
  ).toBeVisible();
  await expect(
    header.getByText(scenario.clinicAddress, { exact: true }),
  ).toBeVisible();
  await expect(header).not.toContainText(" · ");

  await optionButton(page, chosen.displayName).click();
  await expect(optionButton(page, chosen.displayName)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    pageHeading(page, `Reserva tu cita en ${scenario.clinicName}`),
  ).toBeVisible();

  await clickNext(page);

  await expectStep(page, "datetime");
  await expect(
    pageHeading(page, `Reserva tu cita con ${chosen.displayName}`),
  ).toBeVisible();
  await expect(
    header.getByText(scenario.specialty.name, { exact: true }),
  ).toBeVisible();
  await expect(header.getByText(locationLine, { exact: true })).toBeVisible();

  await clickBack(page);

  await expectStep(page, "doctor");
  await expect(
    pageHeading(page, `Reserva tu cita con ${chosen.displayName}`),
  ).toBeVisible();

  await optionButton(page, other.displayName).click();
  await expect(
    pageHeading(page, `Reserva tu cita con ${chosen.displayName}`),
  ).toBeVisible();
  await clickNext(page);

  await expectStep(page, "datetime");
  await expect(
    pageHeading(page, `Reserva tu cita con ${other.displayName}`),
  ).toBeVisible();
});

test("CA-19: en Clínica la cabecera muestra la sede sin especialidad y ésta aparece al pulsar «Siguiente»", async ({
  page,
}) => {
  const scenario = await createClinicScenario("header-ca19-a");
  const header = bookingHeader(page);

  await openBooking(page, scenario.clinicId);

  await expectStep(page, "specialty");
  await expect(
    pageHeading(page, `Reserva tu cita en ${scenario.clinicName}`),
  ).toBeVisible();
  await expect(header).not.toContainText(scenario.specialtyA.name);
  await expect(header).not.toContainText(scenario.specialtyB.name);

  await optionButton(page, scenario.specialtyA.name).click();
  await expect(optionButton(page, scenario.specialtyA.name)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(header).not.toContainText(scenario.specialtyA.name);

  await clickNext(page);

  await expectStep(page, "doctor");
  await expect(
    header.getByText(scenario.specialtyA.name, { exact: true }),
  ).toBeVisible();
  await expect(
    pageHeading(page, `Reserva tu cita en ${scenario.clinicName}`),
  ).toBeVisible();
});

test("CA-19: en Clínica con B la cabecera pasa a su único médico", async ({
  page,
}) => {
  const scenario = await createClinicScenario("header-ca19-b");
  const header = bookingHeader(page);
  await openBooking(page, scenario.clinicId);
  await optionButton(page, scenario.specialtyB.name).click();

  await clickNext(page);

  await expectStep(page, "datetime");
  await expect(
    pageHeading(page, `Reserva tu cita con ${scenario.doctorOfB.displayName}`),
  ).toBeVisible();
  await expect(
    header.getByText(scenario.specialtyB.name, { exact: true }),
  ).toBeVisible();
});

test("CA-20: en Multiespecialidad la cabecera muestra al médico desde el primer paso y la especialidad al elegirla", async ({
  page,
}) => {
  const scenario = await createMultiSpecialtyScenario("header-ca20");
  const header = bookingHeader(page);

  await openBooking(page, scenario.clinicId);

  await expectStep(page, "specialty");
  await expect(
    pageHeading(page, `Reserva tu cita con ${scenario.doctor.displayName}`),
  ).toBeVisible();
  await expect(header).not.toContainText(scenario.specialtyA.name);
  await expect(header).not.toContainText(scenario.specialtyB.name);

  await optionButton(page, scenario.specialtyB.name).click();
  await clickNext(page);

  await expectStep(page, "datetime");
  await expect(
    header.getByText(scenario.specialtyB.name, { exact: true }),
  ).toBeVisible();
  await expect(header).not.toContainText(scenario.specialtyA.name);
});

test("CA-21: con la dirección vacía y el médico definido la ubicación dice solo la sede, sin separadores", async ({
  page,
}) => {
  const scenario = await createSoloScenario("header-ca21-solo");
  await setClinicAddress(scenario.clinicId, "");
  const header = bookingHeader(page);

  await openBooking(page, scenario.clinicId);

  await expectStep(page, "datetime");
  await expect(
    header.getByText(scenario.clinicName, { exact: true }),
  ).toBeVisible();
  await expect(header).not.toContainText("·");
});

test("CA-21: con la dirección vacía y sin médico definido no hay línea de ubicación", async ({
  page,
}) => {
  const scenario = await createClinicScenario("header-ca21-clinic");
  await setClinicAddress(scenario.clinicId, "");

  await openBooking(page, scenario.clinicId);

  await expectStep(page, "specialty");
  await expect(bookingHeader(page)).toHaveText(
    `Reserva tu cita en ${scenario.clinicName}`,
  );
});

test("CA-22: con la sede sin cargar, Independiente muestra al médico y su especialidad sin ubicación hasta «Tus datos»", async ({
  page,
}) => {
  const scenario = await createSoloScenario("header-ca22");
  await removeClinicRow(scenario.clinicId);
  const header = bookingHeader(page);
  const body = page.locator("body");

  await openBooking(page, scenario.clinicId);

  await expectStep(page, "datetime", { current: 1, total: 2 });
  await expect(body).not.toContainText(LOAD_ERROR_MESSAGE);
  await expect(
    pageHeading(page, `Reserva tu cita con ${scenario.doctor.displayName}`),
  ).toBeVisible();
  await expect(
    header.getByText(scenario.specialty.name, { exact: true }),
  ).toBeVisible();
  await expect(header).not.toContainText(scenario.clinicName);
  await expect(header).not.toContainText(scenario.clinicAddress);

  await pickSlot(page);
  await clickNext(page);

  await expectStep(page, "patient", { current: 2, total: 2 });
  await expect(body).not.toContainText(LOAD_ERROR_MESSAGE);
  await expect(
    pageHeading(page, `Reserva tu cita con ${scenario.doctor.displayName}`),
  ).toBeVisible();
  await expect(
    header.getByText(scenario.specialty.name, { exact: true }),
  ).toBeVisible();
  await expect(header).not.toContainText(scenario.clinicAddress);
});

test("CA-23: con la sede sin cargar, Clínica dice solo «Reserva tu cita» y pasa al médico de B al elegirla", async ({
  page,
}) => {
  const scenario = await createClinicScenario("header-ca23");
  await removeClinicRow(scenario.clinicId);
  const header = bookingHeader(page);

  await openBooking(page, scenario.clinicId);

  await expectStep(page, "specialty");
  await expect(pageHeading(page, "Reserva tu cita")).toBeVisible();
  await expect(header).toHaveText("Reserva tu cita");

  await optionButton(page, scenario.specialtyB.name).click();
  await clickNext(page);

  await expectStep(page, "datetime");
  await expect(
    pageHeading(page, `Reserva tu cita con ${scenario.doctorOfB.displayName}`),
  ).toBeVisible();
  await expect(
    header.getByText(scenario.specialtyB.name, { exact: true }),
  ).toBeVisible();
  await expect(header).not.toContainText(scenario.clinicAddress);
});

test("CA-25: «¡Cita reservada!» no lleva cabecera ni barra y su resumen muestra la sede y la dirección", async ({
  page,
}) => {
  const scenario = await createSoloScenario("header-ca25");
  await openBooking(page, scenario.clinicId);

  await bookFromDateStep(page);

  const main = page.getByRole("main");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  await expect(main.getByText("Reserva tu cita")).toHaveCount(0);
  await expect(main.getByText(/Paso \d+ de \d+/)).toHaveCount(0);
  await expect(
    main.getByText(scenario.clinicName, { exact: true }),
  ).toBeVisible();
  await expect(
    main.getByText(scenario.clinicAddress, { exact: true }),
  ).toBeVisible();
});

test("CA-26: una sede sin médicos con horarios muestra un único «Reserva tu cita en {sede}», la dirección y el aviso, sin barra", async ({
  page,
}) => {
  const clinic = await createScenarioClinic("header-ca26");
  const specialty = await createScenarioSpecialty(clinic, "Sin horarios");
  await addScenarioDoctor(clinic, "header-ca26-doc", {
    name: "Nora",
    lastName: "Sinagenda",
    specialties: [specialty],
    hasSchedule: false,
  });

  await openBooking(page, clinic.clinicId);

  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    pageHeading(page, `Reserva tu cita en ${clinic.clinicName}`),
  ).toBeVisible();
  await expect(
    page.getByText(clinic.clinicAddress, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(NO_DOCTORS_MESSAGE, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Paso \d+ de \d+/)).toHaveCount(0);
  await expect(page.getByText("Reservar cita", { exact: true })).toHaveCount(0);
});

test("CA-26: si además la sede no carga, el único «h1» dice «Reserva tu cita»", async ({
  page,
}) => {
  const clinic = await createScenarioClinic("header-ca26-unloaded");
  await removeClinicRow(clinic.clinicId);

  await openBooking(page, clinic.clinicId);

  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(pageHeading(page, "Reserva tu cita")).toBeVisible();
  await expect(
    page.getByText(NO_DOCTORS_MESSAGE, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Paso \d+ de \d+/)).toHaveCount(0);
  await expect(page.getByText("Reservar cita", { exact: true })).toHaveCount(0);
});

async function expectTitleAndNoindex(page: Page, title: string) {
  await expect(page).toHaveTitle(title);
  await expect(page).not.toHaveTitle(/Panel/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
}

test("CA-28: con un solo médico (Independiente) el título es «Reserva tu cita con {médico} · WizyDoc», cargue o no la sede", async ({
  page,
}) => {
  const loaded = await createSoloScenario("title-ca28-solo");
  const unloaded = await createSoloScenario("title-ca28-solo-unloaded");
  await removeClinicRow(unloaded.clinicId);

  await openBooking(page, loaded.clinicId);
  await expectTitleAndNoindex(
    page,
    `Reserva tu cita con ${loaded.doctor.displayName} · WizyDoc`,
  );

  await openBooking(page, unloaded.clinicId);
  await expectTitleAndNoindex(
    page,
    `Reserva tu cita con ${unloaded.doctor.displayName} · WizyDoc`,
  );
});

test("CA-28: con un solo médico con varias especialidades (Multiespecialidad) el título nombra al médico", async ({
  page,
}) => {
  const loaded = await createMultiSpecialtyScenario("title-ca28-multi");
  const unloaded = await createMultiSpecialtyScenario(
    "title-ca28-multi-unloaded",
  );
  await removeClinicRow(unloaded.clinicId);

  await openBooking(page, loaded.clinicId);
  await expectTitleAndNoindex(
    page,
    `Reserva tu cita con ${loaded.doctor.displayName} · WizyDoc`,
  );

  await openBooking(page, unloaded.clinicId);
  await expectTitleAndNoindex(
    page,
    `Reserva tu cita con ${unloaded.doctor.displayName} · WizyDoc`,
  );
});

test("CA-28: con varios médicos (Equipo, Clínica y Clínica simple) el título nombra la sede", async ({
  page,
}) => {
  const team = await createTeamScenario("title-ca28-team");
  const clinic = await createClinicScenario("title-ca28-clinic");
  const simple = await createSimpleClinicScenario("title-ca28-simple");

  for (const scenario of [team, clinic, simple]) {
    await openBooking(page, scenario.clinicId);
    await expectTitleAndNoindex(
      page,
      `Reserva tu cita en ${scenario.clinicName} · WizyDoc`,
    );
  }
});

test("CA-28: con varios médicos y la sede sin cargar el título es «Reserva tu cita · WizyDoc»", async ({
  page,
}) => {
  const scenario = await createTeamScenario("title-ca28-team-unloaded");
  await removeClinicRow(scenario.clinicId);

  await openBooking(page, scenario.clinicId);

  await expectTitleAndNoindex(page, "Reserva tu cita · WizyDoc");
});

test("CA-28: sin médicos el título nombra la sede", async ({ page }) => {
  const clinic = await createScenarioClinic("title-ca28-empty");

  await openBooking(page, clinic.clinicId);

  await expectTitleAndNoindex(
    page,
    `Reserva tu cita en ${clinic.clinicName} · WizyDoc`,
  );
});

test("CA-40: el booking de una sede no muestra su teléfono, otra sede de la organización ni especialidades ajenas en ningún paso", async ({
  page,
}) => {
  const scenario = await createClinicScenario("privacy-ca40");

  const neighborName = uniqueName("Sede vecina");
  const neighborAddress = "Calle Vecina 999, San Isidro";
  const neighborPhone = "+51912345678";
  const neighborClinicId = await createClinicResourceViaPrisma(
    scenario.admin,
    scenario.organizationId,
    { name: neighborName, address: neighborAddress, phone: neighborPhone },
  );
  const neighborSpecialty = await createScenarioSpecialty(
    scenario,
    "Especialidad vecina",
  );
  const neighborDoctorLastName = uniqueName("Vecino");
  await addPortalDoctor({
    label: "privacy-ca40-vecino",
    clinicId: neighborClinicId,
    admin: scenario.admin,
    specialtyId: neighborSpecialty.id,
    name: "Zacarías",
    lastName: neighborDoctorLastName,
  });

  const foreignAdmin = await createOnboardedAdmin({
    emailPrefix: "admin-ajeno-ca40",
  });
  const foreignOrganizationId = await createOrganizationResource(
    foreignAdmin,
    uniqueName("ORG-AJENA-CA40"),
  );
  const foreignSpecialtyName = uniqueName("Especialidad ajena");
  await createSpecialty(
    foreignAdmin,
    foreignOrganizationId,
    foreignSpecialtyName,
  );

  const forbidden = [
    "987654321",
    "987 654 321",
    "987-654-321",
    neighborName,
    neighborAddress,
    neighborDoctorLastName,
    "912345678",
    neighborSpecialty.name,
    foreignSpecialtyName,
  ];
  const expectNothingForbidden = async () => {
    for (const text of forbidden) {
      await expect(page.locator("body")).not.toContainText(text);
      expect(await page.title()).not.toContain(text);
    }
  };

  await openBooking(page, scenario.clinicId);
  await expectStep(page, "specialty");
  await expectNothingForbidden();

  await optionButton(page, scenario.specialtyA.name).click();
  await clickNext(page);
  await expectStep(page, "doctor");
  await expectNothingForbidden();

  await optionButton(page, scenario.doctorsOfA[0].displayName).click();
  await clickNext(page);
  await expectStep(page, "datetime");
  await expectNothingForbidden();

  await pickSlot(page);
  await clickNext(page);
  await expectStep(page, "patient");
  await expectNothingForbidden();

  await confirmBooking(page);
  await expectNothingForbidden();
});
