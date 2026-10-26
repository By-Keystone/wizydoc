import { bookingPath } from "../../support/booking-ui";
import {
  createManagedAppointment,
  createPortalScenario,
} from "../../support/appointment-portal";
import { seedAppointmentNow } from "../../support/doctor-treatment";
import {
  closedHeading,
  createListedClinic,
  openHome,
  setMonthlyBookings,
  setPlan,
} from "../../support/monthly-cap";
import { expect, test } from "../../support/test";

// docs/features/tope-citas-mes/plan.md: CA-31 y CA-32.

const CONSULTORIO_CAP = 150;
const SEEDED_SPECIALTY = "Medicina general";
const SEEDED_PATIENT = "Camila Rivas";

test("CA-31: «Reservar otro horario», en la página de una cita cancelada, lleva al booking, que muestra el mensaje del tope", async ({
  page,
}) => {
  const scenario = await createPortalScenario("closed-ca31");
  await setPlan(scenario.admin.accountId, "CONSULTORIO");
  const managed = await createManagedAppointment(scenario);
  await setMonthlyBookings(scenario.admin.accountId, CONSULTORIO_CAP);
  await page.goto(`/appointment/manage/${managed.token}`);
  await page.getByRole("button", { name: "Cancelar cita" }).click();
  await page.getByRole("radio", { name: "Ya no necesito la cita" }).check();
  await page.getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(
    page.getByRole("heading", { name: "Tu cita está cancelada" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Reservar otro horario" }).click();

  await expect(page).toHaveURL(bookingPath(scenario.clinicId));
  await expect(closedHeading(page)).toBeVisible();
});

test("CA-32: con el tope alcanzado, «Citas de hoy» muestra las citas de hoy y la ficha del paciente su historial", async ({
  page,
}) => {
  const world = await createListedClinic("closed-ca32", {
    plan: "CONSULTORIO",
    booked: CONSULTORIO_CAP,
  });
  await seedAppointmentNow(world);

  await openHome(page, world);

  await expect(
    page.getByRole("heading", { name: "Citas de hoy" }),
  ).toBeVisible();
  await expect(page.getByText(SEEDED_PATIENT)).toBeVisible();

  await page.goto(
    `/account/${world.accountId}/clinic/${world.clinicId}/patients`,
  );
  await page.getByRole("link", { name: SEEDED_PATIENT }).click();

  await expect(
    page.getByRole("heading", { name: SEEDED_PATIENT }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Historial de citas" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Citas totales")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: SEEDED_SPECIALTY }),
  ).toBeVisible();
});
