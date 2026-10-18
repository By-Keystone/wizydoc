import { readEmailsTo, readLatestEmailTo } from "../../support/email";
import {
  addPortalDoctor,
  createManagedAppointment,
  createPortalClient,
  createPortalScenario,
  DEFAULT_APPOINTMENT_TIME,
  DEFAULT_DAYS_AHEAD,
  limaWallTimeInDays,
  newPortalPatient,
  postBooking,
  removeAvailability,
} from "../../support/appointment-portal";
import {
  readUserEmail,
  setDoctorTreatment,
  type Treatment,
} from "../../support/doctor-treatment";
import { expect, test } from "../../support/test";

// docs/features/perfil-usuario/plan.md — PR 1, CA-7, CA-9 a CA-12 y CA-15.

const PORTAL_KEYS = [
  "canCancel",
  "clinicAddress",
  "clinicId",
  "clinicName",
  "date",
  "doctorName",
  "doctorProfileId",
  "durationMinutes",
  "patientName",
  "rescheduleBlockedBy",
  "specialty",
  "status",
  "time",
];
const NEW_DAY = 11;
const NEW_TIME = "11:30";

async function treatedScenario(label: string, treatment: Treatment = "DRA") {
  const scenario = await createPortalScenario(label);
  await setDoctorTreatment(scenario.doctor.userId, treatment);
  const fullName = `${scenario.doctor.name} ${scenario.doctor.lastName}`;
  return { scenario, fullName };
}

const NOTICE_SUBJECTS = {
  cancelled: (clinicName: string) =>
    `Tu paciente ha cancelado su cita en ${clinicName}`,
  rescheduled: (clinicName: string) =>
    `Tu paciente ha reprogramado la cita en ${clinicName}`,
};

async function doctorNotices(
  userId: string,
  clinicName: string,
  kind: keyof typeof NOTICE_SUBJECTS,
) {
  const subject = NOTICE_SUBJECTS[kind](clinicName);
  return readEmailsTo(await readUserEmail(userId)).filter(
    (email) => email.subject === subject,
  );
}

