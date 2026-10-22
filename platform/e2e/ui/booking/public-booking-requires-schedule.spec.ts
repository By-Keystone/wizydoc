import { createSpecialty } from "../../support/accounts";
import {
  addPortalDoctor,
  createPortalScenario,
} from "../../support/appointment-portal";
import { getTestPrisma } from "../../support/db";
import { expect, test } from "../../support/test";
import { uniqueName } from "../../support/users";

// docs/features/doctor-profile-specialties/plan.md, PR 2: CA-6 (paso 1 a 375 px).

test("CA-6: a 375 px el paso 1 no ofrece la especialidad que solo atiende un médico sin horarios", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const scenario = await createPortalScenario("sched-ui-ca6");
  const hiddenName = uniqueName("Solo-sin-horarios");
  const hiddenId = await createSpecialty(
    scenario.admin,
    scenario.organizationId,
    hiddenName,
  );
  const unscheduled = await addPortalDoctor({
    label: "sched-ui-ca6-sin",
    clinicId: scenario.clinicId,
    admin: scenario.admin,
    specialtyId: scenario.specialtyId,
    availability: "none",
  });
  const prisma = await getTestPrisma();
  await prisma.doctorProfile.update({
    where: { id: unscheduled.doctorProfileId },
    data: { specialties: { connect: [{ id: hiddenId }] } },
  });

  await page.goto(`/clinic/${scenario.clinicId}/create-appointment`);

  await expect(
    page.getByRole("heading", { name: "¿Qué especialidad necesitas?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: scenario.specialtyName }),
  ).toBeVisible();
  await expect(page.getByText(hiddenName)).toHaveCount(0);
});
