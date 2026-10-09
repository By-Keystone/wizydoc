import type { Page } from "@playwright/test";
import { expect } from "./test";
import {
  pickSlotInPicker,
  type BookableDoctor,
  type PatientIdentity,
} from "./self-service";

const NATIONAL_PHONE_PREFIX_LENGTH = 3;

export async function completeWizard(
  page: Page,
  seed: Pick<BookableDoctor, "clinicId" | "specialtyName" | "doctorFullName">,
  patient: PatientIdentity,
  when: { date: string; time: string },
): Promise<void> {
  await page.goto(`/clinic/${seed.clinicId}/create-appointment`);

  await page
    .getByRole("button", { name: seed.specialtyName, exact: true })
    .click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  await page
    .getByRole("button", { name: `Dr. ${seed.doctorFullName}` })
    .click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  await pickSlotInPicker(page, when.date, when.time);
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  await page.getByLabel("Nombre").fill(patient.name);
  await page.getByLabel("Apellido").fill(patient.lastName);
  await page.getByLabel("N° de documento").fill(patient.documentNumber);
  await page.getByLabel("Fecha de nacimiento").fill(patient.birthDate);
  await page
    .getByLabel("Teléfono")
    .fill(patient.phone.slice(NATIONAL_PHONE_PREFIX_LENGTH));
  await page.getByLabel("Email").fill(patient.email);

  await page.getByRole("button", { name: "Confirmar reserva" }).click();
}

export async function expectUnavailableLink(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Este enlace ya no está disponible" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Puede que tu cita ya haya pasado o que el enlace esté incompleto",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Reprogramar" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Cancelar cita" })).toHaveCount(
    0,
  );
}