test.describe("Tratamiento del médico en reserva, autogestión y correos", () => {
  test("CA-7: el portal devuelve doctorName «Dra. …» con las mismas claves de siempre", async () => {
    const { scenario, fullName } = await treatedScenario("treat-portal-read");
    const managed = await createManagedAppointment(scenario);

    const response = await (await createPortalClient()).get(managed.token);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(PORTAL_KEYS);
    expect(body.doctorName).toBe(`Dra. ${fullName}`);
  });

  test("CA-9: el correo de reserva al paciente nombra a «Dra. {nombre} {apellido}»", async () => {
    const { scenario, fullName } = await treatedScenario("treat-confirm-mail");
    const patient = newPortalPatient();

    const response = await postBooking(
      scenario,
      scenario.doctor.doctorProfileId,
      limaWallTimeInDays(DEFAULT_DAYS_AHEAD, DEFAULT_APPOINTMENT_TIME),
      patient,
    );

    expect(response.ok()).toBe(true);
    expect(readLatestEmailTo(patient.email)?.html).toContain(
      `Dra. ${fullName}`,
    );
  });

  test("CA-10: al reprogramar, el correo al paciente nombra a la médica como «Dra. …»", async () => {
    const { scenario, fullName } = await treatedScenario("treat-resched-mail");
    const managed = await createManagedAppointment(scenario);

    const response = await (await createPortalClient()).reschedule(
      managed.token,
      { scheduledAt: limaWallTimeInDays(NEW_DAY, NEW_TIME) },
    );

    expect(response.status()).toBe(200);
    const patientEmails = readEmailsTo(managed.patient.email).filter((email) =>
      email.subject.startsWith("Tu cita se ha reprogramado"),
    );
    expect(patientEmails).toHaveLength(1);
    expect(patientEmails[0].html).toContain(`Dra. ${fullName}`);
  });

  test("CA-11: el correo al médico muestra «Profesional» y, con cambio de médico, «Médico anterior» y «Médico nuevo» con el tratamiento de cada uno", async () => {
    const { scenario, fullName } = await treatedScenario("treat-doctor-mail");
    const sameDoctor = await createManagedAppointment(scenario);
    const client = await createPortalClient();

    await client.reschedule(sameDoctor.token, {
      scheduledAt: limaWallTimeInDays(NEW_DAY, NEW_TIME),
    });

    const [professionalNotice] = await doctorNotices(
      scenario.doctor.userId,
      scenario.clinicName,
      "rescheduled",
    );
    expect(professionalNotice.html).toContain("Profesional");
    expect(professionalNotice.html).toContain(`Dra. ${fullName}`);

    const changing = await createManagedAppointment(scenario, {
      scheduledAt: limaWallTimeInDays(DEFAULT_DAYS_AHEAD + 2, "10:00"),
    });
    const replacement = await addPortalDoctor({
      label: "treat-doctor-mail-reemplazo",
      clinicId: scenario.clinicId,
      admin: scenario.admin,
      specialtyId: scenario.specialtyId,
      name: "Mateo",
      lastName: "Salas",
    });
    await setDoctorTreatment(replacement.userId, null);
    await removeAvailability(scenario.doctor.doctorProfileId);

    const change = await client.reschedule(changing.token, {
      scheduledAt: limaWallTimeInDays(NEW_DAY + 3, NEW_TIME),
      newDoctorProfileId: replacement.doctorProfileId,
    });

    expect(change.status()).toBe(200);
    const previous = await doctorNotices(
      scenario.doctor.userId,
      scenario.clinicName,
      "rescheduled",
    );
    const incoming = await doctorNotices(
      replacement.userId,
      scenario.clinicName,
      "rescheduled",
    );
    expect(incoming).toHaveLength(1);
    for (const { html } of [previous.at(-1), incoming[0]].filter(
      (notice) => notice !== undefined,
    )) {
      expect(html).toContain("Médico anterior");
      expect(html).toContain("Médico nuevo");
      expect(html).toContain(`Dra. ${fullName}`);
      expect(html).toContain("Mateo Salas");
      expect(html).not.toContain("Dr. Mateo Salas");
      expect(html).not.toContain("Dra. Mateo Salas");
    }
  });

  test("CA-12: los saludos al médico, al cancelar y al reprogramar, son «Hola {nombre de pila},» sin tratamiento", async () => {
    const { scenario } = await treatedScenario("treat-greeting");
    const client = await createPortalClient();
    const toCancel = await createManagedAppointment(scenario);
    const toMove = await createManagedAppointment(scenario, {
      scheduledAt: limaWallTimeInDays(DEFAULT_DAYS_AHEAD + 2, "10:00"),
    });

    await client.cancel(toCancel.token);
    await client.reschedule(toMove.token, {
      scheduledAt: limaWallTimeInDays(NEW_DAY, NEW_TIME),
    });

    const notices = [
      ...(await doctorNotices(
        scenario.doctor.userId,
        scenario.clinicName,
        "cancelled",
      )),
      ...(await doctorNotices(
        scenario.doctor.userId,
        scenario.clinicName,
        "rescheduled",
      )),
    ];
    expect(notices).toHaveLength(2);
    for (const { html } of notices) {
      expect(html).toContain(`Hola ${scenario.doctor.name},`);
      expect(html).not.toContain("Hola Dr");
    }
  });

  test("CA-15: si el tratamiento cambia después de reservar, el correo enviado no cambia y la autogestión muestra el nombre nuevo", async () => {
    const { scenario, fullName } = await treatedScenario("treat-changes-later");
    const managed = await createManagedAppointment(scenario);
    const sentBefore = readLatestEmailTo(managed.patient.email);
    expect(sentBefore?.html).toContain(`Dra. ${fullName}`);

    await setDoctorTreatment(scenario.doctor.userId, "DR");

    expect(readLatestEmailTo(managed.patient.email)).toEqual(sentBefore);
    const response = await (await createPortalClient()).get(managed.token);
    expect((await response.json()).doctorName).toBe(`Dr. ${fullName}`);
  });
});
