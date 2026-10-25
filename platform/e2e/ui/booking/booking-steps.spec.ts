import {
  createClinicScenario,
  createMultiSpecialtyScenario,
  createSimpleClinicScenario,
  createSoloScenario,
  createTeamScenario,
  readBookedAppointments,
} from "../../support/booking-scenarios";
import {
  backButton,
  bookFromDateStep,
  chosenOptions,
  clickBack,
  clickNext,
  expectStep,
  MOBILE_VIEWPORT,
  nextButton,
  openBooking,
  optionButton,
  pageHeading,
  pickSlot,
  stepTitle,
  type BookingStepName,
} from "../../support/booking-ui";
import { expect, test } from "../../support/test";

// booking-cabecera-y-pasos CA-1 a CA-5, CA-8 a CA-10 y CA-12 a CA-15.

test.use({ viewport: MOBILE_VIEWPORT });
test.describe.configure({ timeout: 90_000 });

test("CA-1: Independiente empieza en «Elige fecha y horario», sigue a «Tus datos» y termina en «¡Cita reservada!»", async ({
  page,
}) => {
  const scenario = await createSoloScenario("steps-ca1");

  await openBooking(page, scenario.clinicId);

  await expectStep(page, "datetime", { current: 1, total: 2 });
  await expect(stepTitle(page, "specialty")).toHaveCount(0);
  await expect(stepTitle(page, "doctor")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: scenario.specialty.name }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: scenario.doctor.fullName }),
  ).toHaveCount(0);

  await pickSlot(page);
  await clickNext(page);

  await expectStep(page, "patient", { current: 2, total: 2 });
  await expect(stepTitle(page, "specialty")).toHaveCount(0);
  await expect(stepTitle(page, "doctor")).toHaveCount(0);
});

test("CA-1: Independiente termina la reserva en «¡Cita reservada!»", async ({
  page,
}) => {
  const scenario = await createSoloScenario("steps-ca1-end");

  await openBooking(page, scenario.clinicId);
  await bookFromDateStep(page);

  await expectStep(page, "success");
});

test("CA-2: Equipo empieza en «Elige un doctor» con un botón por médico y sigue con el horario y los datos", async ({
  page,
}) => {
  const scenario = await createTeamScenario("steps-ca2");

  await openBooking(page, scenario.clinicId);

  await expectStep(page, "doctor", { current: 1, total: 3 });
  await expect(
    page.getByText(`Doctores disponibles para ${scenario.specialty.name}.`, {
      exact: true,
    }),
  ).toBeVisible();
  for (const doctor of scenario.doctors) {
    await expect(optionButton(page, doctor.displayName)).toBeVisible();
  }
  await expect(
    page
      .getByRole("main")
      .getByRole("button")
      .filter({ hasNotText: "Siguiente" }),
  ).toHaveCount(scenario.doctors.length);
  await expect(stepTitle(page, "specialty")).toHaveCount(0);

  await optionButton(page, scenario.doctors[0].displayName).click();
  await clickNext(page);

  await expectStep(page, "datetime", { current: 2, total: 3 });
  await pickSlot(page);
  await clickNext(page);

  await expectStep(page, "patient", { current: 3, total: 3 });
  await expect(stepTitle(page, "specialty")).toHaveCount(0);
});

test("CA-3: Multiespecialidad empieza en la especialidad y salta el paso del médico", async ({
  page,
}) => {
  const scenario = await createMultiSpecialtyScenario("steps-ca3");

  await openBooking(page, scenario.clinicId);

  await expectStep(page, "specialty", { current: 1, total: 3 });
  await expect(
    page.getByText("Elige la especialidad de tu consulta.", { exact: true }),
  ).toBeVisible();
  await optionButton(page, scenario.specialtyA.name).click();
  await clickNext(page);

  await expectStep(page, "datetime", { current: 2, total: 3 });
  await expect(stepTitle(page, "doctor")).toHaveCount(0);
});

