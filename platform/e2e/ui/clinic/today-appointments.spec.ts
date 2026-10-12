import { randomUUID } from "node:crypto";
import { createClinicDoctor } from "../../support/availability";
import { getTestPrisma } from "../../support/db";
import { PLATFORM_BASE_URL } from "../../support/env";
import { expect, test } from "../../support/test";
import { loginViaUi } from "../../support/ui";

const PATIENT_NAME = "Camila";
const PATIENT_LAST_NAME = "Rivas";
const PATIENT_PHONE = "+51911111111";

test("la agenda del día muestra nombre, apellido y teléfono del paciente", async ({
  page,
}) => {
  const doctor = await createClinicDoctor("today-agenda");
  const prisma = await getTestPrisma();
  await prisma.subscription.update({
    where: { accountId: doctor.accountId },
    data: { plan: "CLINICA", status: "ACTIVE" },
  });
  const patient = await prisma.patient.create({
    data: {
      name: PATIENT_NAME,
      lastName: PATIENT_LAST_NAME,
      email: `camila-${randomUUID()}@example.com`,
      phone: PATIENT_PHONE,
      documentNumber: randomUUID().slice(0, 8),
      documentType: "DNI",
      accountId: doctor.accountId,
    },
  });
  await prisma.appointment.create({
    data: {
      doctorProfileId: doctor.doctorProfileId,
      clinicId: doctor.clinicId,
      patientId: patient.id,
      scheduledAt: new Date(),
      durationMinutes: 30,
      specialty: "Medicina general",
    },
  });

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
  await page.goto(
    `/account/${doctor.accountId}/clinic/${doctor.clinicId}/dashboard`,
  );

  await expect(
    page.getByText(`${PATIENT_NAME} ${PATIENT_LAST_NAME}`),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: PATIENT_PHONE })).toHaveAttribute(
    "href",
    `tel:${PATIENT_PHONE}`,
  );
});
