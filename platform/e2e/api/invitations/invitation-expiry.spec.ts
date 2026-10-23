import { randomBytes } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "../../support/test";
import { API_BASE_URL } from "../../support/env";
import {
  createApiContext,
  createClinicResource,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  type OnboardedAdmin,
} from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { readEmailsTo } from "../../support/email";
import {
  ageInvitationIssuance,
  backdateInvitationExpiry,
  markInvitationAcceptedWithoutCredential,
  getInvitationByToken,
  getInvitationTokenOf,
  markInvitationExpiredStatus,
  softDeleteMembership,
} from "../../support/invitations";
import {
  authPost,
  E2E_PASSWORD,
  uniqueEmail,
  uniqueName,
} from "../../support/users";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TOLERANCE_MS = 2 * 60 * 1000;
const EXPIRED_BODY = {
  message:
    "Este link expiró. Pide al administrador que te envíe una invitación nueva.",
};
const INVALID_BODY = {
  message: "El enlace de invitación no es válido o ya expiró",
};

type Scope = "clinic" | "organization";

interface Fixture {
  admin: OnboardedAdmin;
  organizationId: string;
  clinicId: string;
  specialtyId: string;
}

async function setupFixture(): Promise<Fixture> {
  const admin = await createOnboardedAdmin({ emailPrefix: "admin-expiry" });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName("ORG-EXP"),
  );
  const clinicId = await createClinicResource(admin, organizationId, {
    name: uniqueName("Sede EXP"),
  });
  const specialtyId = await createSpecialty(admin, organizationId);
  return { admin, organizationId, clinicId, specialtyId };
}

function resourceIdOf(fixture: Fixture, scope: Scope) {
  return scope === "clinic" ? fixture.clinicId : fixture.organizationId;
}

function invite(
  fixture: Fixture,
  scope: Scope,
  email: string,
  overrides: Record<string, unknown> = {},
) {
  return fixture.admin.context.post(
    `${API_BASE_URL}/${scope}/${resourceIdOf(fixture, scope)}/invitations`,
    {
      data: {
        email,
        name: "Marta",
        lastName: "Quispe",
        phone: "+51999777666",
        role: "USER",
        ...overrides,
      },
    },
  );
}

function verify(context: APIRequestContext, token: string) {
  return context.get(`${API_BASE_URL}/invitations/${token}`);
}

function setPassword(context: APIRequestContext, token: string) {
  return authPost(context, "/invitations/set-password", {
    token,
    password: E2E_PASSWORD,
  });
}

async function countMembershipsAndProfiles(email: string) {
  const prisma = await getTestPrisma();
  const [memberships, doctorProfiles] = await Promise.all([
    prisma.userResourceMembership.count({ where: { user: { email } } }),
    prisma.doctorProfile.count({ where: { membership: { user: { email } } } }),
  ]);
  return { memberships, doctorProfiles };
}