test("CA-4: Clínica con la especialidad B (un solo médico) pasa al horario sin elegir médico", async ({
  page,
}) => {
  const scenario = await createClinicScenario("steps-ca4-b");

  await openBooking(page, scenario.clinicId);

  await expectStep(page, "specialty", { current: 1, total: 4 });
  await optionButton(page, scenario.specialtyB.name).click();
  await clickNext(page);

  await expectStep(page, "datetime", { current: 2, total: 3 });
  await expect(stepTitle(page, "doctor")).toHaveCount(0);
  await pickSlot(page);
  await clickNext(page);

  await expectStep(page, "patient", { current: 3, total: 3 });
  await expect(stepTitle(page, "doctor")).toHaveCount(0);
});

test("CA-4: Clínica con la especialidad A (dos médicos) pasa por el médico, el horario y los datos", async ({
  page,
}) => {
  const scenario = await createClinicScenario("steps-ca4-a");

  await openBooking(page, scenario.clinicId);

  await expectStep(page, "specialty", { current: 1, total: 4 });
  await optionButton(page, scenario.specialtyA.name).click();
  await clickNext(page);

  await expectStep(page, "doctor", { current: 2, total: 4 });
  await optionButton(page, scenario.doctorsOfA[0].displayName).click();
  await clickNext(page);

  await expectStep(page, "datetime", { current: 3, total: 4 });
  await pickSlot(page);
  await clickNext(page);

  await expectStep(page, "patient", { current: 4, total: 4 });
});

test("CA-5: Clínica simple cuenta tres pasos porque ninguna especialidad tiene más de un médico", async ({
  page,
}) => {
  const scenario = await createSimpleClinicScenario("steps-ca5");

  await openBooking(page, scenario.clinicId);

  await expectStep(page, "specialty", { current: 1, total: 3 });
  await optionButton(page, scenario.specialtyA.name).click();
  await clickNext(page);

  await expectStep(page, "datetime", { current: 2, total: 3 });
  await expect(stepTitle(page, "doctor")).toHaveCount(0);
  await pickSlot(page);
  await clickNext(page);

  await expectStep(page, "patient", { current: 3, total: 3 });
});

const firstStepOfEachScenario: {
  name: string;
  create: (label: string) => Promise<{ clinicId: string }>;
  firstStep: BookingStepName;
}[] = [
  { name: "Independiente", create: createSoloScenario, firstStep: "datetime" },
  { name: "Equipo", create: createTeamScenario, firstStep: "doctor" },
  {
    name: "Multiespecialidad",
    create: createMultiSpecialtyScenario,
    firstStep: "specialty",
  },
  { name: "Clínica", create: createClinicScenario, firstStep: "specialty" },
  {
    name: "Clínica simple",
    create: createSimpleClinicScenario,
    firstStep: "specialty",
  },
];

for (const { name, create, firstStep } of firstStepOfEachScenario) {
  test(`CA-8: ${name} no tiene «Atrás» en el primer paso`, async ({ page }) => {
    const scenario = await create("steps-ca8");

    await openBooking(page, scenario.clinicId);

    await expectStep(page, firstStep);
    await expect(nextButton(page)).toBeVisible();
    await expect(backButton(page)).toHaveCount(0);
  });
}

test("CA-9: en Independiente «Atrás» vuelve de «Tus datos» al horario, que sigue sin «Atrás»", async ({
  page,
}) => {
  const scenario = await createSoloScenario("steps-ca9-solo");
  await openBooking(page, scenario.clinicId);
  await pickSlot(page);
  await clickNext(page);
  await expectStep(page, "patient");

  await clickBack(page);

  await expectStep(page, "datetime", { current: 1, total: 2 });
  await expect(backButton(page)).toHaveCount(0);
});

