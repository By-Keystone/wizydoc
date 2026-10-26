import { extractLink, readEmailsTo, waitForEmailTo } from "../../support/email";
import {
  addListedClinic,
  addTeamMember,
  bookSuccessfully,
  createListedClinic,
  currentMonth,
  type ListedClinic,
  MOBILE_CONTACT,
  monthName,
  planRequestMessage,
  postAnonymously,
  postBookingTo,
  REACHED_NOTICE_SUBJECT,
  renewalDay,
  setMonthlyBookings,
  setPlan,
  slotInDays,
  visibleEmailText,
  warningNoticeSubject,
  WIZYDOC_WHATSAPP_ORIGIN,
  WIZYDOC_WHATSAPP_PATH,
} from "../../support/monthly-cap";
import { expect, test } from "../../support/test";

// docs/features/tope-citas-mes/plan.md: CA-57 a CA-61.

const MISSING_CONTACT_LINE =
  "Tus pacientes no verán ningún número para contactarte. Puedes agregarlo desde tu panel.";
const PANEL_BUTTON = "Ir a mi panel";
const REACHED_PANEL_HINT =
  "En tu panel verás cuántos pacientes intentan reservar y no pueden.";
const NOTICE_SUBJECT_PREFIX = "Llevas ";

function noticeSubjectsSentTo(email: string): string[] {
  return readEmailsTo(email)
    .map(({ subject }) => subject)
    .filter(
      (subject) =>
        subject.startsWith(NOTICE_SUBJECT_PREFIX) ||
        subject === REACHED_NOTICE_SUBJECT,
    );
}

async function noticeOf(world: ListedClinic, subject: string) {
  const email = await waitForEmailTo(world.owner.email, { subject });
  return { html: email.html, text: visibleEmailText(email.html) };
}

function panelPathOf(html: string): string {
  return new URL(extractLink(html, "/dashboard")).pathname;
}

function expectRequestLink(
  html: string,
  world: ListedClinic,
  planLabel: string,
) {
  const link = new URL(extractLink(html, "wa.me"));
  expect(link.origin).toBe(WIZYDOC_WHATSAPP_ORIGIN);
  expect(link.pathname).toBe(WIZYDOC_WHATSAPP_PATH);
  expect(link.searchParams.get("text")).toBe(
    planRequestMessage(world.owner, world.clinicName, planLabel),
  );
}

test("CA-57: la reserva que lleva el contador de 7 a 8 avisa al dueño con el 80 % de Gratis, y la 9 no envía nada", async () => {
  const world = await createListedClinic("notice-ca57-gratis", { booked: 7 });

  await bookSuccessfully(world, 2);

  const { html, text } = await noticeOf(world, warningNoticeSubject(8, 10));
  expect(text).toContain(`Hola ${world.owner.name},`);
  expect(text).toContain(`en ${monthName(currentMonth())}`);
  expect(text).toContain(`hasta el ${renewalDay()}`);
  expect(text).toContain("El plan Consultorio incluye 150 citas al mes.");
  expect(text).toContain("Pedir el plan Consultorio");
  expect(text).toContain(PANEL_BUTTON);
  expectRequestLink(html, world, "Consultorio");
  expect(panelPathOf(html)).toBe(
    `/account/${world.accountId}/clinic/${world.clinicId}/dashboard`,
  );

  await bookSuccessfully(world, 3);

  expect(noticeSubjectsSentTo(world.owner.email)).toEqual([
    warningNoticeSubject(8, 10),
  ]);
});

test("CA-57: en Consultorio, la reserva 120 envía «Llevas 120 de las 150 citas de tu plan este mes» y ofrece Clínica", async () => {
  const world = await createListedClinic("notice-ca57-consultorio", {
    plan: "CONSULTORIO",
    booked: 119,
  });

  await bookSuccessfully(world, 2);

  const { html, text } = await noticeOf(world, warningNoticeSubject(120, 150));
  expect(text).toContain("El plan Clínica incluye 600 citas al mes.");
  expect(text).toContain("Pedir el plan Clínica");
  expectRequestLink(html, world, "Clínica");
});

test("CA-58: la reserva que lleva el contador al tope avisa al dueño, y el paciente de esa reserva recibe su confirmación", async () => {
  const world = await createListedClinic("notice-ca58", { booked: 9 });

  const patient = await bookSuccessfully(world, 2);

  const { html, text } = await noticeOf(world, REACHED_NOTICE_SUBJECT);
  expect(text).toContain(`Hola ${world.owner.name},`);
  expect(text).toContain(
    "Desde ahora, quien abra tu link verá «Este consultorio no está recibiendo reservas en línea por ahora».",
  );
  expect(text).toContain(`vuelve a recibir reservas el ${renewalDay()}`);
  expect(text).toContain(REACHED_PANEL_HINT);
  expect(text).toContain("Pedir el plan Consultorio");
  expect(text).toContain(PANEL_BUTTON);
  expectRequestLink(html, world, "Consultorio");
  const confirmation = await waitForEmailTo(patient.email, {
    subject: `Tu cita en ${world.clinicName} está reservada`,
  });
  expect(confirmation.to).toBe(patient.email);
});