for (const scope of ["clinic", "organization"] as const) {
  test.describe(`Vencimiento de la invitación a la ${scope === "clinic" ? "sede" : "organización"}`, () => {
    test("una invitación nueva vence en un día", async () => {
      const fixture = await setupFixture();
      const email = uniqueEmail("vence-1d");

      expect((await invite(fixture, scope, email)).status()).toBe(200);

      const token = await getInvitationTokenOf(
        email,
        resourceIdOf(fixture, scope),
      );
      const { expiresAt } = await getInvitationByToken(token);
      expect(
        Math.abs(expiresAt.getTime() - (Date.now() + ONE_DAY_MS)),
      ).toBeLessThan(TOLERANCE_MS);
    });

    for (const [label, expire] of [
      ["pendiente emitida hace tiempo", ageInvitationIssuance],
      ["vencida por fecha", backdateInvitationExpiry],
      ["con estado EXPIRED", markInvitationExpiredStatus],
    ] as const) {
      test(`reinvitar a alguien con invitación ${label} la renueva: token nuevo, un solo correo nuevo y una sola membership`, async () => {
        const fixture = await setupFixture();
        const email = uniqueEmail("renueva");
        const role = scope === "clinic" ? "DOCTOR" : "USER";
        const extra =
          scope === "clinic" ? { specialtyIds: [fixture.specialtyId] } : {};
        const resourceId = resourceIdOf(fixture, scope);

        expect(
          (await invite(fixture, scope, email, { role, ...extra })).status(),
        ).toBe(200);
        const oldToken = await getInvitationTokenOf(email, resourceId);
        await expire(oldToken);
        const emailsBefore = readEmailsTo(email).length;
        const before = await countMembershipsAndProfiles(email);

        const response = await invite(fixture, scope, email, {
          role,
          ...extra,
          name: "Otro",
          phone: "+51900000000",
        });
        expect(response.status()).toBe(200);

        const newToken = await getInvitationTokenOf(email, resourceId);
        expect(newToken).not.toBe(oldToken);
        expect(await countMembershipsAndProfiles(email)).toEqual(before);
        expect(readEmailsTo(email)).toHaveLength(emailsBefore + 1);
        expect(readEmailsTo(email).at(-1)?.html).toContain(newToken);

        const renewed = await getInvitationByToken(newToken);
        expect(renewed.status).toBe("INVITED");
        expect(
          Math.abs(renewed.expiresAt.getTime() - (Date.now() + ONE_DAY_MS)),
        ).toBeLessThan(TOLERANCE_MS);

        const prisma = await getTestPrisma();
        expect(
          await prisma.user.findUnique({ where: { email } }),
        ).toMatchObject({ name: "Marta", phone: "+51999777666" });

        const anonymous = await createApiContext();
        const oldResponse = await setPassword(anonymous, oldToken);
        expect(oldResponse.status()).toBe(400);
        expect(await oldResponse.json()).toEqual(INVALID_BODY);

        expect((await setPassword(anonymous, newToken)).status()).toBe(200);
      });
    }

    test("al guardar con otro rol, el rol cambia y con DOCTOR se crea el perfil", async () => {
      const fixture = await setupFixture();
      const email = uniqueEmail("rol-nuevo");
      const resourceId = resourceIdOf(fixture, scope);
      expect((await invite(fixture, scope, email)).status()).toBe(200);
      await ageInvitationIssuance(
        await getInvitationTokenOf(email, resourceId),
      );
      const newRole = scope === "clinic" ? "DOCTOR" : "ADMIN";
      const extra =
        scope === "clinic" ? { specialtyIds: [fixture.specialtyId] } : {};

      const response = await invite(fixture, scope, email, {
        role: newRole,
        ...extra,
      });

      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ outcome: "updated" });
      const prisma = await getTestPrisma();
      const membership = await prisma.userResourceMembership.findFirst({
        where: { resourceId, user: { email } },
      });
      expect(membership?.role).toBe(newRole);
      expect((await countMembershipsAndProfiles(email)).doctorProfiles).toBe(
        scope === "clinic" ? 1 : 0,
      );
    });

    test("guardar dos veces seguidas responde 200 sin correo ni cambio de token; pasado el enfriamiento reenvía", async () => {
      const fixture = await setupFixture();
      const email = uniqueEmail("enfriamiento");
      const resourceId = resourceIdOf(fixture, scope);
      expect((await invite(fixture, scope, email)).status()).toBe(200);
      const token = await getInvitationTokenOf(email, resourceId);
      const emailsBefore = readEmailsTo(email).length;

      const response = await invite(fixture, scope, email);

      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({
        outcome: "updated",
        invitationSent: false,
      });
      expect(await getInvitationTokenOf(email, resourceId)).toBe(token);
      expect(readEmailsTo(email)).toHaveLength(emailsBefore);

      await ageInvitationIssuance(token);
      const resent = await invite(fixture, scope, email);
      expect(resent.status()).toBe(200);
      expect(await resent.json()).toMatchObject({ invitationSent: true });
      expect(await getInvitationTokenOf(email, resourceId)).not.toBe(token);
      expect(readEmailsTo(email)).toHaveLength(emailsBefore + 1);
    });

    test("guardar a quien tiene la invitación aceptada sin credencial responde 200 sin correo ni cambio de la invitación", async () => {
      const fixture = await setupFixture();
      const email = uniqueEmail("aceptada-prisma");
      const resourceId = resourceIdOf(fixture, scope);
      expect((await invite(fixture, scope, email)).status()).toBe(200);
      const token = await getInvitationTokenOf(email, resourceId);
      await markInvitationAcceptedWithoutCredential(token);
      const emailsBefore = readEmailsTo(email).length;

      const response = await invite(fixture, scope, email);

      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ invitationSent: false });
      const invitation = await getInvitationByToken(token);
      expect(invitation.status).toBe("ACCEPTED");
      expect(readEmailsTo(email)).toHaveLength(emailsBefore);
    });

    test("guardar a quien ya aceptó responde 200 «updated», sin correo y con sólo las claves del resultado", async () => {
      const fixture = await setupFixture();
      const email = uniqueEmail("ya-miembro");
      const resourceId = resourceIdOf(fixture, scope);
      expect((await invite(fixture, scope, email)).status()).toBe(200);
      const token = await getInvitationTokenOf(email, resourceId);
      expect(
        (await setPassword(await createApiContext(), token)).status(),
      ).toBe(200);
      const emailsBefore = readEmailsTo(email).length;

      const response = await invite(fixture, scope, email);

      expect(response.status()).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual([
        "invitationSent",
        "message",
        "outcome",
      ]);
      expect(body).toMatchObject({ outcome: "updated", invitationSent: false });
      expect(await getInvitationTokenOf(email, resourceId)).toBe(token);
      expect((await getInvitationByToken(token)).status).toBe("ACCEPTED");
      expect(readEmailsTo(email)).toHaveLength(emailsBefore);
    });

    test("asignar a alguien con la membership borrada la revive: la misma membership, viva", async () => {
      const fixture = await setupFixture();
      const email = uniqueEmail("borrado");
      const resourceId = resourceIdOf(fixture, scope);
      expect((await invite(fixture, scope, email)).status()).toBe(200);
      const token = await getInvitationTokenOf(email, resourceId);
      const { membershipId } = await getInvitationByToken(token);
      await softDeleteMembership(membershipId);

      const response = await invite(fixture, scope, email);

      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ outcome: "revived" });
      const prisma = await getTestPrisma();
      const aliveMembership = await prisma.userResourceMembership.findFirst({
        where: { id: membershipId, deletedAt: null },
      });
      expect(aliveMembership).not.toBeNull();
    });
  });
}

