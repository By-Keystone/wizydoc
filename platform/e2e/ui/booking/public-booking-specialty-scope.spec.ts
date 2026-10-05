import { test, expect } from "../../support/test";
import {
  createClinicResource,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  inviteUserViaApi,
} from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { uniqueEmail, uniqueName } from "../../support/users";

/** docs/features/fix-specialty-account-scope/plan.md — CA-26. */

// iPhone 12-ish: el booking público es mobile-first (docs/PRODUCT.md).
const MOBILE_VIEWPORT = { width: 390, height: 844 };

const WEEKDAY_BUTTON_NAME = /^(Lu|Ma|Mi|Ju|Vi|Sá|Do)\s*\d{1,2}$/;
const TIME_SLOT_BUTTON_NAME = /^\d{2}:\d{2}$/;

/** El editor de disponibilidad no es parte de este ticket: se siembra por Prisma para poder reservar. */
async function seedFullWeekAvailability(
  doctorProfileId: string,
): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.availability.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      doctorProfileId,
      dayOfWeek,
      startTime: "00:00",
      endTime: "23:30",
    })),
  });
}

test("CA-26: desde el celular, el paciente ve los médicos y especialidades de la sede y completa una reserva", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);

  const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca26" });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName("ORG-CA26"),
  );
  const clinicId = await createClinicResource(admin, organizationId, {
    name: uniqueName("Sede-CA26"),
  });
  const specialtyName = uniqueName("Cardiología CA-26");
  const specialtyId = await createSpecialty(
    admin,
    organizationId,
    specialtyName,
  );

  await inviteUserViaApi(admin, {
    email: uniqueEmail("doctora-ca26"),
    name: "Daniela",
    lastName: "Flores",
    phone: "+51955555556",
    role: "DOCTOR",
    resourceId: clinicId,
    specialtyIds: [specialtyId],
  });

  const prisma = await getTestPrisma();
  const doctorProfile = await prisma.doctorProfile.findFirst({
    where: { clinicId },
  });
  if (!doctorProfile)
    throw new Error("No se encontró el perfil del médico recién invitado");
  await seedFullWeekAvailability(doctorProfile.id);

  // Especialidad de otra organización: el booking de esta sede no debe mostrarla.
  const otherAdmin = await createOnboardedAdmin({
    emailPrefix: "admin-ajeno-ca26",
  });
  const otherOrganizationId = await createOrganizationResource(
    otherAdmin,
    uniqueName("ORG-AJENA-CA26"),
  );
  const foreignSpecialtyName = uniqueName("Especialidad ajena CA-26");
  await createSpecialty(otherAdmin, otherOrganizationId, foreignSpecialtyName);

  await page.goto(`/clinic/${clinicId}/create-appointment`);

  await expect(
    page.getByRole("heading", { name: "¿Qué especialidad necesitas?" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: specialtyName })).toBeVisible();
  await expect(page.getByText(foreignSpecialtyName)).toHaveCount(0);

  await page.getByRole("button", { name: specialtyName }).click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  const doctorButtonName = "Dr. Daniela Flores";
  await expect(
    page.getByRole("button", { name: doctorButtonName }),
  ).toBeVisible();
  await page.getByRole("button", { name: doctorButtonName }).click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  // La semana siguiente queda enteramente en el futuro: no depende de a qué hora corra la prueba.
  await page.getByRole("button", { name: "Semana siguiente" }).click();
  await page.getByRole("button", { name: WEEKDAY_BUTTON_NAME }).first().click();
  await page
    .getByRole("button", { name: TIME_SLOT_BUTTON_NAME })
    .first()
    .click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  await page.getByLabel("Nombre").fill("Patricia");
  await page.getByLabel("Apellido").fill("Paciente");
  await page.getByLabel("N° de documento").fill("45678912");
  await page.getByLabel("Fecha de nacimiento").fill("1990-05-15");
  await page.getByLabel("Teléfono").fill("+51988888888");
  await page.getByLabel("Email").fill(uniqueEmail("paciente-ca26"));

  await page.getByRole("button", { name: "Confirmar reserva" }).click();

  await expect(page.getByText("¡Cita reservada!")).toBeVisible();
});
