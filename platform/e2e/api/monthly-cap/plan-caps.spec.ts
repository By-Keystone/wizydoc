import { createSpecialty, inviteUserViaApi } from "../../support/accounts";
import { readEmailsTo } from "../../support/email";
import { API_BASE_URL } from "../../support/env";
import {
  BOOKING_CLOSED_BODY,
  bookSuccessfully,
  createListedClinic,
  fetchBookingStatus,
  fetchUsage,
  type PlanKey,
  PLAN_CAPS,
  PLAN_LABELS,
  postBookingTo,
  readMonthlyBookings,
  removeSubscription,
  setPlan,
  slotInDays,
} from "../../support/monthly-cap";
import { expect, test } from "../../support/test";
import { uniqueEmail } from "../../support/users";

// docs/features/tope-citas-mes/plan.md: CA-15, CA-16, CA-19 y CA-75.

const RED_BOOKED_BEFORE = 5_000;
const DOCTORS_INVITED_ON_FREE = 3;

const PAID_PLANS_WITH_CAP: Array<{ plan: PlanKey; bookedBefore: number }> = [
  { plan: "CONSULTORIO", bookedBefore: 149 },
  { plan: "CLINICA", bookedBefore: 599 },
];

for (const { plan, bookedBefore } of PAID_PLANS_WITH_CAP) {
  test(`CA-15: en ${PLAN_LABELS[plan]}, con ${bookedBefore} contadas la reserva siguiente entra y la que sigue recibe 409 BOOKING_CLOSED`, async () => {
    const world = await createListedClinic(`cap-ca15-${plan.toLowerCase()}`, {
      plan,
      booked: bookedBefore,
    });

    await bookSuccessfully(world, 2);

    expect(await readMonthlyBookings(world.accountId)).toBe(PLAN_CAPS[plan]);
    const refused = await postBookingTo(world, slotInDays(3));
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toEqual(BOOKING_CLOSED_BODY);
    expect((await fetchBookingStatus(world.clinicId)).isAcceptingBookings).toBe(
      false,
    );
  });
}

test("CA-15: en Red, con 5,000 contadas la reserva entra, el link sigue abierto y el uso no trae tope", async () => {
  const world = await createListedClinic("cap-ca15-red", {
    plan: "RED",
    booked: RED_BOOKED_BEFORE,
  });

  await bookSuccessfully(world, 2);

  expect(await readMonthlyBookings(world.accountId)).toBe(
    RED_BOOKED_BEFORE + 1,
  );
  expect((await fetchBookingStatus(world.clinicId)).isAcceptingBookings).toBe(
    true,
  );
  const usage = await fetchUsage(world.owner.context, world.clinicId);
  expect(usage).toMatchObject({
    plan: "RED",
    monthlyCap: null,
    nextPlan: null,
  });
});

test("CA-16: una cuenta sin suscripción y una de Consultorio con la suscripción cancelada, con 10 contadas, tienen el link cerrado", async () => {
  const withoutSubscription = await createListedClinic("cap-ca16-sin", {
    booked: 10,
  });
  await removeSubscription(withoutSubscription.accountId);
  const cancelled = await createListedClinic("cap-ca16-cancelada", {
    plan: "CONSULTORIO",
    booked: 10,
  });
  await setPlan(cancelled.accountId, "CONSULTORIO", "CANCELLED");

  for (const world of [withoutSubscription, cancelled]) {
    expect((await fetchBookingStatus(world.clinicId)).isAcceptingBookings).toBe(
      false,
    );
    const refused = await postBookingTo(world, slotInDays(2));
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toEqual(BOOKING_CLOSED_BODY);
  }
  const usage = await fetchUsage(cancelled.owner.context, cancelled.clinicId);
  expect(usage).toMatchObject({ plan: "FREE", monthlyCap: 10 });
});

test("CA-19: un cambio de plan no envía correos, tampoco si cierra o abre el link", async () => {
  const world = await createListedClinic("cap-ca19", { booked: 10 });
  const emailsBefore = readEmailsTo(world.owner.email).length;
  const changes: Array<{ plan: PlanKey; isOpen: boolean }> = [
    { plan: "CONSULTORIO", isOpen: true },
    { plan: "FREE", isOpen: false },
    { plan: "CLINICA", isOpen: true },
    { plan: "RED", isOpen: true },
    { plan: "FREE", isOpen: false },
  ];

  for (const { plan, isOpen } of changes) {
    await setPlan(world.accountId, plan);

    const status = await fetchBookingStatus(world.clinicId);
    expect(status.isAcceptingBookings, plan).toBe(isOpen);
    await fetchUsage(world.owner.context, world.clinicId);
  }

  expect(readEmailsTo(world.owner.email)).toHaveLength(emailsBefore);
});

test("CA-75: una cuenta Gratis invita a tres médicos a su sede sin 402 y GET /user/me trae monthlyAppointmentCap sin maxDoctors", async () => {
  const world = await createListedClinic("cap-ca75");
  const specialtyId = await createSpecialty(world.owner, world.organizationId);

  for (let index = 1; index <= DOCTORS_INVITED_ON_FREE; index++) {
    const response = await inviteUserViaApi(world.owner, {
      email: uniqueEmail(`cap-ca75-medico-${index}`),
      name: "Nora",
      lastName: `Vega ${index}`,
      phone: "+51933333333",
      role: "DOCTOR",
      resourceId: world.clinicId,
      specialtyIds: [specialtyId],
    });

    expect(response.status()).toBe(200);
  }

  const me = await world.owner.context.get(`${API_BASE_URL}/user/me`);
  expect(me.status()).toBe(200);
  const { entitlements } = (await me.json()) as {
    entitlements: Record<string, unknown>;
  };
  expect(entitlements.monthlyAppointmentCap).toBe(10);
  expect(entitlements).not.toHaveProperty("maxDoctors");
});
