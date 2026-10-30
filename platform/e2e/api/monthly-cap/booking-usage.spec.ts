import { randomUUID } from "node:crypto";
import { createApiContext, createMemberWithRole } from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { API_BASE_URL } from "../../support/env";
import {
  addTeamMember,
  bookSuccessfully,
  createListedClinic,
  fetchUsage,
  nextMonth,
  currentMonth,
  seedMissedBookings,
  setPlan,
} from "../../support/monthly-cap";
import { expect, test } from "../../support/test";
import { createConfirmedUser } from "../../support/users";

// docs/features/tope-citas-mes/plan.md: CA-70.

const USAGE_PATH = (clinicId: string) =>
  `${API_BASE_URL}/clinic/${clinicId}/booking-usage`;
const USAGE_KEYS = [
  "bookedThisMonth",
  "month",
  "monthlyCap",
  "missedThisMonth",
  "nextPlan",
  "patientContact",
  "plan",
  "renewsOn",
];

test("CA-70: el ADMIN recibe 200 con las claves del plan, los números de su cuenta y nada de pacientes", async () => {
  const world = await createListedClinic("usage-ca70", { booked: 4 });
  await seedMissedBookings(world.accountId, world.clinicId, 2);
  const patient = await bookSuccessfully(world, 2);

  const response = await world.owner.context.get(USAGE_PATH(world.clinicId));

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(Object.keys(body).sort()).toEqual([...USAGE_KEYS].sort());
  expect(body).toEqual({
    plan: "FREE",
    monthlyCap: 10,
    month: currentMonth(),
    renewsOn: `${nextMonth()}-01`,
    bookedThisMonth: 5,
    missedThisMonth: 2,
    nextPlan: { plan: "CONSULTORIO", monthlyCap: 150 },
    patientContact: null,
  });
  const text = JSON.stringify(body);
  for (const personalData of [
    patient.name,
    patient.lastName,
    patient.email,
    patient.documentNumber,
    patient.phone,
    world.accountId,
    world.clinicId,
  ]) {
    expect(text).not.toContain(personalData);
  }
});

test("CA-70: en Clínica el plan siguiente es Red sin tope, y en Red monthlyCap y nextPlan son null", async () => {
  const world = await createListedClinic("usage-ca70-planes", {
    plan: "CLINICA",
  });

  const clinica = await fetchUsage(world.owner.context, world.clinicId);
  expect(clinica).toMatchObject({
    plan: "CLINICA",
    monthlyCap: 600,
    nextPlan: { plan: "RED", monthlyCap: null },
  });

  await setPlan(world.accountId, "RED");

  const red = await fetchUsage(world.owner.context, world.clinicId);
  expect(red).toMatchObject({ plan: "RED", monthlyCap: null, nextPlan: null });
});

test("CA-70: el ADMIN de la sede y el ADMIN de su organización reciben 200", async () => {
  const world = await createListedClinic("usage-ca70-admins", { booked: 3 });
  const clinicAdmin = await addTeamMember(world, "ADMIN");
  const organizationAdmin = await addTeamMember(
    world,
    "ADMIN",
    world.organizationId,
  );

  for (const admin of [clinicAdmin, organizationAdmin]) {
    const usage = await fetchUsage(admin.context, world.clinicId);

    expect(usage.bookedThisMonth).toBe(3);
  }
});

test("CA-70: DOCTOR y USER reciben 403; una sede de otra cuenta, el id de una organización y un UUID inexistente, 404; sin sesión, 401; y los cuerpos de error no traen ids, nombres ni correos", async () => {
  const world = await createListedClinic("usage-ca70-roles");
  const outsider = await createListedClinic("usage-ca70-ajena");
  const doctor = await addTeamMember(world, "DOCTOR");
  const user = await addTeamMember(world, "USER");
  const anonymous = await createApiContext();
  const revealing = [
    world.accountId,
    world.clinicId,
    world.organizationId,
    world.clinicName,
    world.owner.email,
    world.owner.name,
    outsider.clinicName,
    outsider.owner.email,
  ];

  const rejections = [
    {
      response: await doctor.context.get(USAGE_PATH(world.clinicId)),
      status: 403,
    },
    {
      response: await user.context.get(USAGE_PATH(world.clinicId)),
      status: 403,
    },
    {
      response: await outsider.owner.context.get(USAGE_PATH(world.clinicId)),
      status: 404,
    },
    {
      response: await world.owner.context.get(USAGE_PATH(world.organizationId)),
      status: 404,
    },
    {
      response: await world.owner.context.get(USAGE_PATH(randomUUID())),
      status: 404,
    },
    { response: await anonymous.get(USAGE_PATH(world.clinicId)), status: 401 },
  ];

  for (const { response, status } of rejections) {
    expect(response.status()).toBe(status);
    const text = await response.text();
    for (const value of revealing) expect(text).not.toContain(value);
  }
});

test("CA-70: sin cuenta, sin el correo confirmado o sin onboarding la respuesta es 403", async () => {
  const world = await createListedClinic("usage-ca70-sesion");
  const prisma = await getTestPrisma();
  const withoutAccount = await createApiContext();
  await createConfirmedUser(withoutAccount, {
    emailPrefix: "usage-sin-cuenta",
  });
  const unconfirmed = await createMemberWithRole({
    accountId: world.accountId,
    resourceId: world.clinicId,
    role: "ADMIN",
    createdBy: world.owner.userId,
    emailPrefix: "usage-sin-confirmar",
  });
  await prisma.user.update({
    where: { id: unconfirmed.userId },
    data: { confirmed: false },
  });
  const notOnboarded = await createMemberWithRole({
    accountId: world.accountId,
    resourceId: world.clinicId,
    role: "ADMIN",
    createdBy: world.owner.userId,
    emailPrefix: "usage-sin-onboarding",
  });
  await prisma.user.update({
    where: { id: notOnboarded.userId },
    data: { onboardingCompleted: false },
  });

  for (const context of [
    withoutAccount,
    unconfirmed.context,
    notOnboarded.context,
  ]) {
    const response = await context.get(USAGE_PATH(world.clinicId));

    expect(response.status()).toBe(403);
  }
});
