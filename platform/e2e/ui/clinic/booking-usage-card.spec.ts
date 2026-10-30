import type { Page } from "@playwright/test";
import {
  bookFromDateStep,
  boxOf,
  expectNoHorizontalScroll,
  MOBILE_VIEWPORT,
  openBooking,
} from "../../support/booking-ui";
import { PLATFORM_BASE_URL } from "../../support/env";
import { CORAL, TEAL, WHITE } from "../../support/first-use";
import {
  addListedClinic,
  addNumberButton,
  addTeamMember,
  bookSuccessfully,
  changeNumberButton,
  currentMonth,
  createListedClinic,
  expectPlanRequestMessage,
  fetchBookingStatus,
  firstMinuteOfCurrentMonth,
  lastMinuteOfPreviousMonth,
  LIMA_LANDLINE_CONTACT,
  type ListedClinic,
  MOBILE_CONTACT,
  monthName,
  openHome,
  planRequestLink,
  planRequestLinks,
  planRequestMessage,
  PLAN_CAPS,
  PLAN_LABELS,
  type PlanKey,
  previousMonth,
  reloadHome,
  renewalDay,
  seedMissedBookings,
  setMonthlyBookings,
  setPatientContact,
  setPlan,
  usageCard,
} from "../../support/monthly-cap";
import { seedPatientWithAppointment } from "../../support/patients";
import { expect, test } from "../../support/test";

// docs/features/tope-citas-mes/plan.md: CA-1, CA-7, CA-10, CA-11, CA-37 a CA-44, CA-77 (Inicio) y CA-78 (tarjeta).

const PLANS_WITH_CAP: Array<Exclude<PlanKey, "RED">> = [
  "FREE",
  "CONSULTORIO",
  "CLINICA",
];
const WARNING_PERCENT = 0.8;
const MIN_CARD_BUTTON_HEIGHT = 40;
const RED_BOOKED = 5_000;
const APPOINTMENTS_SEEDED_IN_THE_DATABASE = 10;
const PATIENTS_WHO_TRIED = 3;
const BOOKINGS_PER_CLINIC = 5;

const month = () => monthName(currentMonth());
const normalTitle = () => `Citas reservadas en ${month()}`;
const nearTitle = (booked: number, cap: number) =>
  `Llevas ${booked} de las ${cap} citas de tu plan en ${month()}`;
const reachedTitle = (cap: number, plan: PlanKey) =>
  `Llegaste al tope de ${cap} citas de tu plan ${PLAN_LABELS[plan]}`;
const nearCount = (cap: number) => Math.ceil(cap * WARNING_PERCENT);

const cardHeading = (page: Page, name: string) =>
  usageCard(page).getByRole("heading", { level: 2, name, exact: true });

async function setUsage(
  world: ListedClinic,
  plan: PlanKey,
  booked: number,
): Promise<void> {
  await setPlan(world.accountId, plan);
  await setMonthlyBookings(world.accountId, booked);
}

test("CA-1: cada cita que reserva un paciente sube el contador: el ADMIN ve «1 de 10» en Inicio", async ({
  page,
  browser,
}) => {
  const world = await createListedClinic("usage-ca1");
  const patientContext = await browser.newContext({
    baseURL: PLATFORM_BASE_URL,
  });
  const patientPage = await patientContext.newPage();
  await openBooking(patientPage, world.clinicId);

  await bookFromDateStep(patientPage);

  await patientContext.close();
  await openHome(page, world);
  await expect(cardHeading(page, normalTitle())).toBeVisible();
  await expect(usageCard(page)).toContainText("1 de 10");
});