test("en Gratis se asignan varios médicos sin 402", async () => {
  const fixture = await setupFixture();
  const doctorBody = { role: "DOCTOR", specialtyIds: [fixture.specialtyId] };

  for (const prefix of ["primer-medico", "segundo-medico", "tercer-medico"]) {
    const response = await invite(
      fixture,
      "clinic",
      uniqueEmail(prefix),
      doctorBody,
    );
    expect(response.status()).toBe(200);
  }
});

test.describe("Respuesta del api ante un link vencido", () => {
  test("sólo el link vencido sin aceptar responde distinto, sin datos de la invitación", async () => {
    const fixture = await setupFixture();
    const dateExpiredEmail = uniqueEmail("vencida-fecha");
    const statusExpiredEmail = uniqueEmail("vencida-estado");
    const deletedEmail = uniqueEmail("borrada");
    for (const email of [dateExpiredEmail, statusExpiredEmail, deletedEmail]) {
      expect((await invite(fixture, "clinic", email)).status()).toBe(200);
    }
    const tokenOf = (email: string) =>
      getInvitationTokenOf(email, fixture.clinicId);
    const dateExpiredToken = await tokenOf(dateExpiredEmail);
    const statusExpiredToken = await tokenOf(statusExpiredEmail);
    const deletedToken = await tokenOf(deletedEmail);
    await backdateInvitationExpiry(dateExpiredToken);
    await markInvitationExpiredStatus(statusExpiredToken);
    await softDeleteMembership(
      (await getInvitationByToken(deletedToken)).membershipId,
    );
    const anonymous = await createApiContext();

    for (const token of [dateExpiredToken, statusExpiredToken]) {
      const response = await verify(anonymous, token);
      expect(response.status()).toBe(410);
      expect(await response.json()).toEqual(EXPIRED_BODY);
    }
    expect((await getInvitationByToken(dateExpiredToken)).status).toBe(
      "EXPIRED",
    );

    const unknown = await verify(anonymous, randomBytes(32).toString("hex"));
    const deleted = await verify(anonymous, deletedToken);
    expect(unknown.status()).toBe(404);
    expect(deleted.status()).toBe(400);
    expect(await unknown.json()).toEqual(INVALID_BODY);
    expect(await deleted.json()).toEqual(INVALID_BODY);
  });

  test("un token inexistente y uno ya usado responden idéntico al fijar la contraseña", async () => {
    const fixture = await setupFixture();
    const email = uniqueEmail("usado");
    expect((await invite(fixture, "clinic", email)).status()).toBe(200);
    const usedToken = await getInvitationTokenOf(email, fixture.clinicId);
    expect(
      (await setPassword(await createApiContext(), usedToken)).status(),
    ).toBe(200);

    const used = await setPassword(await createApiContext(), usedToken);
    const unknown = await setPassword(
      await createApiContext(),
      randomBytes(32).toString("hex"),
    );

    expect(used.status()).toBe(400);
    expect(unknown.status()).toBe(400);
    expect(await used.json()).toEqual(INVALID_BODY);
    expect(await unknown.json()).toEqual(INVALID_BODY);
  });
});
