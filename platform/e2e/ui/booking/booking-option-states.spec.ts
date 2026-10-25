import type { Locator, Page } from "@playwright/test";
import { createSpecialty } from "../../support/accounts";
import { createManagedAppointment } from "../../support/appointment-portal";
import {
  addScenarioDoctor,
  createClinicScenario,
  createScenarioClinic,
  createScenarioSpecialty,
  createSoloScenario,
} from "../../support/booking-scenarios";
import {
  boxOf,
  chooseSlotAndGoToPatientStep,
  clickNext,
  confirmBooking,
  dayButtons,
  disabledDayButtons,
  enabledDayButtons,
  expectAvailableStyle,
  expectChosenStyle,
  expectNoHorizontalScroll,
  expectStep,
  expectUnavailableStyle,
  fillPatientForm,
  MOBILE_VIEWPORT,
  openBooking,
  optionButton,
  pickSlot,
  timeButtons,
} from "../../support/booking-ui";
import { expect, test } from "../../support/test";

// booking-cabecera-y-pasos CA-31, CA-32, CA-34 y CA-35.

test.use({ viewport: MOBILE_VIEWPORT });
test.describe.configure({ timeout: 90_000 });

const MONDAY_AND_WEDNESDAY = [1, 3];
const MIN_OPTION_WIDTH = 37;
const MIN_OPTION_HEIGHT = 40;
const MIN_DAY_HEIGHT = 52;
const MIN_ARROW_SIZE = 40;
const TIME_COLUMNS = 4;
const POSITION_TOLERANCE = 1;

async function openNextWeek(page: Page) {
  await page.getByRole("button", { name: "Semana siguiente" }).click();
  await expect(enabledDayButtons(page).first()).toBeVisible();
}

async function expectMinimumSize(
  option: Locator,
  minimum: { width: number; height: number },
) {
  const { width, height } = await boxOf(option);
  expect(width).toBeGreaterThanOrEqual(minimum.width);
  expect(height).toBeGreaterThanOrEqual(minimum.height);
}

test("CA-31: las especialidades y los médicos tienen «aria-pressed» y tocar otro desmarca el anterior", async ({
  page,
}) => {
  const scenario = await createClinicScenario("states-ca31-choices");
  const [firstDoctor, secondDoctor] = scenario.doctorsOfA;
  const specialtyA = optionButton(page, scenario.specialtyA.name);
  const specialtyB = optionButton(page, scenario.specialtyB.name);
  await openBooking(page, scenario.clinicId);

  await expectStep(page, "specialty");
  await expect(specialtyA).toHaveAttribute("aria-pressed", "false");
  await expect(specialtyB).toHaveAttribute("aria-pressed", "false");
  await specialtyA.click();
  await expect(specialtyA).toHaveAttribute("aria-pressed", "true");
  await expect(specialtyB).toHaveAttribute("aria-pressed", "false");
  await specialtyB.click();
  await expect(specialtyA).toHaveAttribute("aria-pressed", "false");
  await expect(specialtyB).toHaveAttribute("aria-pressed", "true");

  await specialtyA.click();
  await clickNext(page);

  await expectStep(page, "doctor");
  const first = optionButton(page, firstDoctor.displayName);
  const second = optionButton(page, secondDoctor.displayName);
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(second).toHaveAttribute("aria-pressed", "false");
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(second).toHaveAttribute("aria-pressed", "false");
  await second.click();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(second).toHaveAttribute("aria-pressed", "true");
});

