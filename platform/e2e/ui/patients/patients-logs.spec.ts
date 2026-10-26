import { randomUUID } from "node:crypto";
import { createOnboardedAdmin } from "../../support/accounts";
import { softDeleteMembership } from "../../support/invitations";
import { addScopeMember, patientsApiUrl } from "../../support/patient-scope";
import { createClinicWithPatients } from "../../support/patient-search-world";
import { numberedPatientSpecs } from "../../support/patients";
import {
  NO_RESULTS_TITLE,
  openClinicPatients,
  SEARCH_ERROR_TITLE,
  searchFor,
} from "../../support/patients-ui";
import { readApiLog, readPlatformLog } from "../../support/server-logs";
import { expect, test } from "../../support/test";

// docs/features/pacientes-busqueda/plan.md — CA-27: el término no aparece en la salida del api ni de Next.

const OVER_THE_LIMIT = 81;
const REQUESTS_WITH_THE_TERM = 4;

function occurrences(text: string, fragment: string) {
  return text.split(fragment).length - 1;
}

test("CA-27: un término único, con respuestas 200, 400 y 404, no aparece en la salida del api ni en la de Next", async ({
  page,
}) => {
  const term = `Zzyzx${randomUUID().slice(0, 6)}`;
  const world = await createClinicWithPatients(
    "logs-termino",
    numberedPatientSpecs(3, "Soto", 72000000),
  );
  const doctor = await addScopeMember(world, "DOCTOR", world.clinic.id, "logs");
  const stranger = await createOnboardedAdmin({
    emailPrefix: "admin-logs-ajeno",
  });
  const searchUrl = patientsApiUrl(world.clinic.id, "/search");
  await openClinicPatients(
    page,
    doctor,
    world.admin.accountId,
    world.clinic.id,
  );

  await searchFor(page, term);
  await expect(page.getByText(NO_RESULTS_TITLE)).toBeVisible();

  const tooLong = await world.admin.context.post(searchUrl, {
    data: { search: term.padEnd(OVER_THE_LIMIT, "x") },
  });
  expect(tooLong.status()).toBe(400);
  const withoutMembership = await stranger.context.post(searchUrl, {
    data: { search: term },
  });
  expect(withoutMembership.status()).toBe(404);

  await softDeleteMembership(doctor.membershipId);
  await searchFor(page, `${term}b`);
  await expect(page.getByText(SEARCH_ERROR_TITLE)).toBeVisible();

  const accessPath = `/patients/in/${world.clinic.id}/search`;
  await expect
    .poll(() => occurrences(readApiLog(), accessPath))
    .toBeGreaterThanOrEqual(REQUESTS_WITH_THE_TERM);
  expect(readApiLog().toLowerCase()).not.toContain(term.toLowerCase());
  expect(readPlatformLog().toLowerCase()).not.toContain(term.toLowerCase());
});