for (const inNewOrganization of [false, true]) {
  const where = inNewOrganization
    ? "dos sedes de organizaciones distintas"
    : "dos sedes de la misma organización";

  test(`CA-7: el tope es de toda la cuenta: con ${where}, 5 reservas en cada una cierran el link de las dos y la tarjeta lo dice en las dos`, async ({
    page,
    browser,
  }) => {
    const world = await createListedClinic("usage-ca7", {
      patientContact: MOBILE_CONTACT,
    });
    const second = await addListedClinic(world, {
      inNewOrganization,
      patientContact: LIMA_LANDLINE_CONTACT,
    });
    for (let day = 2; day < 2 + BOOKINGS_PER_CLINIC; day++) {
      await bookSuccessfully(world, day);
      await bookSuccessfully(second, day);
    }

    const sites = [
      { clinicId: world.clinicId, call: "Llamar al 987 654 321" },
      { clinicId: second.clinicId, call: "Llamar al (01) 234 5678" },
    ];
    for (const { clinicId, call } of sites) {
      const patientContext = await browser.newContext({
        baseURL: PLATFORM_BASE_URL,
      });
      const patientPage = await patientContext.newPage();
      await openBooking(patientPage, clinicId);
      await expect(
        patientPage.getByRole("heading", {
          level: 2,
          name: "Este consultorio no está recibiendo reservas en línea por ahora",
        }),
      ).toBeVisible();
      await expect(patientPage.getByRole("link", { name: call })).toBeVisible();
      await patientContext.close();

      await openHome(page, world, world.owner.email, clinicId);
      await expect(cardHeading(page, reachedTitle(10, "FREE"))).toBeVisible();
    }
  });
}

test("CA-10: el mes anterior no cuenta: sin citas este mes el link está abierto y la tarjeta dice «0 de 10»; de las reservas perdidas solo suman las desde el día 1 a las 00:00 de Lima", async ({
  page,
}) => {
  const world = await createListedClinic("usage-ca10");
  await setMonthlyBookings(world.accountId, 10, previousMonth());
  await seedMissedBookings(
    world.accountId,
    world.clinicId,
    2,
    lastMinuteOfPreviousMonth(),
  );
  expect((await fetchBookingStatus(world.clinicId)).isAcceptingBookings).toBe(
    true,
  );

  await openHome(page, world);
  await expect(cardHeading(page, normalTitle())).toBeVisible();
  await expect(usageCard(page)).toContainText("0 de 10");
  await expect(
    page.getByText(/intentó reservar|intentaron reservar/),
  ).toHaveCount(0);

  await setMonthlyBookings(world.accountId, 10);
  await seedMissedBookings(
    world.accountId,
    world.clinicId,
    1,
    firstMinuteOfCurrentMonth(),
  );
  await reloadHome(page);
  await expect(cardHeading(page, reachedTitle(10, "FREE"))).toBeVisible();
  await expect(usageCard(page)).toContainText(
    "Este mes, 1 paciente intentó reservar y no pudo.",
  );
});

test("CA-11: cuentan todas las citas creadas este mes, también las que no pasaron por el booking: 10 sembradas directo en la base cierran el link y la tarjeta dice que llegó al tope", async ({
  page,
}) => {
  const world = await createListedClinic("usage-ca11");
  for (let index = 0; index < APPOINTMENTS_SEEDED_IN_THE_DATABASE; index++) {
    await seedPatientWithAppointment(world);
  }

  await openHome(page, world);

  await expect(cardHeading(page, reachedTitle(10, "FREE"))).toBeVisible();
  expect((await fetchBookingStatus(world.clinicId)).isAcceptingBookings).toBe(
    false,
  );
});

