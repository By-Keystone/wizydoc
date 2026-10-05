import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "../../support/test";
import { API_BASE_URL, PLATFORM_BASE_URL } from "../../support/env";
import {
  createApiContext,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
} from "../../support/accounts";
import { createConfirmedUser, uniqueName } from "../../support/users";
import { getTestPrisma } from "../../support/db";

/** docs/features/fix-account-setup-once/plan.md — CA-1 a CA-6 ([e2e]); CA-7 es [manual]. */

function postAccount(
  context: APIRequestContext,
  accountName: string = uniqueName("Consultorio"),
) {
  return context.post(`${API_BASE_URL}/account`, { data: { accountName } });
}

function getMe(context: APIRequestContext) {
  return context.get(`${API_BASE_URL}/user/me`);
}

test.describe("Lo que deja de ser posible", () => {
  test("CA-1: un dueño con cuenta recibe 409 al llamar otra vez a POST /account, y su cuenta y suscripción no cambian", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "owner-ca1" });

    const response = await postAccount(admin.context);

    expect(response.status()).toBe(409);
    expect(await response.json()).toEqual({
      message: "Tu usuario ya pertenece a una cuenta",
      code: "CONFLICT",
    });

    const meResponse = await getMe(admin.context);
    expect((await meResponse.json()).accountId).toBe(admin.accountId);

    const prisma = await getTestPrisma();
    expect(
      await prisma.account.count({ where: { ownerId: admin.userId } }),
    ).toBe(1);
    expect(
      await prisma.subscription.count({
        where: { accountId: admin.accountId },
      }),
    ).toBe(1);
  });

  for (const role of ["USER", "DOCTOR"] as const) {
    test(`CA-2: un miembro ${role} invitado recibe 409 al llamar a POST /account y no se vuelve dueño de nada`, async () => {
      const admin = await createOnboardedAdmin({
        emailPrefix: `owner-ca2-${role.toLowerCase()}`,
      });
      const organizationId = await createOrganizationResource(admin);
      const member = await createMemberWithRole({
        accountId: admin.accountId,
        resourceId: organizationId,
        role,
        createdBy: admin.userId,
        emailPrefix: `member-ca2-${role.toLowerCase()}`,
      });

      const response = await postAccount(member.context);

      expect(response.status()).toBe(409);

      const meResponse = await getMe(member.context);
      expect((await meResponse.json()).accountId).toBe(admin.accountId);

      const prisma = await getTestPrisma();
      expect(
        await prisma.account.count({ where: { ownerId: member.userId } }),
      ).toBe(0);
      const originalAccount = await prisma.account.findFirst({
        where: { id: admin.accountId },
      });
      expect(originalAccount?.ownerId).toBe(admin.userId);
    });
  }

  test("CA-3: dos POST /account simultáneos del mismo usuario dejan un 201 y un 409, y una sola cuenta con una sola suscripción", async () => {
    const context = await createApiContext();
    const { userId } = await createConfirmedUser(context, {
      emailPrefix: "race-ca3",
    });

    const [first, second] = await Promise.all([
      postAccount(context, uniqueName("Carrera A")),
      postAccount(context, uniqueName("Carrera B")),
    ]);

    expect([first.status(), second.status()].sort()).toEqual([201, 409]);

    const prisma = await getTestPrisma();
    expect(await prisma.account.count({ where: { ownerId: userId } })).toBe(1);

    const account = await prisma.account.findFirst({
      where: { ownerId: userId },
    });
    expect(
      await prisma.subscription.count({ where: { accountId: account!.id } }),
    ).toBe(1);
  });
});

test.describe("Lo que sigue funcionando", () => {
  test("CA-4: un usuario confirmado sin cuenta sigue creando la suya en un solo POST /account", async () => {
    const context = await createApiContext();
    const { userId } = await createConfirmedUser(context, {
      emailPrefix: "onboarding-ca4",
    });

    const response = await postAccount(context, uniqueName("Consultorio CA-4"));

    expect(response.status()).toBe(201);
    const { accountId } = (await response.json()) as { accountId: string };

    const prisma = await getTestPrisma();
    expect(await prisma.account.count({ where: { ownerId: userId } })).toBe(1);
    expect(await prisma.subscription.count({ where: { accountId } })).toBe(1);
  });

  test("CA-5: un usuario con cuenta que abre /onboarding es redirigido fuera del formulario", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "owner-ca5" });

    const response = await admin.context.get(
      `${PLATFORM_BASE_URL}/onboarding`,
      {
        maxRedirects: 0,
      },
    );

    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    const location = response.headers()["location"] ?? "";
    expect(location).not.toContain("/onboarding");
    expect(location).toContain(admin.accountId);
  });
});

test.describe("Lo que no debe filtrarse", () => {
  test("CA-6: el 409 de un dueño que ya tiene cuenta sólo trae message y code", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "owner-ca6" });

    const response = await postAccount(admin.context);

    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["code", "message"]);
    expect(body).not.toHaveProperty("accountId");
    expect(body).not.toHaveProperty("name");
    expect(body).not.toHaveProperty("plan");
  });
});
