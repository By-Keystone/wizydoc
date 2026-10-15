import type { Page } from "@playwright/test";
import {
  createClinicDoctor,
  type ClinicDoctor,
} from "../../support/availability";
import { getTestPrisma } from "../../support/db";
import { PLATFORM_BASE_URL } from "../../support/env";
import { expect, test } from "../../support/test";
import { loginViaUi } from "../../support/ui";

const PLAN_NOTICE = "Tu plan no permite hacer uso de esta función";
const GENERIC_ERROR = "Algo salió mal";
const UPGRADE_BUTTON = "Mejorar mi plan";

async function createDoctorOnPlan(
  label: string,
  plan: "FREE" | "CLINICA",
): Promise<ClinicDoctor> {
  const doctor = await createClinicDoctor(label);
  const prisma = await getTestPrisma();
  await prisma.subscription.update({
    where: { accountId: doctor.accountId },
    data: { plan, status: "ACTIVE" },
  });
  return doctor;
}

async function signIn(page: Page, doctor: ClinicDoctor) {
  await loginViaUi(
    page,
    doctor.email,
    new RegExp(`/account/${doctor.accountId}/select$`),
  );
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
}

function clinicPath(doctor: ClinicDoctor, section: string) {
  return `/account/${doctor.accountId}/clinic/${doctor.clinicId}/${section}`;
}

test("en un plan sin la función, pacientes y métricas muestran el aviso del plan y no el error genérico", async ({
  page,
}) => {
  const doctor = await createDoctorOnPlan("plan-notice-free", "FREE");
  await signIn(page, doctor);

  await page.goto(clinicPath(doctor, "patients"));
  await expect(page.getByRole("heading", { name: "Pacientes" })).toBeVisible();
  await expect(page.getByText(PLAN_NOTICE)).toBeVisible();
  await expect(
    page.getByRole("button", { name: UPGRADE_BUTTON }),
  ).toBeVisible();
  await expect(page.getByText(GENERIC_ERROR)).toHaveCount(0);

  await page.goto(clinicPath(doctor, "dashboard"));
  await expect(page.getByText(PLAN_NOTICE)).toBeVisible();
  await expect(
    page.getByRole("button", { name: UPGRADE_BUTTON }),
  ).toBeVisible();
  await expect(page.getByText(GENERIC_ERROR)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Citas de hoy" }),
  ).toBeVisible();
});

test("en un plan que incluye la función, pacientes y métricas siguen funcionando", async ({
  page,
}) => {
  const doctor = await createDoctorOnPlan("plan-notice-clinica", "CLINICA");
  await signIn(page, doctor);

  await page.goto(clinicPath(doctor, "patients"));
  await expect(page.getByRole("heading", { name: "Pacientes" })).toBeVisible();
  await expect(page.getByText(PLAN_NOTICE)).toHaveCount(0);
  await expect(page.getByRole("button", { name: UPGRADE_BUTTON })).toHaveCount(
    0,
  );
  await expect(page.getByText(GENERIC_ERROR)).toHaveCount(0);

  await page.goto(clinicPath(doctor, "dashboard"));
  await expect(page.getByText("Citas de hoy").first()).toBeVisible();
  await expect(page.getByText(PLAN_NOTICE)).toHaveCount(0);
  await expect(page.getByRole("button", { name: UPGRADE_BUTTON })).toHaveCount(
    0,
  );
  await expect(page.getByText(GENERIC_ERROR)).toHaveCount(0);
});