test("CA-37: el dueño, el ADMIN de la sede y el ADMIN de la organización ven la tarjeta en Gratis, Consultorio y Clínica y en todos sus estados; en Red y en el Inicio de la organización, no", async ({
  page,
}) => {
  const world = await createListedClinic("usage-ca37");
  const clinicAdmin = await addTeamMember(world, "ADMIN");
  const organizationAdmin = await addTeamMember(
    world,
    "ADMIN",
    world.organizationId,
  );

  await openHome(page, world);
  for (const plan of PLANS_WITH_CAP) {
    const cap = PLAN_CAPS[plan] as number;
    for (const booked of [0, nearCount(cap), cap]) {
      await setUsage(world, plan, booked);
      await reloadHome(page);

      await expect(usageCard(page), `${plan} con ${booked}`).toBeVisible();
    }
  }

  await setUsage(world, "FREE", 4);
  for (const admin of [clinicAdmin, organizationAdmin]) {
    await openHome(page, world, admin.email);

    await expect(usageCard(page), admin.email).toBeVisible();
  }

  await openHome(page, world);
  await setUsage(world, "RED", RED_BOOKED);
  await reloadHome(page);
  await expect(usageCard(page)).toHaveCount(0);

  await setUsage(world, "FREE", 10);
  await page.context().addCookies([
    {
      name: "resource_id",
      value: world.organizationId,
      url: PLATFORM_BASE_URL,
    },
    {
      name: "resource_type",
      value: "ORGANIZATION",
      url: PLATFORM_BASE_URL,
    },
  ]);
  await page.goto(
    `/account/${world.accountId}/organization/${world.organizationId}/dashboard`,
  );
  await expect(page.getByText(/Este es el panel de /)).toBeVisible();
  await expect(usageCard(page)).toHaveCount(0);
});

test("CA-38: estado normal: el título del mes, «N de 10», el plan y la renovación, sin botones ni enlaces", async ({
  page,
}) => {
  const world = await createListedClinic("usage-ca38");
  await openHome(page, world);

  for (const booked of [0, 7]) {
    await setUsage(world, "FREE", booked);
    await reloadHome(page);

    await expect(cardHeading(page, normalTitle())).toBeVisible();
    await expect(usageCard(page)).toContainText(`${booked} de 10`);
    await expect(usageCard(page)).toContainText(
      `Plan Gratis · Se renuevan el ${renewalDay()}.`,
    );
    await expect(usageCard(page).getByRole("button")).toHaveCount(0);
    await expect(usageCard(page).getByRole("link")).toHaveCount(0);
  }

  await setUsage(world, "CONSULTORIO", 119);
  await reloadHome(page);
  await expect(cardHeading(page, normalTitle())).toBeVisible();
  await expect(usageCard(page)).toContainText("119 de 150");
  await expect(usageCard(page)).toContainText(
    `Plan Consultorio · Se renuevan el ${renewalDay()}.`,
  );
});

test("CA-39: cerca del tope: el aviso con el plan siguiente en teal y, sin contacto, la invitación a agregar un número; con contacto, la tarjeta no lo menciona", async ({
  page,
}) => {
  const world = await createListedClinic("usage-ca39");
  await openHome(page, world);

  for (const booked of [8, 9]) {
    await setUsage(world, "FREE", booked);
    await reloadHome(page);

    const card = usageCard(page);
    await expect(cardHeading(page, nearTitle(booked, 10))).toBeVisible();
    await expect(card).toContainText(
      `Cuando llegues a 10, tu link dejará de recibir reservas hasta el ${renewalDay()}. Las citas ya reservadas no cambian.`,
    );
    await expect(card).toContainText(
      "El plan Consultorio incluye 150 citas al mes.",
    );
    await expect(planRequestLink(card, "Consultorio")).toHaveCSS(
      "background-color",
      TEAL,
    );
    await expect(card).toContainText(
      "Agrega un número para que tus pacientes puedan contactarte cuando no recibas reservas.",
    );
    await expect(addNumberButton(card)).toHaveCSS("background-color", WHITE);
  }

  await setPatientContact(world.clinicId, MOBILE_CONTACT);
  await reloadHome(page);
  await expect(usageCard(page)).not.toContainText("987 654 321");
  await expect(usageCard(page)).not.toContainText("Agrega un número");
  await expect(addNumberButton(usageCard(page))).toHaveCount(0);

  for (const booked of [120, 149]) {
    await setUsage(world, "CONSULTORIO", booked);
    await reloadHome(page);

    await expect(cardHeading(page, nearTitle(booked, 150))).toBeVisible();
    await expect(planRequestLink(usageCard(page), "Clínica")).toBeVisible();
  }
});

