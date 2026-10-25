import { createSpecialty } from "../../support/accounts";
import {
  addPortalDoctor,
  createPortalScenario,
} from "../../support/appointment-portal";
import {
  chooseSlotAndGoToPatientStep,
  expectStep,
  MOBILE_VIEWPORT,
  openBooking,
  pageHeading,
} from "../../support/booking-ui";
import { getTestPrisma } from "../../support/db";
import { expect, test } from "../../support/test";
import { uniqueName } from "../../support/users";

// doctor-profile-specialties CA-6 y booking-cabecera-y-pasos CA-6.

test.use({ viewport: MOBILE_VIEWPORT });

test("CA-6: un médico sin horarios no cuenta para los pasos y ni él ni su especialidad exclusiva aparecen", async ({
  page,
}) => {
  const scenario = await createPortalScenario("sched-ui-ca6");
  const hiddenName = uniqueName("Solo-sin-horarios");
  const hiddenId = await createSpecialty(
    scenario.admin,
    scenario.organizationId,
    hiddenName,
  );
  const unscheduledLastName = uniqueName("SinHorarios");
  const unscheduled = await addPortalDoctor({
    label: "sched-ui-ca6-sin",
    clinicId: scenario.clinicId,
    admin: scenario.admin,
    specialtyId: scenario.specialtyId,
    availability: "none",
    name: "Sofía",
    lastName: unscheduledLastName,
  });
  const prisma = await getTestPrisma();
  await prisma.doctorProfile.update({
    where: { id: unscheduled.doctorProfileId },
    data: { specialties: { connect: [{ id: hiddenId }] } },
  });
  const scheduledName = `${scenario.doctor.name} ${scenario.doctor.lastName}`;
  const body = page.locator("body");

  await openBooking(page, scenario.clinicId);

  await expectStep(page, "datetime", { current: 1, total: 2 });
  await expect(
    pageHeading(page, `Reserva tu cita con ${scheduledName}`),
  ).toBeVisible();
  await expect(page.getByText(scenario.specialtyName)).toBeVisible();
  await expect(body).not.toContainText(hiddenName);
  await expect(body).not.toContainText(unscheduledLastName);
  await expect(page).toHaveTitle(
    `Reserva tu cita con ${scheduledName} · WizyDoc`,
  );

  await chooseSlotAndGoToPatientStep(page);

  await expectStep(page, "patient", { current: 2, total: 2 });
  await expect(body).not.toContainText(hiddenName);
  await expect(body).not.toContainText(unscheduledLastName);
});
