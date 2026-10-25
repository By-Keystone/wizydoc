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
const SPANISH_MONTH = new Intl.DateTimeFormat("es-PE", { month: "long" });

function nextMonday(): Date {
  const today = new Date();
  const daysUntilNextMonday = (8 - today.getDay()) % 7 || 7;
  return new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + daysUntilNextMonday,
  );
}

// fix-invitation-set-password CA-5 y booking-cabecera-y-pasos CA-1: el booking arranca en el horario y funciona sin `userId` en el listado de médicos.
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

  await expect(
    page.getByRole("heading", { name: "Elige fecha y horario" }),
  ).toBeVisible();

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
  await page.getByLabel("Teléfono").fill("988888888");
  await page.getByLabel("Email").fill(patientEmail);

  await page.getByRole("button", { name: "Confirmar reserva" }).click();

  await expect(page.getByText("¡Cita reservada!")).toBeVisible();
  await expect(page.getByText(specialtyName)).toBeVisible();
});

test("el paso de éxito muestra la sede, su dirección y la fecha legible", async ({
  page,
}) => {
  const admin = await createOnboardedAdmin({ emailPrefix: "admin-success" });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName("ORG-success"),
  );
  const clinicName = uniqueName("Sede Miraflores");
  const clinicAddress = "Av. Larco 345, Miraflores";
  const clinicId = await createClinicResource(admin, organizationId, {
    name: clinicName,
    address: clinicAddress,
  });
  const specialtyName = uniqueName("Cardiología");
  const specialtyId = await createSpecialty(
    admin,
    organizationId,
    specialtyName,
  );
  const doctor = await invitePendingUser(admin, {
    resourceId: clinicId,
    role: "DOCTOR",
    emailPrefix: "doctor-success",
    name: DOCTOR_NAME,
    lastName: DOCTOR_LAST_NAME,
    specialtyIds: [specialtyId],
  });
  await seedFullDayAvailability(doctor.userId, clinicId);

  await page.goto(`/clinic/${clinicId}/create-appointment`);
  await expect(
    page.getByRole("heading", { name: "Elige fecha y horario" }),
  ).toBeVisible();

  const monday = nextMonday();
  await page.getByRole("button", { name: "Semana siguiente" }).click();
  await page
    .getByRole("button", { name: new RegExp(`^Lu\\s*${monday.getDate()}$`) })
    .click();
  const firstSlot = page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first();
  const time = (await firstSlot.innerText()).trim();
  await firstSlot.click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  const readableWhen = `Lunes ${monday.getDate()} de ${SPANISH_MONTH.format(monday).toLowerCase()}, ${time}`;
  const isoDate = /\d{4}-\d{2}-\d{2}/;
  await expect(page.getByText(readableWhen, { exact: true })).toBeVisible();

  await page.getByLabel("Nombre").fill("Camila");
  await page.getByLabel("Apellido").fill("Rivas");
  await page.getByLabel("N° de documento").fill("45678914");
  await page.getByLabel("Fecha de nacimiento").fill("1990-05-20");
  await page.getByLabel("Teléfono").fill("988888888");
  await page.getByLabel("Email").fill(uniqueEmail("paciente-success"));
  await page.getByRole("button", { name: "Confirmar reserva" }).click();

  await expect(page.getByText("¡Cita reservada!")).toBeVisible();
  await expect(page.getByText(readableWhen)).toBeVisible();
  await expect(page.getByText(isoDate)).toHaveCount(0);
  await expect(page.getByText(clinicName, { exact: true })).toBeVisible();
  await expect(page.getByText(clinicAddress, { exact: true })).toBeVisible();
  await expect(
    page.getByText("Te enviamos la confirmación a tu correo."),
  ).toBeVisible();
});