test("CA-40: tope alcanzado: la reapertura, la mejora de plan en coral y lo que ven los pacientes según el contacto", async ({
  page,
}) => {
  const world = await createListedClinic("usage-ca40", { booked: 10 });
  await openHome(page, world);
  const card = usageCard(page);
  await expect(cardHeading(page, reachedTitle(10, "FREE"))).toBeVisible();
  await expect(card).toContainText(
    `Tu link vuelve a recibir reservas el ${renewalDay()}, o desde que pases al plan Consultorio, que incluye 150 citas al mes.`,
  );
  await expect(planRequestLink(card, "Consultorio")).toHaveCSS(
    "background-color",
    CORAL,
  );
  await expect(card).toContainText(
    "Tus pacientes ven el aviso «Este consultorio no está recibiendo reservas en línea por ahora» y ningún número para contactarte.",
  );
  await expect(addNumberButton(card)).toBeVisible();

  const contacts = [
    { contact: MOBILE_CONTACT, shown: "987 654 321" },
    { contact: LIMA_LANDLINE_CONTACT, shown: "(01) 234 5678" },
  ];
  for (const { contact, shown } of contacts) {
    await setPatientContact(world.clinicId, contact);
    await reloadHome(page);

    await expect(usageCard(page)).toContainText(
      `Tus pacientes ven el aviso «Este consultorio no está recibiendo reservas en línea por ahora» y el número ${shown}.`,
    );
    await expect(changeNumberButton(usageCard(page))).toBeVisible();
    await expect(addNumberButton(usageCard(page))).toHaveCount(0);
  }
});

test("CA-41: la tarjeta nunca muestra más citas que el tope: con 12 contadas en Gratis dice «Llegaste al tope de 10» con la barra llena", async ({
  page,
}) => {
  const world = await createListedClinic("usage-ca41", { booked: 12 });

  await openHome(page, world);

  await expect(cardHeading(page, reachedTitle(10, "FREE"))).toBeVisible();
  await expect(usageCard(page)).not.toContainText(/\b12\b/);
  const barFill = usageCard(page).locator('div[aria-hidden="true"] > div');
  expect(
    await barFill.evaluate((fill) => (fill as HTMLElement).style.width),
  ).toBe("100%");
});

test("CA-42: la mejora de plan nombra el plan siguiente y su tope, y «Pedir el plan» es un enlace a WhatsApp con el mensaje completo, sin toast", async ({
  page,
}) => {
  const world = await createListedClinic("usage-ca42");
  await openHome(page, world);
  const upgrades: Array<{
    plan: PlanKey;
    next: string;
    nearOffer: string;
    reachedOffer: string;
  }> = [
    {
      plan: "CONSULTORIO",
      next: "Clínica",
      nearOffer: "El plan Clínica incluye 600 citas al mes.",
      reachedOffer:
        "o desde que pases al plan Clínica, que incluye 600 citas al mes.",
    },
    {
      plan: "CLINICA",
      next: "Red",
      nearOffer: "El plan Red se arma a la medida de tu red.",
      reachedOffer:
        "o desde que pases al plan Red, que se arma a la medida de tu red.",
    },
  ];

  for (const { plan, next, nearOffer, reachedOffer } of upgrades) {
    const cap = PLAN_CAPS[plan] as number;
    for (const booked of [nearCount(cap), cap]) {
      await setUsage(world, plan, booked);
      await reloadHome(page);

      const card = usageCard(page);
      await expect(card).toContainText(
        booked === cap ? reachedOffer : nearOffer,
      );
      await expectPlanRequestMessage(
        planRequestLink(card, next),
        planRequestMessage(world.owner, world.clinicName, next),
      );
      await expect(planRequestLinks(page)).toHaveCount(1);
    }
  }
});

