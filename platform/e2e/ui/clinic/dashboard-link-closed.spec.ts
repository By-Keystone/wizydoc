import type { Page } from "@playwright/test";
import {
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
} from "../../support/accounts";
import { boxOf } from "../../support/booking-ui";
import { PLATFORM_BASE_URL } from "../../support/env";
import {
  addListedDoctor,
  CORAL,
  copyLinkButton,
  createLegacyOwnerClinic,
  firstSteps,
  LINK_READY_TEXT,
  linkNotice,
  openClinicDashboard,
  stepLink,
  stepNamed,
  TEAL,
  viewAsPatientLink,
  visibleCoralElements,
  WHITE,
} from "../../support/first-use";
import {
  ADMIN_CAN_CHANGE_PLAN_TEXT,
  addNumberButton,
  addTeamMember,
  changeNumberButton,
  closedHeading,
  createListedClinic,
  expectMissedBookingsStay,
  LINK_CLOSED_TEXT,
  openHome,
  planRequestLink,
  planRequestLinks,
  PLAN_CAPS,
  type PlanKey,
  reloadHome,
  seedMissedBookings,
  setMonthlyBookings,
  setPlan,
  usageCard,
} from "../../support/monthly-cap";
import { expect, test } from "../../support/test";
import { uniqueName } from "../../support/users";

// docs/features/tope-citas-mes/plan.md: CA-33 a CA-36 y CA-45 a CA-48.

const NO_PLAN_NOTICE = "Tu plan no permite hacer uso de esta función";
const REACHED_FREE_TITLE = "Llegaste al tope de 10 citas de tu plan Gratis";
const WARNING_PERCENT = 0.8;
const PATIENTS_WHO_TRIED = 3;

const nearCount = (cap: number) => Math.ceil(cap * WARNING_PERCENT);

interface Actor {
  label: string;
  email: string;
  isAdmin: boolean;
}

async function listedClinicWithTeam(label: string, booked: number) {
  const world = await createListedClinic(label, { booked });
  const doctor = await addTeamMember(world, "DOCTOR");
  const user = await addTeamMember(world, "USER");
  const actors: Actor[] = [
    { label: "ADMIN", email: world.owner.email, isAdmin: true },
    { label: "DOCTOR", email: doctor.email, isAdmin: false },
    { label: "USER", email: user.email, isAdmin: false },
  ];
  return { world, actors };
}

async function expectOnlyCoral(page: Page, expected: string[]) {
  const coral = await visibleCoralElements(page);
  expect(coral).toHaveLength(expected.length);
  for (const [index, startsWith] of expected.entries()) {
    expect(coral[index].startsWith(startsWith), coral[index]).toBe(true);
  }
}