test("CA-31: los días y las horas tienen «aria-pressed» y tocar otro desmarca el anterior", async ({
  page,
}) => {
  const scenario = await createSoloScenario("states-ca31-slots", {
    weekdays: MONDAY_AND_WEDNESDAY,
  });
  await openBooking(page, scenario.clinicId);
  await expectStep(page, "datetime");
  await openNextWeek(page);
  const firstDay = enabledDayButtons(page).nth(0);
  const secondDay = enabledDayButtons(page).nth(1);

  await expect(firstDay).toHaveAttribute("aria-pressed", "false");
  await expect(secondDay).toHaveAttribute("aria-pressed", "false");
  await firstDay.click();
  await expect(firstDay).toHaveAttribute("aria-pressed", "true");
  await expect(secondDay).toHaveAttribute("aria-pressed", "false");
  await secondDay.click();
  await expect(firstDay).toHaveAttribute("aria-pressed", "false");
  await expect(secondDay).toHaveAttribute("aria-pressed", "true");

  const firstTime = timeButtons(page).nth(0);
  const secondTime = timeButtons(page).nth(1);
  await expect(firstTime).toHaveAttribute("aria-pressed", "false");
  await firstTime.click();
  await expect(firstTime).toHaveAttribute("aria-pressed", "true");
  await expect(secondTime).toHaveAttribute("aria-pressed", "false");
  await secondTime.click();
  await expect(firstTime).toHaveAttribute("aria-pressed", "false");
  await expect(secondTime).toHaveAttribute("aria-pressed", "true");
});

test("CA-32: la especialidad y el médico elegidos tienen fondo teal oscuro y texto blanco, y los demás fondo blanco", async ({
  page,
}) => {
  const scenario = await createClinicScenario("states-ca32-choices");
  const [firstDoctor, secondDoctor] = scenario.doctorsOfA;
  await openBooking(page, scenario.clinicId);
  await expectStep(page, "specialty");
  await page.mouse.move(0, 0);

  await optionButton(page, scenario.specialtyA.name).click();
  await page.mouse.move(0, 0);
  await expectChosenStyle(optionButton(page, scenario.specialtyA.name));
  await expectAvailableStyle(optionButton(page, scenario.specialtyB.name));

  await clickNext(page);
  await expectStep(page, "doctor");
  await optionButton(page, firstDoctor.displayName).click();
  await page.mouse.move(0, 0);
  await expectChosenStyle(optionButton(page, firstDoctor.displayName));
  await expectAvailableStyle(optionButton(page, secondDoctor.displayName));
});

test("CA-32: el día y la hora elegidos tienen fondo teal oscuro y texto blanco, los demás blanco y los días sin horarios no tienen fondo", async ({
  page,
}) => {
  const scenario = await createSoloScenario("states-ca32-slots", {
    weekdays: MONDAY_AND_WEDNESDAY,
  });
  await openBooking(page, scenario.clinicId);
  await expectStep(page, "datetime");
  await openNextWeek(page);
  await page.mouse.move(0, 0);

  await expect(disabledDayButtons(page)).toHaveCount(5);
  for (const unavailableDay of await disabledDayButtons(page).all()) {
    await expectUnavailableStyle(unavailableDay);
  }

  await enabledDayButtons(page).nth(0).click();
  await timeButtons(page).nth(0).click();
  await page.mouse.move(0, 0);

  await expectChosenStyle(enabledDayButtons(page).nth(0));
  await expectAvailableStyle(enabledDayButtons(page).nth(1));
  await expectChosenStyle(timeButtons(page).nth(0));
  await expectAvailableStyle(timeButtons(page).nth(1));
});

test("CA-34: en el horario, a 375 px, los días miden al menos 37 × 52, las flechas 40 × 40 y los horarios van en 4 columnas", async ({
  page,
}) => {
  const scenario = await createSoloScenario("states-ca34-slots");
  await openBooking(page, scenario.clinicId);
  await expectStep(page, "datetime");
  await openNextWeek(page);

  const days = await dayButtons(page).all();
  expect(days).toHaveLength(7);
  for (const day of days) {
    await expectMinimumSize(day, {
      width: MIN_OPTION_WIDTH,
      height: MIN_DAY_HEIGHT,
    });
  }
  for (const name of ["Semana anterior", "Semana siguiente"]) {
    await expectMinimumSize(page.getByRole("button", { name }), {
      width: MIN_ARROW_SIZE,
      height: MIN_ARROW_SIZE,
    });
  }

  await enabledDayButtons(page).first().click();
  await expect(timeButtons(page).nth(TIME_COLUMNS)).toBeVisible();
  const slots = await timeButtons(page).all();
  const boxes = await Promise.all(slots.map(boxOf));
  for (const slotBox of boxes) {
    expect(slotBox.width).toBeGreaterThanOrEqual(MIN_OPTION_WIDTH);
    expect(slotBox.height).toBeGreaterThanOrEqual(MIN_OPTION_HEIGHT);
  }
  const firstRow = boxes.slice(0, TIME_COLUMNS);
  for (const [index, slotBox] of firstRow.entries()) {
    expect(Math.abs(slotBox.y - firstRow[0].y)).toBeLessThanOrEqual(
      POSITION_TOLERANCE,
    );
    if (index > 0) expect(slotBox.x).toBeGreaterThan(firstRow[index - 1].x);
  }
  const secondRowStart = boxes[TIME_COLUMNS];
  expect(secondRowStart.y).toBeGreaterThan(firstRow[0].y);
  expect(Math.abs(secondRowStart.x - firstRow[0].x)).toBeLessThanOrEqual(
    POSITION_TOLERANCE,
  );
});

