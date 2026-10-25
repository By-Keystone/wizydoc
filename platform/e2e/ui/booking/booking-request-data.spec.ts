import {
  createClinicScenario,
  createMultiSpecialtyScenario,
  createSoloScenario,
  createTeamScenario,
  readBookedAppointments,
} from "../../support/booking-scenarios";
import {
  bookFromDateStep,
  clickNext,
  MOBILE_VIEWPORT,
  openBooking,
  optionButton,
} from "../../support/booking-ui";
import { expect, test } from "../../support/test";

// booking-cabecera-y-pasos CA-37 y CA-38.

test.use({ viewport: MOBILE_VIEWPORT });
test.describe.configure({ timeout: 90_000 });

test("CA-37: en Independiente la cita guarda el médico, la especialidad y la sede que el paciente no tuvo que elegir", async ({
  page,
}) => {
  const scenario = await createSoloScenario("request-ca37");
  await openBooking(page, scenario.clinicId);

  await bookFromDateStep(page);

  const appointments = await readBookedAppointments(scenario.clinicId);
  expect(appointments).toHaveLength(1);
  expect(appointments[0].doctorProfileId).toBe(scenario.doctor.doctorProfileId);
  expect(appointments[0].specialty).toBe(scenario.specialty.name);
  expect(appointments[0].clinicId).toBe(scenario.clinicId);
});

test("CA-38: en Equipo la cita guarda la única especialidad y el médico elegido", async ({
  page,
}) => {
  const scenario = await createTeamScenario("request-ca38-team");
  const chosen = scenario.doctors[2];
  await openBooking(page, scenario.clinicId);
  await optionButton(page, chosen.displayName).click();
  await clickNext(page);

  await bookFromDateStep(page);

  const appointments = await readBookedAppointments(scenario.clinicId);
  expect(appointments).toHaveLength(1);
  expect(appointments[0].doctorProfileId).toBe(chosen.doctorProfileId);
  expect(appointments[0].specialty).toBe(scenario.specialty.name);
  expect(appointments[0].clinicId).toBe(scenario.clinicId);
});

test("CA-38: en Multiespecialidad la cita guarda la especialidad elegida y el único médico", async ({
  page,
}) => {
  const scenario = await createMultiSpecialtyScenario("request-ca38-multi");
  await openBooking(page, scenario.clinicId);
  await optionButton(page, scenario.specialtyB.name).click();
  await clickNext(page);

  await bookFromDateStep(page);

  const appointments = await readBookedAppointments(scenario.clinicId);
  expect(appointments).toHaveLength(1);
  expect(appointments[0].doctorProfileId).toBe(scenario.doctor.doctorProfileId);
  expect(appointments[0].specialty).toBe(scenario.specialtyB.name);
  expect(appointments[0].clinicId).toBe(scenario.clinicId);
});

test("CA-38: en Clínica con B la cita guarda B y su único médico", async ({
  page,
}) => {
  const scenario = await createClinicScenario("request-ca38-clinic");
  await openBooking(page, scenario.clinicId);
  await optionButton(page, scenario.specialtyB.name).click();
  await clickNext(page);

  await bookFromDateStep(page);

  const appointments = await readBookedAppointments(scenario.clinicId);
  expect(appointments).toHaveLength(1);
  expect(appointments[0].doctorProfileId).toBe(
    scenario.doctorOfB.doctorProfileId,
  );
  expect(appointments[0].specialty).toBe(scenario.specialtyB.name);
  expect(appointments[0].clinicId).toBe(scenario.clinicId);
});
