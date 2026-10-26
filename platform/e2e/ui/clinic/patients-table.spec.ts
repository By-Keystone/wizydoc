import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import {
  addDoctor,
  createProfileWorld,
  findDoctorProfileId,
  type ProfileWorld,
} from "../../support/profile";
import {
  PATIENT_PHONE,
  enablePatientRecords,
  seedPatientWithAppointment,
} from "../../support/patients";
import { expect, test } from "../../support/test";
import { clinicDashboardUrl, loginViaUi } from "../../support/ui";

const MOBILE = { width: 375, height: 812 };
const LAST_COLUMN = "Estado";

async function createClinicWithPatient() {
  const world = await createProfileWorld("patients-table");
  const doctor = await addDoctor(world, { label: "patients-table-doc" });
  await enablePatientRecords(world.admin.accountId);
  const doctorProfileId = (await findDoctorProfileId(
    doctor.userId,
    world.clinicId,
  )) as string;
  const patient = await seedPatientWithAppointment({
    accountId: world.admin.accountId,
    clinicId: world.clinicId,
    doctorProfileId,
  });

  return { world, doctorProfileId, patient };
}

async function signInAndOpenPatients(page: Page, world: ProfileWorld) {
  const { accountId } = world.admin;
  await loginViaUi(page, world.admin.email, clinicDashboardUrl(accountId));
  await page.goto(`/account/${accountId}/clinic/${world.clinicId}/patients`);
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

test("a 375 px la tabla de pacientes se desplaza en horizontal y su última columna es alcanzable", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  const { world } = await createClinicWithPatient();
  await signInAndOpenPatients(page, world);

  const lastHeader = page.getByRole("columnheader", { name: LAST_COLUMN });
  await expect(lastHeader).toBeAttached();
  const rightEdge = async () => {
    const box = await lastHeader.boundingBox();
    return box ? box.x + box.width : 0;
  };
  expect(await rightEdge()).toBeGreaterThan(MOBILE.width);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.getByRole("table").hover();
  await page.mouse.wheel(MOBILE.width, 0);

  await expect.poll(rightEdge).toBeLessThanOrEqual(MOBILE.width);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test("el teléfono de la tabla de pacientes es un enlace tel:", async ({
  page,
}) => {
  const { world } = await createClinicWithPatient();
  await signInAndOpenPatients(page, world);

  await expect(page.getByRole("link", { name: PATIENT_PHONE })).toHaveAttribute(
    "href",
    `tel:${PATIENT_PHONE}`,
  );
});

test("«Reintentar» de una ficha que falló vuelve a pedir los datos al servidor", async ({
  page,
}) => {
  const { world, doctorProfileId } = await createClinicWithPatient();
  const { accountId } = world.admin;
  const patientId = randomUUID();
  await loginViaUi(page, world.admin.email, clinicDashboardUrl(accountId));

  await page.goto(
    `/account/${accountId}/clinic/${world.clinicId}/patients/${patientId}`,
  );
  await expect(
    page.getByRole("heading", { name: "Algo salió mal" }),
  ).toBeVisible();

  const patient = await seedPatientWithAppointment({
    accountId,
    clinicId: world.clinicId,
    doctorProfileId,
    patientId,
  });
  await page.getByRole("button", { name: "Reintentar" }).click();

  await expect(
    page.getByRole("heading", { name: patient.fullName }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Algo salió mal" }),
  ).toHaveCount(0);
});