test("CA-43: en el tope, las reservas perdidas se cuentan en singular o plural, con 0 no hay aviso y suman las de todas las sedes de la cuenta", async ({
  page,
}) => {
  const world = await createListedClinic("usage-ca43", { booked: 10 });
  const second = await addListedClinic(world);
  await openHome(page, world);
  await expect(cardHeading(page, reachedTitle(10, "FREE"))).toBeVisible();
  await expect(usageCard(page)).not.toContainText(
    /intentó reservar|intentaron reservar/,
  );

  await seedMissedBookings(world.accountId, world.clinicId, 1);
  await reloadHome(page);
  await expect(usageCard(page)).toContainText(
    "Este mes, 1 paciente intentó reservar y no pudo.",
  );

  await seedMissedBookings(world.accountId, world.clinicId, 1);
  await seedMissedBookings(world.accountId, second.clinicId, 1);
  await reloadHome(page);
  await expect(usageCard(page)).toContainText(
    `Este mes, ${PATIENTS_WHO_TRIED} pacientes intentaron reservar y no pudieron.`,
  );
});

test("CA-44: las reservas perdidas solo se ven en el estado del tope de la tarjeta: si la cuenta sube de plan y vuelve a tener cupo, dejan de verse", async ({
  page,
}) => {
  const world = await createListedClinic("usage-ca44", { booked: 10 });
  await seedMissedBookings(world.accountId, world.clinicId, PATIENTS_WHO_TRIED);
  await openHome(page, world);
  await expect(usageCard(page)).toContainText("intentaron reservar");

  await setPlan(world.accountId, "CONSULTORIO");
  await reloadHome(page);

  await expect(cardHeading(page, normalTitle())).toBeVisible();
  await expect(
    page.getByText(/intentó reservar|intentaron reservar/),
  ).toHaveCount(0);
});

test("CA-77: a 375 px no hay desplazamiento horizontal en el Inicio del ADMIN con «Agregar número», con reservas perdidas y con contacto, y los botones de la tarjeta miden al menos 40 px", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  const world = await createListedClinic("usage-ca77");
  await openHome(page, world);
  const states = [
    { label: "con «Agregar número»", booked: 8, missed: 0, contact: null },
    { label: "con reservas perdidas", booked: 10, missed: 3, contact: null },
    {
      label: "con contacto",
      booked: 10,
      missed: 0,
      contact: LIMA_LANDLINE_CONTACT,
    },
  ];

  for (const { label, booked, missed, contact } of states) {
    await setMonthlyBookings(world.accountId, booked);
    await setPatientContact(world.clinicId, contact);
    if (missed > 0) {
      await seedMissedBookings(world.accountId, world.clinicId, missed);
    }
    await reloadHome(page);

    await expect(usageCard(page), label).toBeVisible();
    await expectNoHorizontalScroll(page);
    const controls = [
      ...(await usageCard(page).getByRole("button").all()),
      ...(await usageCard(page).getByRole("link").all()),
    ];
    expect(controls.length, label).toBeGreaterThan(0);
    for (const control of controls) {
      expect((await boxOf(control)).height, label).toBeGreaterThanOrEqual(
        MIN_CARD_BUTTON_HEIGHT,
      );
    }
  }
});

test("CA-77: a 375 px, el Inicio de un DOCTOR con el tope alcanzado no se desplaza en horizontal", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  const world = await createListedClinic("usage-ca77-doctor", { booked: 10 });
  const doctor = await addTeamMember(world, "DOCTOR");

  await openHome(page, world, doctor.email);

  await expectNoHorizontalScroll(page);
});

test("CA-78: la tarjeta es una section con aria-labelledby hacia su h2, el número va en texto y la barra está oculta a los lectores", async ({
  page,
}) => {
  const world = await createListedClinic("usage-ca78");
  await setUsage(world, "FREE", 7);
  await openHome(page, world);

  const card = usageCard(page);

  await expect(card).toContainText("7 de 10");
  const labelling = await card.evaluate((section) => {
    const headingId = section.getAttribute("aria-labelledby") ?? "";
    return {
      tag: section.tagName,
      headingTag: document.getElementById(headingId)?.tagName,
    };
  });
  expect(labelling).toEqual({ tag: "SECTION", headingTag: "H2" });
  await expect(card.locator('div[aria-hidden="true"]')).toHaveCount(1);
});
