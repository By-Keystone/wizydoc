import { randomUUID } from "node:crypto";
import { test, expect } from "../../support/test";
import { getTestPrisma } from "../../support/db";
import {
  createClinicResource,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  inviteUserViaApi,
} from "../../support/accounts";
import {
  authPost,
  createConfirmedUser,
  uniqueEmail,
  uniqueName,
} from "../../support/users";

/** docs/features/beta-free-plan-only/plan.md — CA-1 a CA-7 y CA-15 ([e2e]). */

const BETA_REJECTION_MESSAGE =
  "Durante la beta sólo está disponible el plan Gratis";

const PAID_PLAN_WITH_CARD = {
  cardToken: "tkn_test_fake",
  billingAddress: "Av. Larco 123",
  billingCity: "Lima",
};

async function expectNoAccountCreated(accountName: string) {
  const prisma = await getTestPrisma();
  const account = await prisma.account.findFirst({
    where: { name: accountName },
  });
  expect(account).toBeNull();
}

async function expectUserWithoutAccount(userId: string) {
  const prisma = await getTestPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  expect(user?.accountId).toBeNull();
}

async function expectFreeActiveSubscription(accountId: string) {
  const prisma = await getTestPrisma();
  const subscription = await prisma.subscription.findUnique({
    where: { accountId },
  });
  expect(subscription?.plan).toBe("FREE");
  expect(subscription?.status).toBe("ACTIVE");
  expect(subscription?.paymentProviderCustomerId).toBeNull();
  expect(subscription?.paymentProviderCardId).toBeNull();
  expect(subscription?.paymentProviderSubscriptionId).toBeNull();
}

test.describe("Ninguna cuenta nueva nace con un plan distinto de Gratis", () => {
  test("CA-1: alta sin plan da Gratis, ACTIVE y sin datos de Culqi", async ({
    request,
  }) => {
    const { userId } = await createConfirmedUser(request, {
      emailPrefix: "ca1",
    });
    const accountName = uniqueName("Consultorio CA-1");

    const response = await authPost(request, "/account", { accountName });

    expect(response.status()).toBe(201);
    const { accountId } = (await response.json()) as { accountId: string };

    await expectFreeActiveSubscription(accountId);

    const prisma = await getTestPrisma();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.accountId).toBe(accountId);
    expect(user?.onboardingCompleted).toBe(true);
  });

  test("CA-2: alta con plan Gratis explícito da el mismo resultado que CA-1", async ({
    request,
  }) => {
    const { userId } = await createConfirmedUser(request, {
      emailPrefix: "ca2",
    });
    const accountName = uniqueName("Consultorio CA-2");

    const response = await authPost(request, "/account", {
      accountName,
      plan: "FREE",
    });

    expect(response.status()).toBe(201);
    const { accountId } = (await response.json()) as { accountId: string };

    await expectFreeActiveSubscription(accountId);

    const prisma = await getTestPrisma();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.accountId).toBe(accountId);
  });

  test("CA-3: Consultorio se rechaza aunque traiga tarjeta, dirección y ciudad válidas", async ({
    request,
  }) => {
    const { userId } = await createConfirmedUser(request, {
      emailPrefix: "ca3",
    });
    const accountName = uniqueName("Consultorio CA-3");

    const response = await authPost(request, "/account", {
      accountName,
      plan: "CONSULTORIO",
      ...PAID_PLAN_WITH_CARD,
    });

    expect(response.status()).toBe(400);
    const body = (await response.json()) as { message: string };
    expect(body.message).toContain(BETA_REJECTION_MESSAGE);

    await expectUserWithoutAccount(userId);
    await expectNoAccountCreated(accountName);
  });

  test("CA-4: Clínica se rechaza aunque traiga tarjeta, dirección y ciudad válidas", async ({
    request,
  }) => {
    const { userId } = await createConfirmedUser(request, {
      emailPrefix: "ca4",
    });
    const accountName = uniqueName("Consultorio CA-4");

    const response = await authPost(request, "/account", {
      accountName,
      plan: "CLINICA",
      ...PAID_PLAN_WITH_CARD,
    });

    expect(response.status()).toBe(400);
    const body = (await response.json()) as { message: string };
    expect(body.message).toContain(BETA_REJECTION_MESSAGE);

    await expectUserWithoutAccount(userId);
    await expectNoAccountCreated(accountName);
  });

  test("CA-5: Red se rechaza con y sin datos de tarjeta (cierra el plan Red gratis)", async ({
    request,
  }) => {
    const { userId } = await createConfirmedUser(request, {
      emailPrefix: "ca5",
    });

    const accountNameWithCard = uniqueName("Red CA-5 con tarjeta");
    const responseWithCard = await authPost(request, "/account", {
      accountName: accountNameWithCard,
      plan: "RED",
      ...PAID_PLAN_WITH_CARD,
    });
    expect(responseWithCard.status()).toBe(400);
    expect((await responseWithCard.json()).message).toContain(
      BETA_REJECTION_MESSAGE,
    );
    await expectNoAccountCreated(accountNameWithCard);

    const accountNameWithoutCard = uniqueName("Red CA-5 sin tarjeta");
    const responseWithoutCard = await authPost(request, "/account", {
      accountName: accountNameWithoutCard,
      plan: "RED",
    });
    expect(responseWithoutCard.status()).toBe(400);
    expect((await responseWithoutCard.json()).message).toContain(
      BETA_REJECTION_MESSAGE,
    );
    await expectNoAccountCreated(accountNameWithoutCard);

    await expectUserWithoutAccount(userId);
  });

  test("CA-6: valores de plan desconocidos se rechazan sin crear cuenta ni suscripción", async ({
    request,
  }) => {
    const { userId } = await createConfirmedUser(request, {
      emailPrefix: "ca6",
    });

    const unknownPlanValues: unknown[] = ["free", "PREMIUM", null, 42];

    for (const plan of unknownPlanValues) {
      const accountName = uniqueName("Consultorio CA-6");
      const response = await authPost(request, "/account", {
        accountName,
        plan,
      });

      expect(response.status(), `plan enviado: ${JSON.stringify(plan)}`).toBe(
        400,
      );
      await expectNoAccountCreated(accountName);
    }

    await expectUserWithoutAccount(userId);
  });

  test("CA-7: un rechazo no deja al usuario bloqueado; el siguiente alta sin plan da Gratis", async ({
    request,
  }) => {
    const { userId } = await createConfirmedUser(request, {
      emailPrefix: "ca7",
    });

    const rejectedResponse = await authPost(request, "/account", {
      accountName: uniqueName("Consultorio CA-7 rechazado"),
      plan: "CONSULTORIO",
      ...PAID_PLAN_WITH_CARD,
    });
    expect(rejectedResponse.status()).toBe(400);

    const acceptedResponse = await authPost(request, "/account", {
      accountName: uniqueName("Consultorio CA-7 aceptado"),
    });
    expect(acceptedResponse.status()).toBe(201);
    const { accountId } = (await acceptedResponse.json()) as {
      accountId: string;
    };

    await expectFreeActiveSubscription(accountId);

    const prisma = await getTestPrisma();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.accountId).toBe(accountId);
  });
});

