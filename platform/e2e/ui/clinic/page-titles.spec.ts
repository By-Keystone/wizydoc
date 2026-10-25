import {
  addDoctor,
  createProfileWorld,
  findDoctorProfileId,
} from "../../support/profile";
import {
  enablePatientRecords,
  seedPatientWithAppointment,
} from "../../support/patients";
import { expect, test } from "../../support/test";
import { clinicDashboardUrl, loginViaUi } from "../../support/ui";

test("el título de pestaña lleva la sección y «WizyDoc», y el de la ficha no lleva el nombre del paciente", async ({
  page,
}) => {
  const world = await createProfileWorld("titles-patients");
  const { accountId } = world.admin;
  const doctor = await addDoctor(world, { label: "titles-patients-doc" });
  await enablePatientRecords(accountId);
  const patient = await seedPatientWithAppointment({
    accountId,
    clinicId: world.clinicId,
    doctorProfileId: (await findDoctorProfileId(
      doctor.userId,
      world.clinicId,
    )) as string,
  });

  await loginViaUi(page, world.admin.email, clinicDashboardUrl(accountId));
  await expect(page).toHaveTitle("Inicio · WizyDoc");

  await page
    .getByRole("link", { name: "Pacientes", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Pacientes", level: 1 }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Pacientes · WizyDoc");

  await page.getByRole("link", { name: patient.fullName }).click();
  await expect(
    page.getByRole("heading", { name: patient.fullName }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Ficha del paciente · WizyDoc");
  expect(await page.title()).not.toContain(patient.name);
  expect(await page.title()).not.toContain(patient.lastName);
});

test("«Mi perfil» y la lista de sedes también llevan «· WizyDoc» en el título", async ({
  page,
}) => {
  const world = await createProfileWorld("titles-profile");
  const { accountId } = world.admin;
  await loginViaUi(page, world.admin.email, clinicDashboardUrl(accountId));

  await page.goto(`/account/${accountId}/clinic/${world.clinicId}/me`);
  await expect(page).toHaveTitle("Mi perfil · WizyDoc");

  await page.goto(`/account/${accountId}/select?switch=1`);
  await expect(page).toHaveTitle("Elige dónde entrar · WizyDoc");
});