test("CA-9: en Multiespecialidad «Atrás» vuelve del horario a la especialidad", async ({
  page,
}) => {
  const scenario = await createMultiSpecialtyScenario("steps-ca9-multi");
  await openBooking(page, scenario.clinicId);
  await optionButton(page, scenario.specialtyA.name).click();
  await clickNext(page);
  await expectStep(page, "datetime");

  await clickBack(page);

  await expectStep(page, "specialty", { current: 1, total: 3 });
  await expect(stepTitle(page, "doctor")).toHaveCount(0);
});

test("CA-9: en Clínica con B «Atrás» vuelve del horario a la especialidad", async ({
  page,
}) => {
  const scenario = await createClinicScenario("steps-ca9-clinic");
  await openBooking(page, scenario.clinicId);
  await optionButton(page, scenario.specialtyB.name).click();
  await clickNext(page);
  await expectStep(page, "datetime", { current: 2, total: 3 });

  await clickBack(page);

  await expectStep(page, "specialty");
  await expect(stepTitle(page, "doctor")).toHaveCount(0);
});

test("CA-9: en Equipo «Atrás» vuelve del horario a «Elige un doctor»", async ({
  page,
}) => {
  const scenario = await createTeamScenario("steps-ca9-team");
  await openBooking(page, scenario.clinicId);
  await optionButton(page, scenario.doctors[1].displayName).click();
  await clickNext(page);
  await expectStep(page, "datetime", { current: 2, total: 3 });

  await clickBack(page);

  await expectStep(page, "doctor", { current: 1, total: 3 });
  await expect(stepTitle(page, "specialty")).toHaveCount(0);
});