test.describe("Las cuentas existentes no cambian", () => {
  test("CA-15: una cuenta de pago sembrada por Prisma conserva su plan, su suscripción de Culqi y sus capacidades", async () => {
    const admin = await createOnboardedAdmin({
      emailPrefix: "ca15-consultorio",
    });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA15"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA-15"),
    });
    const specialtyId = await createSpecialty(
      admin,
      organizationId,
      uniqueName("Especialidad CA-15"),
    );

    const prisma = await getTestPrisma();

    // Simula una suscripción real de Culqi, como las que el humano revisa antes de desplegar (D5).
    await prisma.subscription.update({
      where: { accountId: admin.accountId },
      data: {
        plan: "CONSULTORIO",
        status: "ACTIVE",
        extraDoctors: 1,
        extraClinics: 0,
        paymentProviderCustomerId: `cus_test_${randomUUID()}`,
        paymentProviderCardId: `card_test_${randomUUID()}`,
        paymentProviderSubscriptionId: `sub_test_${randomUUID()}`,
      },
    });

    // Y dos cuentas "asignadas a mano" (payment_provider_* en null, ver plan.md), para
    // comprobar que una acción ajena no cambia por accidente la fila de otra cuenta.
    const otherSeededAccountIds = await Promise.all(
      (["CLINICA", "RED"] as const).map(async (plan) => {
        const otherAdmin = await createOnboardedAdmin({
          emailPrefix: `ca15-${plan.toLowerCase()}`,
        });
        await prisma.subscription.update({
          where: { accountId: otherAdmin.accountId },
          data: { plan, status: "ACTIVE", extraDoctors: 0, extraClinics: 0 },
        });
        return otherAdmin.accountId;
      }),
    );

    const seededAccountIds = [admin.accountId, ...otherSeededAccountIds];
    const subscriptionsBefore = await Promise.all(
      seededAccountIds.map((accountId) =>
        prisma.subscription.findUnique({ where: { accountId } }),
      ),
    );

    // Gratis sólo incluye 1 médico (entitlements.ts): el segundo sólo entra porque la
    // cuenta quedó en Consultorio (3 médicos + 1 adicional sembrado arriba).
    await inviteUserViaApi(admin, {
      email: uniqueEmail("ca15-doctor-1"),
      name: "Doctor",
      lastName: "Uno",
      phone: "+51955555501",
      role: "DOCTOR",
      resourceId: clinicId,
      specialtyIds: [specialtyId],
    });
    const secondDoctorResponse = await inviteUserViaApi(admin, {
      email: uniqueEmail("ca15-doctor-2"),
      name: "Doctor",
      lastName: "Dos",
      phone: "+51955555502",
      role: "DOCTOR",
      resourceId: clinicId,
      specialtyIds: [specialtyId],
    });
    expect(secondDoctorResponse.status()).toBe(200);

    const subscriptionsAfter = await Promise.all(
      seededAccountIds.map((accountId) =>
        prisma.subscription.findUnique({ where: { accountId } }),
      ),
    );
    expect(subscriptionsAfter).toEqual(subscriptionsBefore);
  });
});