test("CA-34: en los pasos de especialidad y médico ninguna opción mide menos de 37 × 40", async ({
  page,
}) => {
  const scenario = await createClinicScenario("states-ca34-choices");
  await openBooking(page, scenario.clinicId);
  await expectStep(page, "specialty");
  const minimum = { width: MIN_OPTION_WIDTH, height: MIN_OPTION_HEIGHT };

  await expectMinimumSize(
    optionButton(page, scenario.specialtyA.name),
    minimum,
  );
  await expectMinimumSize(
    optionButton(page, scenario.specialtyB.name),
    minimum,
  );

  await optionButton(page, scenario.specialtyA.name).click();
  await clickNext(page);
  await expectStep(page, "doctor");
  for (const doctor of scenario.doctorsOfA) {
    await expectMinimumSize(optionButton(page, doctor.displayName), minimum);
  }
});

test("CA-35: a 375 px no hay desplazamiento horizontal en ningún paso del booking", async ({
  page,
}) => {
  const scenario = await createClinicScenario("states-ca35-steps");
  await openBooking(page, scenario.clinicId);

  await expectStep(page, "specialty");
  await expectNoHorizontalScroll(page);

  await optionButton(page, scenario.specialtyA.name).click();
  await clickNext(page);
  await expectStep(page, "doctor");
  await expectNoHorizontalScroll(page);

  await optionButton(page, scenario.doctorsOfA[0].displayName).click();
  await clickNext(page);
  await expectStep(page, "datetime");
  await expectNoHorizontalScroll(page);

  await pickSlot(page);
  await expectNoHorizontalScroll(page);
  await clickNext(page);
  await expectStep(page, "patient");
  await expectNoHorizontalScroll(page);

  await confirmBooking(page);
  await expectNoHorizontalScroll(page);
});