test("CA-33: con el tope alcanzado, ADMIN, DOCTOR y USER ven que el link no recibe reservas, con «Copiar link de reservas» en outline y «Ver como paciente»; DOCTOR y USER ven además la línea del administrador", async ({
  page,
}) => {
  const { world, actors } = await listedClinicWithTeam("closed-ca33", 10);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: PLATFORM_BASE_URL,
  });

  for (const actor of actors) {
    await openHome(page, world, actor.email);

    await expect(page.getByText(LINK_CLOSED_TEXT), actor.label).toBeVisible();
    await expect(page.getByText(LINK_READY_TEXT), actor.label).toHaveCount(0);
    await expect(copyLinkButton(page), actor.label).toHaveCSS(
      "background-color",
      WHITE,
    );
    await expect(viewAsPatientLink(page), actor.label).toBeVisible();
    await expect(
      page.getByText(ADMIN_CAN_CHANGE_PLAN_TEXT),
      actor.label,
    ).toHaveCount(actor.isAdmin ? 0 : 1);
  }

  await copyLinkButton(page).click();
  await expect(page.getByText("¡Link copiado!")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${PLATFORM_BASE_URL}/clinic/${world.clinicId}/create-appointment`,
  );
  const [popup] = await Promise.all([
    page.context().waitForEvent("page"),
    viewAsPatientLink(page).click(),
  ]);
  await popup.waitForLoadState();
  await expect(closedHeading(popup)).toBeVisible();
  await expectMissedBookingsStay(world.accountId, 0);
});

test("CA-34: por debajo del tope (0, 8 y 9 contadas) la fila del link es la de siempre para todos los roles, con «Copiar link de reservas» en coral", async ({
  page,
}) => {
  const { world, actors } = await listedClinicWithTeam("closed-ca34", 0);

  for (const actor of actors) {
    await openHome(page, world, actor.email);
    for (const booked of [0, 8, 9]) {
      await setMonthlyBookings(world.accountId, booked);
      await reloadHome(page);

      const label = `${actor.label} con ${booked}`;
      await expect(page.getByText(LINK_READY_TEXT), label).toBeVisible();
      await expect(page.getByText(LINK_CLOSED_TEXT), label).toHaveCount(0);
      await expect(copyLinkButton(page), label).toHaveCSS(
        "background-color",
        CORAL,
      );
    }
  }
});

test("CA-35: con el tope alcanzado y una sede sin médicos en el link, quien no atiende ve el aviso de siempre y no la fila del tope; el ADMIN ve además la tarjeta", async ({
  page,
}) => {
  const owner = await createOnboardedAdmin({ emailPrefix: "closed-ca35" });
  const organizationId = await createOrganizationResource(owner);
  const clinicId = await createClinicResourceViaPrisma(owner, organizationId, {
    name: uniqueName("Sede Paredes"),
  });
  const user = await createMemberWithRole({
    accountId: owner.accountId,
    resourceId: clinicId,
    role: "USER",
    createdBy: owner.userId,
    emailPrefix: "closed-ca35-usuario",
  });
  await addTeamMember(
    { accountId: owner.accountId, owner, clinicId },
    "DOCTOR",
  );
  await setMonthlyBookings(owner.accountId, 10);

  await openClinicDashboard(page, {
    email: owner.email,
    accountId: owner.accountId,
    clinicId,
  });
  await expect(linkNotice(page)).toBeVisible();
  await expect(page.getByText(LINK_CLOSED_TEXT)).toHaveCount(0);
  await expect(
    usageCard(page).getByRole("heading", {
      level: 2,
      name: REACHED_FREE_TITLE,
    }),
  ).toBeVisible();

  await page.context().clearCookies();
  await openClinicDashboard(page, {
    email: user.email,
    accountId: owner.accountId,
    clinicId,
  });
  await expect(linkNotice(page)).toBeVisible();
  await expect(page.getByText(LINK_CLOSED_TEXT)).toHaveCount(0);
  await expect(usageCard(page)).toHaveCount(0);
});

test("CA-36: un DOCTOR sin especialidad, con el link cerrado, ve la fila del tope y la guía con «ya tiene otros médicos»", async ({
  page,
}) => {
  const { world, actors } = await listedClinicWithTeam("closed-ca36", 10);
  const doctor = actors[1];

  await openHome(page, world, doctor.email);

  await expect(page.getByText(LINK_CLOSED_TEXT)).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Te faltan 2 pasos para aparecer en el link de reservas",
    }),
  ).toBeVisible();
  await expect(firstSteps(page)).toContainText(
    `El link de ${world.clinicName} ya tiene otros médicos.`,
  );
  await expect(firstSteps(page)).not.toContainText(
    "ya recibe citas con otros médicos",
  );
});

test("CA-36: un ADMIN que atiende y no aparece en el link, con el link cerrado, ve la fila del link, la guía y la tarjeta de uso, en ese orden", async ({
  page,
}) => {
  const legacy = await createLegacyOwnerClinic({
    emailPrefix: "closed-ca36-a",
  });
  await addListedDoctor(legacy.owner, legacy.organizationId, legacy.clinicId);
  await setMonthlyBookings(legacy.owner.accountId, 10);

  await openClinicDashboard(page, {
    email: legacy.owner.email,
    accountId: legacy.owner.accountId,
    clinicId: legacy.clinicId,
  });

  const row = page.getByText(LINK_CLOSED_TEXT);
  await expect(row).toBeVisible();
  await expect(firstSteps(page)).toBeVisible();
  await expect(usageCard(page)).toBeVisible();
  const [rowBox, guideBox, cardBox] = await Promise.all([
    boxOf(row),
    boxOf(firstSteps(page)),
    boxOf(usageCard(page)),
  ]);
  expect(rowBox.y).toBeLessThan(guideBox.y);
  expect(guideBox.y).toBeLessThan(cardBox.y);
});

test("CA-45: DOCTOR y USER, con 0, 8 y 10 contadas, no ven la tarjeta, números de uso, reservas perdidas, el «Pedir el plan» del tope ni los botones del número; en el tope ven solo la fila del link cerrado", async ({
  page,
}) => {
  const { world, actors } = await listedClinicWithTeam("closed-ca45", 0);
  await seedMissedBookings(world.accountId, world.clinicId, PATIENTS_WHO_TRIED);

  for (const actor of actors.filter(({ isAdmin }) => !isAdmin)) {
    await openHome(page, world, actor.email);
    for (const booked of [0, 8, 10]) {
      await setMonthlyBookings(world.accountId, booked);
      await reloadHome(page);

      const label = `${actor.label} con ${booked}`;
      await expect(usageCard(page), label).toHaveCount(0);
      await expect(page.getByText(/\bde 10\b/), label).toHaveCount(0);
      await expect(page.getByText(/citas de tu plan/), label).toHaveCount(0);
      await expect(
        page.getByText(/intentó reservar|intentaron reservar/),
        label,
      ).toHaveCount(0);
      await expect(planRequestLink(page, "Consultorio"), label).toHaveCount(0);
      await expect(addNumberButton(page), label).toHaveCount(0);
      await expect(changeNumberButton(page), label).toHaveCount(0);
      await expect(page.getByText(LINK_CLOSED_TEXT), label).toHaveCount(
        booked === 10 ? 1 : 0,
      );
    }
  }
});

test("CA-46: DOCTOR y USER siguen viendo, con 0, 80 % y tope contadas, el aviso de plan de las métricas con «Pedir el plan Clínica» en teal", async ({
  page,
}) => {
  const { world, actors } = await listedClinicWithTeam("closed-ca46", 0);
  const plans: Array<Exclude<PlanKey, "RED" | "CLINICA">> = [
    "FREE",
    "CONSULTORIO",
  ];

  for (const actor of actors.filter(({ isAdmin }) => !isAdmin)) {
    await openHome(page, world, actor.email);
    for (const plan of plans) {
      const cap = PLAN_CAPS[plan] as number;
      for (const booked of [0, nearCount(cap), cap]) {
        await setPlan(world.accountId, plan);
        await setMonthlyBookings(world.accountId, booked);
        await reloadHome(page);

        const label = `${actor.label} en ${plan} con ${booked}`;
        await expect(page.getByText(NO_PLAN_NOTICE), label).toBeVisible();
        await expect(planRequestLinks(page), label).toHaveCount(1);
        await expect(planRequestLink(page, "Clínica"), label).toHaveCSS(
          "background-color",
          TEAL,
        );
      }
    }
  }
});

test("CA-47: el ADMIN de Gratis o Consultorio ve el aviso de plan de las métricas por debajo del 80 %, y al 80 % y en el tope solo el «Pedir el plan» de la tarjeta", async ({
  page,
}) => {
  const world = await createListedClinic("closed-ca47");
  await openHome(page, world);
  const cases: Array<{ plan: PlanKey; cardOffer: string }> = [
    { plan: "FREE", cardOffer: "Consultorio" },
    { plan: "CONSULTORIO", cardOffer: "Clínica" },
  ];

  for (const { plan, cardOffer } of cases) {
    const cap = PLAN_CAPS[plan] as number;
    await setPlan(world.accountId, plan);

    await setMonthlyBookings(world.accountId, 0);
    await reloadHome(page);
    await expect(page.getByText(NO_PLAN_NOTICE), plan).toBeVisible();
    await expect(planRequestLinks(page), plan).toHaveCount(1);
    await expect(planRequestLink(page, "Clínica"), plan).toHaveCSS(
      "background-color",
      TEAL,
    );

    for (const booked of [nearCount(cap), cap]) {
      await setMonthlyBookings(world.accountId, booked);
      await reloadHome(page);

      const label = `${plan} con ${booked}`;
      await expect(page.getByText(NO_PLAN_NOTICE), label).toHaveCount(0);
      await expect(planRequestLinks(page), label).toHaveCount(1);
      await expect(
        planRequestLink(usageCard(page), cardOffer),
        label,
      ).toBeVisible();
    }
  }
});

test("CA-48: en el Inicio de una sede lista hay a lo sumo un elemento coral, según las citas contadas y el rol", async ({
  page,
}) => {
  const { world, actors } = await listedClinicWithTeam("closed-ca48", 0);
  const copyLink = "Copiar link de reservas";
  const requestPlan = "Pedir el plan Consultorio";
  const adminStates = [
    { booked: 0, coral: [copyLink] },
    { booked: 8, coral: [copyLink] },
    { booked: 10, coral: [requestPlan] },
  ];

  for (const actor of actors) {
    await openHome(page, world, actor.email);
    for (const { booked, coral } of adminStates) {
      await setMonthlyBookings(world.accountId, booked);
      await reloadHome(page);

      await expectOnlyCoral(page, actor.isAdmin || booked < 10 ? coral : []);
      if (booked === 10) {
        await expect(copyLinkButton(page)).toHaveCSS("background-color", WHITE);
      }
      if (booked === 8 && actor.isAdmin) {
        await expect(planRequestLink(page, "Consultorio")).toHaveCSS(
          "background-color",
          TEAL,
        );
      }
    }
  }
});

test("CA-48: con la guía y el link cerrado, el primer botón de la guía es teal y el único coral es «Pedir el plan»", async ({
  page,
}) => {
  const legacy = await createLegacyOwnerClinic({
    emailPrefix: "closed-ca48-g",
  });
  await addListedDoctor(legacy.owner, legacy.organizationId, legacy.clinicId);
  await setMonthlyBookings(legacy.owner.accountId, 10);

  await openClinicDashboard(page, {
    email: legacy.owner.email,
    accountId: legacy.owner.accountId,
    clinicId: legacy.clinicId,
  });

  await expect(firstSteps(page)).toBeVisible();
  await expect(
    stepLink(stepNamed(page, "Elige tu especialidad"), "Elegir especialidad"),
  ).toHaveCSS("background-color", TEAL);
  await expectOnlyCoral(page, ["Pedir el plan Consultorio"]);
});
