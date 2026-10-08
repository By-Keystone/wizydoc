import type { Page } from "@playwright/test";
import { test, expect } from "../../support/test";
import {
  type AvailabilityBlock,
  type ClinicDoctor,
  MAX_AVAILABILITY_BLOCKS,
  createClinicDoctor,
  nonOverlappingBlocks,
} from "../../support/availability";
import { getTestPrisma } from "../../support/db";
import { PLATFORM_BASE_URL } from "../../support/env";
import { loginViaUi } from "../../support/ui";

const SAVED_TOAST = "Disponibilidad guardada correctamente";
const START_AFTER_END_ERROR =
  "La hora de inicio debe ser anterior a la hora de fin";
const EMPTY_TIME_ERROR = "Ingresa la hora de inicio y de fin";
const SUNDAY = 0;
const MONDAY = 1;

type Block = AvailabilityBlock;
type Doctor = ClinicDoctor;

async function seedAvailability(doctor: Doctor, blocks: Block[]) {
  const prisma = await getTestPrisma();
  await prisma.availability.createMany({
    data: blocks.map((block) => ({
      doctorProfileId: doctor.doctorProfileId,
      ...block,
    })),
  });
}

async function openAvailability(page: Page, doctor: Doctor) {
  await loginViaUi(
    page,
    doctor.email,
    new RegExp(`/account/${doctor.accountId}/select$`),
  );
  // Las cookies resource_id/resource_type imitan "Entrar" en /select.
  await page.context().addCookies([
    {
      name: "resource_id",
      value: doctor.clinicId,
      url: PLATFORM_BASE_URL,
      sameSite: "Lax",
    },
    {
      name: "resource_type",
      value: "CLINIC",
      url: PLATFORM_BASE_URL,
      sameSite: "Lax",
    },
  ]);
  await page.goto(
    `/account/${doctor.accountId}/clinic/${doctor.clinicId}/profile/availability`,
  );
  await expect(
    page.getByRole("heading", { name: "Mi Disponibilidad" }),
  ).toBeVisible();
}

async function openAsNewDoctor(page: Page, blocks: Block[] = []) {
  const doctor = await createClinicDoctor("avail-ui");
  if (blocks.length) await seedAvailability(doctor, blocks);
  await openAvailability(page, doctor);
}

async function addMondayRange(page: Page) {
  await page.getByRole("button", { name: "Agregar rango" }).first().click();
}

async function setRange(page: Page, row: number, start: string, end: string) {
  await page.getByLabel("Hora de inicio").nth(row).fill(start);
  await page.getByLabel("Hora de fin").nth(row).fill(end);
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Guardar disponibilidad" }).click();
}

function editorAlerts(page: Page) {
  return page.getByRole("main").getByRole("alert");
}

test("un horario válido se guarda", async ({ page }) => {
  await openAsNewDoctor(page);

  await addMondayRange(page);
  await save(page);

  await expect(page.getByText(SAVED_TOAST)).toBeVisible();
});

test("antes del primer intento de guardar no se muestra ningún error", async ({
  page,
}) => {
  await openAsNewDoctor(page);

  await addMondayRange(page);
  await setRange(page, 0, "18:00", "09:00");

  await expect(editorAlerts(page)).toHaveCount(0);
});

test("un rango con inicio posterior al fin marca su fila, no se envía y el error desaparece al corregir", async ({
  page,
}) => {
  await openAsNewDoctor(page);

  await addMondayRange(page);
  await setRange(page, 0, "18:00", "09:00");
  await save(page);

  await expect(editorAlerts(page)).toHaveText(START_AFTER_END_ERROR);
  await expect(page.getByLabel("Hora de inicio")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByText(SAVED_TOAST)).toHaveCount(0);

  await page.getByLabel("Hora de fin").fill("19:00");
  await expect(editorAlerts(page)).toHaveCount(0);

  await save(page);
  await expect(page.getByText(SAVED_TOAST)).toBeVisible();
});

test("una hora vacía marca su fila y no se envía", async ({ page }) => {
  await openAsNewDoctor(page);

  await addMondayRange(page);
  await page.getByLabel("Hora de inicio").fill("");
  await save(page);

  await expect(editorAlerts(page)).toHaveText(EMPTY_TIME_ERROR);
  await expect(page.getByText(SAVED_TOAST)).toHaveCount(0);
});

test("dos rangos solapados el mismo día marcan sólo la fila que se solapa", async ({
  page,
}) => {
  await openAsNewDoctor(page);

  await addMondayRange(page);
  await addMondayRange(page);
  await setRange(page, 0, "09:00", "17:00");
  await setRange(page, 1, "16:00", "18:00");
  await save(page);

  await expect(editorAlerts(page)).toHaveText(
    "Se solapa con el rango 09:00 - 17:00",
  );
  await expect(page.getByLabel("Hora de inicio").nth(0)).toHaveAttribute(
    "aria-invalid",
    "false",
  );
  await expect(page.getByLabel("Hora de inicio").nth(1)).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByText(SAVED_TOAST)).toHaveCount(0);

  await page.getByRole("button", { name: "Eliminar rango" }).nth(1).click();
  await expect(editorAlerts(page)).toHaveCount(0);
});

test("dos rangos contiguos el mismo día se guardan", async ({ page }) => {
  await openAsNewDoctor(page);

  await addMondayRange(page);
  await addMondayRange(page);
  await setRange(page, 0, "09:00", "12:00");
  await setRange(page, 1, "12:00", "15:00");
  await save(page);

  await expect(editorAlerts(page)).toHaveCount(0);
  await expect(page.getByText(SAVED_TOAST)).toBeVisible();
});

test("más de 70 rangos muestra el mensaje sobre el botón y no se envía", async ({
  page,
}) => {
  await openAsNewDoctor(
    page,
    nonOverlappingBlocks(MAX_AVAILABILITY_BLOCKS + 1),
  );

  await expect(editorAlerts(page)).toHaveCount(0);
  await save(page);

  await expect(editorAlerts(page)).toHaveText(
    `No puedes registrar más de ${MAX_AVAILABILITY_BLOCKS} rangos de disponibilidad`,
  );
  await expect(page.getByText(SAVED_TOAST)).toHaveCount(0);

  await page.getByRole("button", { name: "Eliminar rango" }).first().click();
  await expect(editorAlerts(page)).toHaveCount(0);
  await save(page);
  await expect(page.getByText(SAVED_TOAST)).toBeVisible();
});

test("un horario guardado e inválido se marca al guardar y se puede corregir eliminando las filas", async ({
  page,
}) => {
  await openAsNewDoctor(page, [
    { dayOfWeek: SUNDAY, startTime: "22:00", endTime: "02:00" },
    { dayOfWeek: MONDAY, startTime: "09:00", endTime: "12:00" },
    { dayOfWeek: MONDAY, startTime: "09:00", endTime: "12:00" },
  ]);

  await expect(editorAlerts(page)).toHaveCount(0);

  await save(page);

  await expect(editorAlerts(page)).toHaveCount(2);
  await expect(page.getByText(START_AFTER_END_ERROR)).toBeVisible();
  await expect(
    page.getByText("Se solapa con el rango 09:00 - 12:00"),
  ).toBeVisible();
  await expect(page.getByText(SAVED_TOAST)).toHaveCount(0);

  await page
    .getByRole("button", { name: "Eliminar rango del domingo" })
    .click();
  await page
    .getByRole("button", { name: "Eliminar rango del lunes" })
    .first()
    .click();
  await expect(editorAlerts(page)).toHaveCount(0);

  await save(page);
  await expect(page.getByText(SAVED_TOAST)).toBeVisible();
});