test("CA-35: a 375 px no hay desplazamiento horizontal en el estado sin médicos", async ({
  page,
}) => {
  const clinic = await createScenarioClinic("states-ca35-empty");

  await openBooking(page, clinic.clinicId);

  await expect(
    page.getByText(/todavía no tiene doctores disponibles/),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});

const LONG_DOCTOR_NAME = "Alejandro Fernández";
const LONG_DOCTOR_LAST_NAME =
  "de la Santísima Trinidad Montealegre Valdivia Rodríguez Páez";
const LONG_CLINIC_NAME =
  "Clínica Internacional de Especialidades Médicas Santa María del Valle Alto Norte";
const LONG_ADDRESS =
  "Avenida Presidente Alfredo Benavides 1234, Torre Norte, Oficina 5678, Miraflores";
const LONG_TEXT_LENGTH = 80;

test("CA-35: un nombre de médico, de sede y una dirección de 80 caracteres se parten sin desplazamiento horizontal", async ({
  page,
}) => {
  expect(`${LONG_DOCTOR_NAME} ${LONG_DOCTOR_LAST_NAME}`).toHaveLength(
    LONG_TEXT_LENGTH,
  );
  expect(LONG_CLINIC_NAME).toHaveLength(LONG_TEXT_LENGTH);
  expect(LONG_ADDRESS).toHaveLength(LONG_TEXT_LENGTH);
  const scenario = await createSoloScenario("states-ca35-long", {
    clinicName: LONG_CLINIC_NAME,
    clinicAddress: LONG_ADDRESS,
    doctorName: LONG_DOCTOR_NAME,
    doctorLastName: LONG_DOCTOR_LAST_NAME,
  });
  await openBooking(page, scenario.clinicId);

  await expectStep(page, "datetime");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `Reserva tu cita con ${scenario.doctor.displayName}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(`${LONG_CLINIC_NAME} · ${LONG_ADDRESS}`, { exact: true }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);

  await chooseSlotAndGoToPatientStep(page);
  await expectNoHorizontalScroll(page);

  await confirmBooking(page);
  await expectNoHorizontalScroll(page);
});

test("CA-35: palabras de 80 caracteres sin espacios (médico, sede, dirección, especialidad y paciente) no provocan desplazamiento horizontal en ningún paso ni en la autogestión", async ({
  page,
}) => {
  const unbrokenWord = (prefix: string) => prefix.padEnd(LONG_TEXT_LENGTH, "x");
  const clinic = await createScenarioClinic("states-ca35-unbroken", {
    clinicName: unbrokenWord("Sede"),
    clinicAddress: unbrokenWord("Calle"),
  });
  const specialtyAName = unbrokenWord("Especialidad");
  const specialtyA = {
    id: await createSpecialty(
      clinic.admin,
      clinic.organizationId,
      specialtyAName,
    ),
    name: specialtyAName,
  };
  const specialtyB = await createScenarioSpecialty(clinic, "Corta");
  const doctor = await addScenarioDoctor(clinic, "states-ca35-unbroken-a1", {
    name: unbrokenWord("Nombre"),
    lastName: unbrokenWord("Apellido"),
    specialties: [specialtyA],
  });
  await addScenarioDoctor(clinic, "states-ca35-unbroken-a2", {
    name: unbrokenWord("Otro"),
    lastName: unbrokenWord("Segundo"),
    specialties: [specialtyA],
  });
  await addScenarioDoctor(clinic, "states-ca35-unbroken-b", {
    name: "Irene",
    lastName: "Campos",
    specialties: [specialtyB],
  });
  const patientNames = {
    name: unbrokenWord("Paciente"),
    lastName: unbrokenWord("Paciente"),
  };
  await openBooking(page, clinic.clinicId);

  await expectStep(page, "specialty");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `Reserva tu cita en ${clinic.clinicName}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(optionButton(page, specialtyA.name)).toBeVisible();
  await expectNoHorizontalScroll(page);

  await optionButton(page, specialtyA.name).click();
  await clickNext(page);
  await expectStep(page, "doctor");
  await expect(optionButton(page, doctor.displayName)).toBeVisible();
  await expectNoHorizontalScroll(page);

  await optionButton(page, doctor.displayName).click();
  await clickNext(page);
  await expectStep(page, "datetime");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `Reserva tu cita con ${doctor.displayName}`,
      exact: true,
    }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await pickSlot(page);
  await expectNoHorizontalScroll(page);

  await clickNext(page);
  await expectStep(page, "patient");
  await fillPatientForm(page, patientNames);
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expectStep(page, "success");
  await expect(
    page.getByText(`Te esperamos, ${patientNames.name}.`),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);

  const managed = await createManagedAppointment({
    ...clinic,
    specialtyId: specialtyA.id,
    specialtyName: specialtyA.name,
    doctor,
  });
  await page.goto(`/appointment/manage/${managed.token}`);
  await expect(
    page.getByRole("heading", { name: `Hola, ${managed.patient.name}` }),
  ).toBeVisible();
  await expect(
    page.getByText(clinic.clinicAddress, { exact: true }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("CA-35: un nombre de sede de 80 caracteres sin médicos no provoca desplazamiento horizontal", async ({
  page,
}) => {
  const clinic = await createScenarioClinic("states-ca35-empty-long", {
    clinicName: LONG_CLINIC_NAME,
    clinicAddress: LONG_ADDRESS,
  });

  await openBooking(page, clinic.clinicId);

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `Reserva tu cita en ${LONG_CLINIC_NAME}`,
      exact: true,
    }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});
