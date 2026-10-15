import { test, expect } from "../../support/test";
import { getTestPrisma } from "../../support/db";
import { extractLink, readLatestEmailTo } from "../../support/email";
import {
  createPortalClient,
  createPortalScenario,
  DEFAULT_APPOINTMENT_TIME,
  DEFAULT_DAYS_AHEAD,
  limaWallTimeInDays,
  newPortalPatient,
  postBooking,
  type PortalScenario,
  wallTimeToInstant,
} from "../../support/appointment-portal";

// docs/features/autogestion-paciente/prd.html — CA-1 y CA-9 (parte API).

const MANAGE_BUTTON = "Cancelar o reprogramar";
const SELF_SERVICE_TEXT =
  "Puedes cancelar o reprogramar hasta 12 horas antes de tu cita, y reprogramar una sola vez. No compartas este enlace: da acceso a tu cita.";
const BROKEN_PARAGRAPH = "comunícate con la clínica";
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const HEX_TOKEN_IN_TEXT = /[0-9a-f]{64}/;

async function bookOnPlan(
  scenario: PortalScenario,
  plan: "FREE" | "CONSULTORIO",
) {
  const prisma = await getTestPrisma();
  await prisma.subscription.update({
    where: { accountId: scenario.admin.accountId },
    data: { plan, status: "ACTIVE" },
  });
  const patient = newPortalPatient();
  const scheduledAt = limaWallTimeInDays(
    DEFAULT_DAYS_AHEAD,
    DEFAULT_APPOINTMENT_TIME,
  );
  const response = await postBooking(
    scenario,
    scenario.doctor.doctorProfileId,
    scheduledAt,
    patient,
  );
  const appointment = await prisma.appointment.findFirst({
    where: {
      doctorProfileId: scenario.doctor.doctorProfileId,
      scheduledAt: wallTimeToInstant(scheduledAt),
    },
  });
  return { response, patient, appointment };
}

test.describe("Enlace de autogestión en el correo de confirmación", () => {
  test("CA-1: con plan de pago el correo trae el botón, el texto y un enlace que abre la cita", async () => {
    const scenario = await createPortalScenario("link-paid");

    const { response, patient, appointment } = await bookOnPlan(
      scenario,
      "CONSULTORIO",
    );

    expect(response.ok()).toBe(true);
    expect(await response.text()).not.toMatch(HEX_TOKEN_IN_TEXT);
    const email = readLatestEmailTo(patient.email);
    expect(email).toBeDefined();
    const html = email?.html ?? "";
    expect(html).toContain(MANAGE_BUTTON);
    expect(html).toContain(SELF_SERVICE_TEXT);
    expect(html).toContain("(hora de Lima)");
    expect(html).not.toContain(BROKEN_PARAGRAPH);
    expect(html).not.toContain("{{");

    const link = extractLink(html, "/appointment/manage/");
    const token = new URL(link).pathname.split("/").at(-1) ?? "";
    expect(token).toMatch(TOKEN_PATTERN);

    const portal = await createPortalClient();
    const opened = await portal.get(token);
    expect(opened.status()).toBe(200);
    expect((await opened.json()).patientName).toBe(patient.name);

    const prisma = await getTestPrisma();
    expect(
      await prisma.appointmentAccessToken.count({
        where: { appointmentId: appointment?.id },
      }),
    ).toBe(1);
  });

  test("CA-9: en Gratis el correo sale sin botón ni texto y no se crea ningún token", async () => {
    const scenario = await createPortalScenario("link-free");

    const { response, patient, appointment } = await bookOnPlan(
      scenario,
      "FREE",
    );

    expect(response.ok()).toBe(true);
    const html = readLatestEmailTo(patient.email)?.html ?? "";
    expect(html).toContain("Tu cita ya está reservada");
    expect(html).not.toContain(MANAGE_BUTTON);
    expect(html).not.toContain("12 horas");
    expect(html).not.toContain("/appointment/manage/");
    expect(html).not.toContain(BROKEN_PARAGRAPH);
    expect(html).not.toContain("{{");

    const prisma = await getTestPrisma();
    expect(appointment).not.toBeNull();
    expect(
      await prisma.appointmentAccessToken.count({
        where: { appointmentId: appointment?.id },
      }),
    ).toBe(0);
  });
});
