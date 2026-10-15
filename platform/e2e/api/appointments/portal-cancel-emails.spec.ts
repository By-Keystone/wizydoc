import { test, expect } from "../../support/test";
import { getTestPrisma } from "../../support/db";
import {
  type CapturedEmail,
  extractLink,
  readEmailsTo,
} from "../../support/email";
import {
  createManagedAppointment,
  createPortalClient,
  createPortalScenario,
  limaWallTimeInHours,
  moveAppointmentTo,
  type ManagedAppointment,
  type PortalScenario,
} from "../../support/appointment-portal";

// docs/features/autogestion-paciente/prd.html — correos de cancelar (d-22, d-23).

const PATIENT_SUBJECT = "Tu cita ha sido cancelada";
const MANAGE_BUTTON = "Gestionar mi cita";
const AGENDA_BUTTON = "Ver mi agenda";
const SLOT_FREED_TEXT = "El horario quedó libre para otra reserva.";
const NOTHING_TO_DO_TEXT =
  "No tienes que hacer nada. Consulta tu agenda en WizyDoc para ver el detalle.";
const HOURS_BEFORE_DEADLINE = 6;
const REASON_LABELS: Record<string, string> = {
  UNEXPECTED_EVENT: "Me surgió un imprevisto",
  CANNOT_MAKE_IT: "No puedo llegar a esa hora",
  NO_LONGER_NEEDED: "Ya no necesito la cita",
  SEEN_ELSEWHERE: "Me atenderé en otro lugar",
  BOOKED_BY_MISTAKE: "Reservé por error",
};

function doctorSubject(scenario: PortalScenario) {
  return `Tu paciente ha cancelado su cita en ${scenario.clinicName}`;
}

async function readDoctorEmail(scenario: PortalScenario) {
  const prisma = await getTestPrisma();
  const doctor = await prisma.user.findUnique({
    where: { id: scenario.doctor.userId },
  });
  if (!doctor) throw new Error("El médico del escenario no existe");
  return doctor.email;
}

function withSubject(emails: CapturedEmail[], subject: string) {
  return emails.filter((email) => email.subject === subject);
}

async function countCancellationEmails(
  scenario: PortalScenario,
  managed: ManagedAppointment,
) {
  const doctorEmail = await readDoctorEmail(scenario);
  return (
    withSubject(readEmailsTo(managed.patient.email), PATIENT_SUBJECT).length +
    withSubject(readEmailsTo(doctorEmail), doctorSubject(scenario)).length
  );
}

test.describe("Correos al cancelar desde el enlace", () => {
  test("el paciente recibe «Tu cita ha sido cancelada» sin resumen, con «Gestionar mi cita» y el mismo enlace", async () => {
    const scenario = await createPortalScenario("cancel-mail-patient");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();

    const response = await client.cancel(managed.token);

    expect(response.status()).toBe(200);
    const emails = withSubject(
      readEmailsTo(managed.patient.email),
      PATIENT_SUBJECT,
    );
    expect(emails).toHaveLength(1);
    const { html } = emails[0];
    expect(html).toContain(MANAGE_BUTTON);
    expect(extractLink(html, "/appointment/manage/")).toMatch(
      new RegExp(`/appointment/manage/${managed.token}$`),
    );
    for (const absent of [
      scenario.specialtyName,
      scenario.clinicName,
      scenario.clinicAddress,
      scenario.doctor.name,
      "Fecha y hora",
      "Reservar otro horario",
    ]) {
      expect(html).not.toContain(absent);
    }
  });

  test("el médico de la cita recibe el aviso con la sede, la etiqueta del motivo y «Ver mi agenda», sin datos del paciente", async () => {
    const scenario = await createPortalScenario("cancel-mail-doctor");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();

    await client.cancel(managed.token, { reason: "SEEN_ELSEWHERE" });

    const emails = withSubject(
      readEmailsTo(await readDoctorEmail(scenario)),
      doctorSubject(scenario),
    );
    expect(emails).toHaveLength(1);
    const { html } = emails[0];
    expect(html).toContain(REASON_LABELS.SEEN_ELSEWHERE);
    expect(html).not.toContain("SEEN_ELSEWHERE");
    expect(html).toContain(scenario.specialtyName);
    expect(html).toContain(SLOT_FREED_TEXT);
    expect(html).toContain(NOTHING_TO_DO_TEXT);
    expect(html).toContain(AGENDA_BUTTON);
    expect(
      extractLink(
        html,
        `/account/${scenario.admin.accountId}/clinic/${scenario.clinicId}/dashboard`,
      ),
    ).toContain("/dashboard");
    for (const forbidden of [
      managed.patient.name,
      managed.patient.lastName,
      managed.patient.documentNumber,
      managed.patient.phone,
      managed.patient.email,
      managed.token,
      "/appointment/manage/",
    ]) {
      expect(html).not.toContain(forbidden);
    }
  });

  test("cada motivo llega al médico con su etiqueta en español", async () => {
    const client = await createPortalClient();

    for (const [index, [code, label]] of Object.entries(
      REASON_LABELS,
    ).entries()) {
      const scenario = await createPortalScenario(
        `cancel-mail-reason-${index}`,
      );
      const managed = await createManagedAppointment(scenario);

      await client.cancel(managed.token, { reason: code });

      const [email] = withSubject(
        readEmailsTo(await readDoctorEmail(scenario)),
        doctorSubject(scenario),
      );
      expect(email.html, code).toContain(label);
    }
  });

  test("ningún correo menciona la zona horaria, «Dr.», «Dra.» ni deja variables sin reemplazar", async () => {
    const scenario = await createPortalScenario("cancel-mail-wording");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();

    await client.cancel(managed.token);

    const cancellationEmails = [
      ...withSubject(readEmailsTo(managed.patient.email), PATIENT_SUBJECT),
      ...withSubject(
        readEmailsTo(await readDoctorEmail(scenario)),
        doctorSubject(scenario),
      ),
    ];
    expect(cancellationEmails).toHaveLength(2);
    for (const { html, subject } of cancellationEmails) {
      for (const forbidden of ["hora de Lima", "Dr.", "Dra.", "{{"]) {
        expect(html, `${subject}: ${forbidden}`).not.toContain(forbidden);
        expect(subject).not.toContain(forbidden);
      }
    }
  });

  test("un rechazo (sin motivo, menos de 12 h, token inválido) no envía ningún correo", async () => {
    const scenario = await createPortalScenario("cancel-mail-rejected");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();
    const emailsBefore = await countCancellationEmails(scenario, managed);

    const withoutReason = await client.postRaw(`${managed.token}/cancel`, "{}");
    const unknownToken = await client.cancel("0".repeat(64));
    await moveAppointmentTo(
      managed.appointmentId,
      limaWallTimeInHours(HOURS_BEFORE_DEADLINE),
    );
    const tooLate = await client.cancel(managed.token);

    expect(withoutReason.status()).toBe(400);
    expect(unknownToken.status()).toBe(404);
    expect(tooLate.status()).toBe(409);
    expect(await countCancellationEmails(scenario, managed)).toBe(emailsBefore);
  });

  test("cancelar otra vez no reenvía los correos", async () => {
    const scenario = await createPortalScenario("cancel-mail-twice");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();
    await client.cancel(managed.token);
    const emailsAfterFirst = await countCancellationEmails(scenario, managed);

    const second = await client.cancel(managed.token);

    expect(emailsAfterFirst).toBe(2);
    expect(second.status()).toBe(200);
    expect(await countCancellationEmails(scenario, managed)).toBe(2);
  });
});
