import {
  createManagedAppointment,
  createPortalScenario,
} from "../../support/appointment-portal";
import { setDoctorTreatment } from "../../support/doctor-treatment";
import { expect, test } from "../../support/test";

// docs/features/perfil-usuario/plan.md — PR 1, CA-8.

test.use({ viewport: { width: 375, height: 812 } });

test("CA-8: la página de autogestión muestra «Dra. …» en el resumen y en «con {médico}»", async ({
  page,
}) => {
  const scenario = await createPortalScenario("treat-portal-page");
  await setDoctorTreatment(scenario.doctor.userId, "DRA");
  const managed = await createManagedAppointment(scenario);
  const doctorName = `Dra. ${scenario.doctor.name} ${scenario.doctor.lastName}`;

  await page.goto(`/appointment/manage/${managed.token}`);

  await expect(page.getByText(doctorName, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Reprogramar" }).click();
  await expect(
    page.getByText(`con ${doctorName}`, { exact: false }).first(),
  ).toBeVisible();
});
