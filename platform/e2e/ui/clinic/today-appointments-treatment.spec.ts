import { randomUUID } from "node:crypto";
import {
  createClinicResource,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
} from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import {
  setDoctorTreatment,
  type Treatment,
} from "../../support/doctor-treatment";
import { PLATFORM_BASE_URL } from "../../support/env";
import { expect, test } from "../../support/test";
import { uniqueName } from "../../support/users";
import { loginViaUi } from "../../support/ui";

// docs/features/perfil-usuario/plan.md — PR 2, CA-21 y CA-22.

async function openDashboardOfDoctorWithAppointment(
  page: import("@playwright/test").Page,
  treatment: Treatment,
) {
  const admin = await createOnboardedAdmin({
    emailPrefix: "admin-treat-today",
  });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName("ORG-treat-today"),
  );
  const clinicId = await createClinicResource(admin, organizationId, {
    name: uniqueName("Sede treat today"),
  });
  const doctor = await createMemberWithRole({
    accountId: admin.accountId,
    resourceId: clinicId,
    role: "DOCTOR",
    createdBy: admin.userId,
    emailPrefix: "doctor-treat-today",
  });
  await setDoctorTreatment(doctor.userId, treatment);

  const prisma = await getTestPrisma();
  const profile = await prisma.doctorProfile.create({
    data: { membershipId: doctor.membershipId },
  });
  const patient = await prisma.patient.create({
    data: {
      name: "Camila",
      lastName: "Rivas",
      email: `camila-${randomUUID()}@example.com`,
      phone: "+51911111111",
      documentNumber: randomUUID().slice(0, 8),
      documentType: "DNI",
      accountId: admin.accountId,
    },
  });
  await prisma.appointment.create({
    data: {
      doctorProfileId: profile.id,
      clinicId,
      patientId: patient.id,
      scheduledAt: new Date(),
      durationMinutes: 30,
      specialty: "Medicina general",
    },
  });

  await loginViaUi(
    page,
    doctor.email,
    new RegExp(`/account/${admin.accountId}/select$`),
  );
  await page.context().addCookies([
    {
      name: "resource_id",
      value: clinicId,
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
  await page.goto(`/account/${admin.accountId}/clinic/${clinicId}/dashboard`);

  return `${doctor.name} ${doctor.lastName}`;
}

test("CA-21 y CA-22: «Citas de hoy» nombra a la médica con «Dra.» y el saludo usa su nombre sin tratamiento", async ({
  page,
}) => {
  const fullName = await openDashboardOfDoctorWithAppointment(page, "DRA");

  await expect(
    page.getByText(`· Dra. ${fullName}`, { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: `Hola, ${fullName}` }),
  ).toBeVisible();
  await expect(page.getByText("Hola, Dra.")).toHaveCount(0);
});

test("CA-21: «Citas de hoy» muestra el nombre completo sin «Dr.» ni «Dra.» si no hay tratamiento", async ({
  page,
}) => {
  const fullName = await openDashboardOfDoctorWithAppointment(page, null);

  await expect(page.getByText(`· ${fullName}`, { exact: false })).toBeVisible();
  await expect(page.getByText(/· Dra?\./)).toHaveCount(0);
});
