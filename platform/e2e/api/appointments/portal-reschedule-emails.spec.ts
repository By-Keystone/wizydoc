import { test, expect } from "../../support/test";
import { getTestPrisma } from "../../support/db";
import { apiEnv } from "../../support/env";
import {
  type CapturedEmail,
  extractLink,
  readEmailsTo,
} from "../../support/email";
import {
  addPortalDoctor,
  createManagedAppointment,
  createPortalClient,
  createPortalScenario,
  limaWallTimeInDays,
  limaWallTimeInHours,
  postBooking,
  newPortalPatient,
  moveAppointmentTo,
  removeAvailability,
  type ManagedAppointment,
  type PortalDoctor,
  type PortalScenario,
  wallTimeToInstant,
} from "../../support/appointment-portal";

// docs/features/autogestion-paciente/prd.html — correos de reprogramar (d-16, d-24).

const MANAGE_BUTTON = "Gestionar mi cita";
const AGENDA_BUTTON = "Ver mi agenda";
const NOTHING_TO_DO_TEXT =
  "No tienes que hacer nada. Consulta tu agenda en WizyDoc para ver el detalle.";
const ONLY_CANCEL_TEXT =
  "Ya reprogramaste esta cita una vez: desde el enlace solo puedes cancelarla, hasta 12 horas antes.";
const NEW_DAY = 11;
const NEW_TIME = "11:30";
const HOURS_BEFORE_DEADLINE = 6;

function patientSubject(newWallTime: string) {
  const [, month, day] = newWallTime.slice(0, 10).split("-");
  return `Tu cita se ha reprogramado para el ${day}/${month} a las ${newWallTime.slice(11)}`;
}

function formatNewDateTime(wallTime: string) {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(wallTimeToInstant(wallTime));
}

function doctorSubject(scenario: PortalScenario) {
  return `Tu paciente ha reprogramado la cita en ${scenario.clinicName}`;
}

async function readUserEmail(userId: string) {
  const prisma = await getTestPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("El médico del escenario no existe");
  return user.email;
}

function withSubject(emails: CapturedEmail[], subject: string) {
  return emails.filter((email) => email.subject === subject);
}

async function readDoctorNotices(
  scenario: PortalScenario,
  doctor: PortalDoctor,
) {
  return withSubject(
    readEmailsTo(await readUserEmail(doctor.userId)),
    doctorSubject(scenario),
  );
}

async function countRescheduleEmails(
  scenario: PortalScenario,
  managed: ManagedAppointment,
  newWallTime: string,
) {
  return (
    withSubject(
      readEmailsTo(managed.patient.email),
      patientSubject(newWallTime),
    ).length + (await readDoctorNotices(scenario, scenario.doctor)).length
  );
}

async function bookedAppointment(label: string) {
  const scenario = await createPortalScenario(label);
  const managed = await createManagedAppointment(scenario);
  const client = await createPortalClient();
  return { scenario, managed, client };
}

async function bookedAppointmentWithReplacementDoctor(label: string) {
  const { scenario, managed, client } = await bookedAppointment(label);
  await removeAvailability(managed.doctorProfileId);
  const replacement = await addPortalDoctor({
    label: `${label}-reemplazo`,
    clinicId: scenario.clinicId,
    admin: scenario.admin,
    specialtyId: scenario.specialtyId,
    name: "Reemplazo",
    lastName: "Suplente",
  });
  return { scenario, managed, client, replacement };
}

function expectNoPatientData(html: string, managed: ManagedAppointment) {
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
}

