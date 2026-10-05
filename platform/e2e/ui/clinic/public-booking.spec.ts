import { test, expect } from "../../support/test";
import {
  createClinicResource,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
} from "../../support/accounts";
import { uniqueEmail, uniqueName } from "../../support/users";
import { invitePendingUser } from "../../support/invitations";
import { seedFullDayAvailability } from "../../support/availability";

const DOCTOR_NAME = "Ernesto";
const DOCTOR_LAST_NAME = "Salazar";

/**
 * docs/features/fix-invitation-set-password/plan.md — CA-5 ([e2e]): el
 * booking público sigue funcionando tras quitar `userId` del listado de
 * médicos (`get-clinic-doctors.query.ts`).
 */
test("CA-5: el paciente reserva una cita de punta a punta con un médico invitado", async ({
  page,
}) => {
  const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca5" });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName("ORG-CA5"),
  );
  const clinicId = await createClinicResource(admin, organizationId, {
    name: uniqueName("Sede CA5"),
  });
  const specialtyName = uniqueName("Oftalmología");
  const specialtyId = await createSpecialty(
    admin,
    organizationId,
    specialtyName,
  );

  const doctor = await invitePendingUser(admin, {
    resourceId: clinicId,
    role: "DOCTOR",
    emailPrefix: "doctor-ca5",
    name: DOCTOR_NAME,
    lastName: DOCTOR_LAST_NAME,
    specialtyIds: [specialtyId],
  });
  await seedFullDayAvailability(doctor.userId, clinicId);

  await page.goto(`/clinic/${clinicId}/create-appointment`);

  await page.getByRole("button", { name: specialtyName, exact: true }).click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  await page
    .getByRole("button", { name: `Dr. ${DOCTOR_NAME} ${DOCTOR_LAST_NAME}` })
    .click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  // Siguiente semana: con disponibilidad los 7 días, queda enteramente en el futuro.
  await page.getByRole("button", { name: "Semana siguiente" }).click();
  await page
    .getByRole("button", {
      name: /^(Lu|Ma|Mi|Ju|Vi|Sá|Do)\s*\d{1,2}$/,
      disabled: false,
    })
    .first()
    .click();
  await page
    .getByRole("button", { name: /^\d{2}:\d{2}$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  const patientEmail = uniqueEmail("paciente-ca5");
  await page.getByLabel("Nombre").fill("Camila");
  await page.getByLabel("Apellido").fill("Rivas");
  await page.getByLabel("N° de documento").fill("45678912");
  await page.getByLabel("Fecha de nacimiento").fill("1990-05-20");
  await page.getByLabel("Teléfono").fill("+51988888888");
  await page.getByLabel("Email").fill(patientEmail);

  await page.getByRole("button", { name: "Confirmar reserva" }).click();

  await expect(page.getByText("¡Cita reservada!")).toBeVisible();
  await expect(page.getByText(specialtyName)).toBeVisible();
});