test("CA-59: sin contacto los dos avisos suman la línea del número; con contacto, ninguno", async () => {
  const withoutContact = await createListedClinic("notice-ca59-sin", {
    booked: 7,
  });
  const withContact = await createListedClinic("notice-ca59-con", {
    booked: 7,
    patientContact: MOBILE_CONTACT,
  });

  for (const world of [withoutContact, withContact]) {
    await bookSuccessfully(world, 2);
    await bookSuccessfully(world, 3);
    await bookSuccessfully(world, 4);
  }

  const withoutLine = [
    (await noticeOf(withoutContact, warningNoticeSubject(8, 10))).text,
    (await noticeOf(withoutContact, REACHED_NOTICE_SUBJECT)).text,
  ];
  const withLine = [
    (await noticeOf(withContact, warningNoticeSubject(8, 10))).text,
    (await noticeOf(withContact, REACHED_NOTICE_SUBJECT)).text,
  ];
  for (const text of withoutLine) expect(text).toContain(MISSING_CONTACT_LINE);
  for (const text of withLine) expect(text).not.toContain(MISSING_CONTACT_LINE);
});

test("CA-59: en una cuenta con dos sedes, la línea y «Ir a mi panel» son los de la sede de la reserva que provocó el aviso", async () => {
  const world = await createListedClinic("notice-ca59-dos-sedes", {
    booked: 7,
  });
  const second = await addListedClinic(world, {
    patientContact: MOBILE_CONTACT,
  });

  await bookSuccessfully(world, 2);
  const warning = await noticeOf(world, warningNoticeSubject(8, 10));
  await setMonthlyBookings(world.accountId, 9);
  await bookSuccessfully(second, 2);
  const reached = await noticeOf(world, REACHED_NOTICE_SUBJECT);

  expect(warning.text).toContain(MISSING_CONTACT_LINE);
  expect(panelPathOf(warning.html)).toBe(
    `/account/${world.accountId}/clinic/${world.clinicId}/dashboard`,
  );
  expect(reached.text).not.toContain(MISSING_CONTACT_LINE);
  expect(panelPathOf(reached.html)).toBe(
    `/account/${world.accountId}/clinic/${second.clinicId}/dashboard`,
  );
});

test("CA-60: cada aviso sale una vez por mes y por tope: ni un rechazo, ni una reserva perdida, ni un cambio de plan lo repiten", async () => {
  const world = await createListedClinic("notice-ca60", { booked: 9 });
  const sent = () => noticeSubjectsSentTo(world.owner.email);

  await bookSuccessfully(world, 2);
  expect(sent()).toEqual([REACHED_NOTICE_SUBJECT]);

  const refused = await postBookingTo(world, slotInDays(9));
  expect(refused.status()).toBe(409);
  const missed = await postAnonymously(
    `/clinic/${world.clinicId}/missed-bookings`,
  );
  expect(missed.status()).toBe(204);
  expect(sent()).toEqual([REACHED_NOTICE_SUBJECT]);

  await setPlan(world.accountId, "CONSULTORIO");
  expect(sent()).toEqual([REACHED_NOTICE_SUBJECT]);
  await bookSuccessfully(world, 3);
  expect(sent()).toEqual([REACHED_NOTICE_SUBJECT]);

  await setMonthlyBookings(world.accountId, 119);
  await bookSuccessfully(world, 4);
  const afterConsultorioWarning = [
    REACHED_NOTICE_SUBJECT,
    warningNoticeSubject(120, 150),
  ];
  expect(sent()).toEqual(afterConsultorioWarning);

  await setPlan(world.accountId, "FREE");
  const closedAgain = await postBookingTo(world, slotInDays(10));
  expect(closedAgain.status()).toBe(409);
  await setPlan(world.accountId, "CONSULTORIO");
  await bookSuccessfully(world, 5);
  expect(sent()).toEqual(afterConsultorioWarning);
});

test("CA-61: solo el dueño recibe los avisos, y ninguno lleva datos del paciente ni la fecha u hora de la cita", async () => {
  const world = await createListedClinic("notice-ca61", { booked: 7 });
  const team = [
    await addTeamMember(world, "ADMIN"),
    await addTeamMember(world, "ADMIN", world.organizationId),
    await addTeamMember(world, "DOCTOR"),
    await addTeamMember(world, "USER"),
  ];

  const patient = await bookSuccessfully(world, 2);
  await bookSuccessfully(world, 3);
  await bookSuccessfully(world, 4);

  expect(noticeSubjectsSentTo(world.owner.email)).toEqual([
    warningNoticeSubject(8, 10),
    REACHED_NOTICE_SUBJECT,
  ]);
  for (const member of team) {
    expect(noticeSubjectsSentTo(member.email), member.email).toEqual([]);
  }
  for (const subject of [warningNoticeSubject(8, 10), REACHED_NOTICE_SUBJECT]) {
    const { text } = await noticeOf(world, subject);

    for (const personalData of [
      patient.name,
      patient.lastName,
      patient.email,
      patient.documentNumber,
      patient.phone,
    ]) {
      expect(text).not.toContain(personalData);
    }
    expect(text).not.toMatch(/\b\d{1,2}:\d{2}\b/);
    expect(text).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
  }
});