test.describe("Correos al reprogramar desde el enlace", () => {
  test("el paciente recibe la fecha y hora nuevas en el asunto, el resumen de la nueva cita y «Gestionar mi cita» con el mismo token", async () => {
    const { scenario, managed, client } = await bookedAppointment(
      "resched-mail-patient",
    );
    const newWallTime = limaWallTimeInDays(NEW_DAY, NEW_TIME);

    const response = await client.reschedule(managed.token, {
      scheduledAt: newWallTime,
    });

    expect(response.status()).toBe(200);
    const emails = withSubject(
      readEmailsTo(managed.patient.email),
      patientSubject(newWallTime),
    );
    expect(emails).toHaveLength(1);
    const { html } = emails[0];
    expect(html).toContain(managed.patient.name);
    expect(html).toContain(managed.patient.lastName);
    for (const summary of [
      "30 minutos",
      scenario.specialtyName,
      `${scenario.doctor.name} ${scenario.doctor.lastName}`,
      scenario.clinicName,
      scenario.clinicAddress,
      MANAGE_BUTTON,
      ONLY_CANCEL_TEXT,
    ]) {
      expect(html).toContain(summary);
    }
    expect(extractLink(html, "/appointment/manage/")).toBe(
      `${apiEnv.FRONTEND_URL}/appointment/manage/${managed.token}`,
    );
    expect(html).toContain(formatNewDateTime(newWallTime));
    for (const absent of ["Cancelar o reprogramar", "Ver o cancelar mi cita"]) {
      expect(html).not.toContain(absent);
    }
  });

  test("el médico de la cita recibe «Antes» y «Ahora» con el resumen y «Ver mi agenda», sin datos del paciente", async () => {
    const { scenario, managed, client } = await bookedAppointment(
      "resched-mail-doctor",
    );

    await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInDays(NEW_DAY, NEW_TIME),
    });

    const emails = await readDoctorNotices(scenario, scenario.doctor);
    expect(emails).toHaveLength(1);
    const { html } = emails[0];
    for (const expected of [
      "Antes",
      "Ahora",
      "30 minutos",
      scenario.specialtyName,
      scenario.clinicName,
      NOTHING_TO_DO_TEXT,
      AGENDA_BUTTON,
    ]) {
      expect(html).toContain(expected);
    }
    expect(html).not.toContain("Médico anterior");
    expect(html).not.toContain("Médico nuevo");
    expect(html).toContain(`<s>${formatNewDateTime(managed.scheduledAt)}</s>`);
    expect(
      extractLink(
        html,
        `/account/${scenario.admin.accountId}/clinic/${scenario.clinicId}/dashboard`,
      ),
    ).toBe(
      `${apiEnv.FRONTEND_URL}/account/${scenario.admin.accountId}/clinic/${scenario.clinicId}/dashboard`,
    );
    expectNoPatientData(html, managed);
    expect(readEmailsTo(scenario.admin.email)).not.toContainEqual(
      expect.objectContaining({ subject: doctorSubject(scenario) }),
    );
  });

  test("con cambio de médico, el anterior y el nuevo reciben cada uno su aviso y el paciente ve al médico nuevo", async () => {
    const { scenario, managed, client, replacement } =
      await bookedAppointmentWithReplacementDoctor("resched-mail-change");
    const newWallTime = limaWallTimeInDays(NEW_DAY, NEW_TIME);
    const previousName = `${scenario.doctor.name} ${scenario.doctor.lastName}`;
    const newName = `${replacement.name} ${replacement.lastName}`;

    const response = await client.reschedule(managed.token, {
      scheduledAt: newWallTime,
      newDoctorProfileId: replacement.doctorProfileId,
    });

    expect(response.status()).toBe(200);
    for (const doctor of [scenario.doctor, replacement]) {
      const emails = await readDoctorNotices(scenario, doctor);
      expect(emails, doctor.userId).toHaveLength(1);
      const { html } = emails[0];
      for (const expected of [
        "Médico anterior",
        "Médico nuevo",
        previousName,
        newName,
        AGENDA_BUTTON,
      ]) {
        expect(html).toContain(expected);
      }
      expectNoPatientData(html, managed);
    }
    const [patientEmail] = withSubject(
      readEmailsTo(managed.patient.email),
      patientSubject(newWallTime),
    );
    expect(patientEmail.html).toContain(newName);
    expect(patientEmail.html).not.toContain(previousName);
  });

  test("ningún correo menciona la zona horaria, «Dr.», «Dra.» ni deja variables sin reemplazar", async () => {
    const { scenario, managed, client, replacement } =
      await bookedAppointmentWithReplacementDoctor("resched-mail-wording");
    const newWallTime = limaWallTimeInDays(NEW_DAY, NEW_TIME);

    await client.reschedule(managed.token, {
      scheduledAt: newWallTime,
      newDoctorProfileId: replacement.doctorProfileId,
    });

    const rescheduleEmails = [
      ...withSubject(
        readEmailsTo(managed.patient.email),
        patientSubject(newWallTime),
      ),
      ...(await readDoctorNotices(scenario, scenario.doctor)),
      ...(await readDoctorNotices(scenario, replacement)),
    ];
    expect(rescheduleEmails).toHaveLength(3);
    for (const { html, subject } of rescheduleEmails) {
      for (const forbidden of ["hora de Lima", "Dr.", "Dra.", "{{"]) {
        expect(html, `${subject}: ${forbidden}`).not.toContain(forbidden);
        expect(subject).not.toContain(forbidden);
      }
    }
  });

  test("un rechazo (cuerpo mal formado, pantalla vieja, horario tomado, menos de 12 h, token inválido) no envía ningún correo", async () => {
    const { scenario, managed, client } = await bookedAppointment(
      "resched-mail-rejected",
    );
    const newWallTime = limaWallTimeInDays(NEW_DAY, NEW_TIME);
    const emailsBefore = await countRescheduleEmails(
      scenario,
      managed,
      newWallTime,
    );

    const malformed = await client.reschedule(managed.token, {
      scheduledAt: "10:00",
    });
    const staleScreen = await client.reschedule(managed.token, {
      scheduledAt: newWallTime,
      expectedScheduledAt: limaWallTimeInDays(NEW_DAY + 1, "09:00"),
    });
    const unknownToken = await client.reschedule("0".repeat(64), {
      scheduledAt: newWallTime,
    });
    const takenSlot = limaWallTimeInDays(NEW_DAY + 2, NEW_TIME);
    await postBooking(
      scenario,
      managed.doctorProfileId,
      takenSlot,
      newPortalPatient(),
    );
    const slotTaken = await client.reschedule(managed.token, {
      scheduledAt: takenSlot,
    });
    await moveAppointmentTo(
      managed.appointmentId,
      limaWallTimeInHours(HOURS_BEFORE_DEADLINE),
    );
    const tooLate = await client.reschedule(managed.token, {
      scheduledAt: newWallTime,
    });

    expect(malformed.status()).toBe(400);
    expect(staleScreen.status()).toBe(409);
    expect(unknownToken.status()).toBe(404);
    expect(slotTaken.status()).toBe(409);
    expect((await slotTaken.json()).code).toBe("SLOT_TAKEN");
    expect(tooLate.status()).toBe(409);
    expect(await countRescheduleEmails(scenario, managed, newWallTime)).toBe(
      emailsBefore,
    );
  });

  test("un segundo intento de reprogramar no reenvía los correos", async () => {
    const { scenario, managed, client } =
      await bookedAppointment("resched-mail-twice");
    const newWallTime = limaWallTimeInDays(NEW_DAY, NEW_TIME);
    await client.reschedule(managed.token, { scheduledAt: newWallTime });

    const second = await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInDays(NEW_DAY + 1, NEW_TIME),
    });

    expect(second.status()).toBe(409);
    expect(await countRescheduleEmails(scenario, managed, newWallTime)).toBe(2);
  });
});