test("CA-10: al volver, la especialidad y el médico siguen elegidos y «Siguiente» está habilitado", async ({
  page,
}) => {
  const scenario = await createClinicScenario("steps-ca10-chosen");
  const chosenDoctor = scenario.doctorsOfA[1];
  await openBooking(page, scenario.clinicId);
  await optionButton(page, scenario.specialtyA.name).click();
  await clickNext(page);
  await optionButton(page, chosenDoctor.displayName).click();
  await clickNext(page);
  await expectStep(page, "datetime");

  await clickBack(page);

  await expectStep(page, "doctor");
  await expect(optionButton(page, chosenDoctor.displayName)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(nextButton(page)).toBeEnabled();

  await clickBack(page);

  await expectStep(page, "specialty");
  await expect(optionButton(page, scenario.specialtyA.name)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(optionButton(page, scenario.specialtyB.name)).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(nextButton(page)).toBeEnabled();
});

test("CA-10: al volver de «Tus datos» no queda ningún día ni hora elegidos y «Siguiente» está deshabilitado", async ({
  page,
}) => {
  const scenario = await createSoloScenario("steps-ca10-slot");
  await openBooking(page, scenario.clinicId);
  await pickSlot(page);
  await clickNext(page);
  await expectStep(page, "patient");

  await clickBack(page);

  await expectStep(page, "datetime");
  await expect(
    page.getByRole("button", { name: "Semana anterior" }),
  ).toBeDisabled();
  await expect(chosenOptions(page)).toHaveCount(0);
  await expect(nextButton(page)).toBeDisabled();
});

test("CA-12: cambiar de especialidad borra el médico elegido y la cita queda con B y el médico de B", async ({
  page,
}) => {
  const scenario = await createClinicScenario("steps-ca12");
  await openBooking(page, scenario.clinicId);
  await optionButton(page, scenario.specialtyA.name).click();
  await clickNext(page);
  await optionButton(page, scenario.doctorsOfA[0].displayName).click();
  await clickNext(page);
  await expectStep(page, "datetime", { current: 3, total: 4 });
  await clickBack(page);
  await clickBack(page);
  await expectStep(page, "specialty");

  await optionButton(page, scenario.specialtyB.name).click();
  await clickNext(page);

  await expectStep(page, "datetime", { current: 2, total: 3 });
  await expect(
    pageHeading(page, `Reserva tu cita con ${scenario.doctorOfB.displayName}`),
  ).toBeVisible();

  await bookFromDateStep(page);

  const [appointment] = await readBookedAppointments(scenario.clinicId);
  expect(appointment.specialty).toBe(scenario.specialtyB.name);
  expect(appointment.doctorProfileId).toBe(scenario.doctorOfB.doctorProfileId);
});

test("CA-13: pasar de B a A deja «Elige un doctor» sin ningún médico elegido y con «Siguiente» deshabilitado", async ({
  page,
}) => {
  const scenario = await createClinicScenario("steps-ca13");
  await openBooking(page, scenario.clinicId);
  await optionButton(page, scenario.specialtyB.name).click();
  await clickNext(page);
  await expectStep(page, "datetime");
  await clickBack(page);
  await expectStep(page, "specialty");

  await optionButton(page, scenario.specialtyA.name).click();
  await clickNext(page);

  await expectStep(page, "doctor", { current: 2, total: 4 });
  await expect(chosenOptions(page)).toHaveCount(0);
  await expect(nextButton(page)).toBeDisabled();
});

test("CA-14: en Independiente «Reserva de nuevo» vuelve al horario, sin «Atrás» ni día ni hora elegidos y con la cabecera del médico", async ({
  page,
}) => {
  const scenario = await createSoloScenario("steps-ca14-solo");
  await openBooking(page, scenario.clinicId);
  await bookFromDateStep(page);

  await page.getByRole("button", { name: "Reserva de nuevo" }).click();

  await expectStep(page, "datetime", { current: 1, total: 2 });
  await expect(backButton(page)).toHaveCount(0);
  await expect(chosenOptions(page)).toHaveCount(0);
  await expect(nextButton(page)).toBeDisabled();
  await expect(
    pageHeading(page, `Reserva tu cita con ${scenario.doctor.displayName}`),
  ).toBeVisible();
});

test("CA-14: en Clínica «Reserva de nuevo» vuelve a la especialidad sin ninguna elegida", async ({
  page,
}) => {
  const scenario = await createClinicScenario("steps-ca14-clinic");
  await openBooking(page, scenario.clinicId);
  await optionButton(page, scenario.specialtyB.name).click();
  await clickNext(page);
  await bookFromDateStep(page);

  await page.getByRole("button", { name: "Reserva de nuevo" }).click();

  await expectStep(page, "specialty", { current: 1, total: 4 });
  await expect(chosenOptions(page)).toHaveCount(0);
  await expect(nextButton(page)).toBeDisabled();
  await expect(
    pageHeading(page, `Reserva tu cita en ${scenario.clinicName}`),
  ).toBeVisible();
});

test("CA-15: «Siguiente» y «Atrás» dejan el foco en el título del paso nuevo", async ({
  page,
}) => {
  const scenario = await createClinicScenario("steps-ca15-moves");
  await openBooking(page, scenario.clinicId);
  await optionButton(page, scenario.specialtyA.name).click();

  await clickNext(page);
  await expect(stepTitle(page, "doctor")).toBeFocused();

  await optionButton(page, scenario.doctorsOfA[0].displayName).click();
  await clickNext(page);
  await expect(stepTitle(page, "datetime")).toBeFocused();

  await pickSlot(page);
  await clickNext(page);
  await expect(stepTitle(page, "patient")).toBeFocused();

  await clickBack(page);
  await expect(stepTitle(page, "datetime")).toBeFocused();

  await clickBack(page);
  await expect(stepTitle(page, "doctor")).toBeFocused();

  await clickBack(page);
  await expect(stepTitle(page, "specialty")).toBeFocused();
});

test("CA-15: «Reserva de nuevo» deja el foco en el título del primer paso", async ({
  page,
}) => {
  const scenario = await createSoloScenario("steps-ca15-again");
  await openBooking(page, scenario.clinicId);
  await bookFromDateStep(page);

  await page.getByRole("button", { name: "Reserva de nuevo" }).click();

  await expect(stepTitle(page, "datetime")).toBeFocused();
});
