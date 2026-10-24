import type { Locator, Page } from "@playwright/test";
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
const OLD_UPGRADE_BUTTON = "Mejorar mi plan";
const PATIENTS_PLAN_LINK = "Pedir el plan Consultorio";
const METRICS_PLAN_LINK = "Pedir el plan Clínica";
const ANY_PLAN_LINK = /^Pedir el plan /;
const WHATSAPP_ORIGIN = "https://wa.me";
const WHATSAPP_PATH = "/51993953674";
const DOCTOR_NAME = "Valeria";
const DOCTOR_LAST_NAME = "Montes";

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
  await prisma.user.update({
    where: { email: doctor.email },
    data: { name: DOCTOR_NAME, lastName: DOCTOR_LAST_NAME },
  });
  return doctor;
}

function expectedRequestMessage(doctor: ClinicDoctor, planName: string) {
  return `Hola, soy ${DOCTOR_NAME} ${DOCTOR_LAST_NAME} (${doctor.email}), de ${doctor.clinicName}. Quiero activar el plan ${planName} en WizyDoc.`;
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

async function expectWhatsAppRequest(link: Locator, expectedMessage: string) {
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);

  const href = new URL((await link.getAttribute("href")) ?? "");
  expect(href.origin).toBe(WHATSAPP_ORIGIN);
  expect(href.pathname).toBe(WHATSAPP_PATH);
  expect(href.searchParams.get("text")).toBe(expectedMessage);
}

test("en un plan sin la función, pacientes y métricas ofrecen pedir el plan por WhatsApp y no muestran el error genérico", async ({
  page,
}) => {
  const doctor = await createDoctorOnPlan("plan-notice-free", "FREE");
  await signIn(page, doctor);

  await page.goto(clinicPath(doctor, "patients"));
  await expect(page.getByRole("heading", { name: "Pacientes" })).toBeVisible();
  await expect(page.getByText(PLAN_NOTICE)).toBeVisible();
  await expect(
    page.getByText(/Está incluida desde el plan Consultorio/),
  ).toBeVisible();
  await expectWhatsAppRequest(
    page.getByRole("link", { name: PATIENTS_PLAN_LINK, exact: true }),
    expectedRequestMessage(doctor, "Consultorio"),
  );
  await expect(page.getByRole("link", { name: ANY_PLAN_LINK })).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: OLD_UPGRADE_BUTTON }),
  ).toHaveCount(0);
  await expect(page.getByText(GENERIC_ERROR)).toHaveCount(0);

  await page.goto(clinicPath(doctor, "dashboard"));
  await expect(page.getByText(PLAN_NOTICE)).toBeVisible();
  await expect(
    page.getByText(/Está incluida desde el plan Clínica/),
  ).toBeVisible();
  await expectWhatsAppRequest(
    page.getByRole("link", { name: METRICS_PLAN_LINK, exact: true }),
    expectedRequestMessage(doctor, "Clínica"),
  );
  await expect(page.getByRole("link", { name: ANY_PLAN_LINK })).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: OLD_UPGRADE_BUTTON }),
  ).toHaveCount(0);
  await expect(page.getByText(GENERIC_ERROR)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Citas de hoy" }),
  ).toBeVisible();
});

test("en un plan que incluye la función, pacientes y métricas siguen funcionando sin ofrecer pedir el plan", async ({
  page,
}) => {
  const doctor = await createDoctorOnPlan("plan-notice-clinica", "CLINICA");
  await signIn(page, doctor);

  await page.goto(clinicPath(doctor, "patients"));
  await expect(page.getByRole("heading", { name: "Pacientes" })).toBeVisible();
  await expect(page.getByText(PLAN_NOTICE)).toHaveCount(0);
  await expect(page.getByRole("link", { name: ANY_PLAN_LINK })).toHaveCount(0);
  await expect(page.getByText(GENERIC_ERROR)).toHaveCount(0);

  await page.goto(clinicPath(doctor, "dashboard"));
  await expect(page.getByText("Citas de hoy").first()).toBeVisible();
  await expect(page.getByText(PLAN_NOTICE)).toHaveCount(0);
  await expect(page.getByRole("link", { name: ANY_PLAN_LINK })).toHaveCount(0);
  await expect(page.getByText(GENERIC_ERROR)).toHaveCount(0);
});
