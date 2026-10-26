import type { APIResponse } from "@playwright/test";
import {
  createApiContext,
  createClinicResource,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  type OnboardedAdmin,
} from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { readEmailsTo } from "../../support/email";
import { API_BASE_URL } from "../../support/env";
import {
  createOwnerWithFirstClinic,
  newFirstClinicBody,
  postFirstClinic,
  readAccountFootprint,
  readFirstClinicRecords,
} from "../../support/first-use";
import { expect, test } from "../../support/test";
import { createConfirmedUser, uniqueName } from "../../support/users";

// docs/features/primer-uso/plan.md CA-7 a CA-11 y CA-41 a CA-48.

const ALREADY_CREATED = "Tu consultorio ya está creado";
const OWNER_ONLY = "Sólo el dueño de la cuenta puede crear su consultorio";
const NAME_REQUIRED = "Escribe el nombre de tu consultorio.";
const ADDRESS_REQUIRED = "Escribe la dirección de tu consultorio.";
const SPECIALTY_REQUIRED = "Escribe tu especialidad.";
const NAME_TOO_LONG =
  "El nombre del consultorio no puede tener más de 100 caracteres.";
const ADDRESS_TOO_LONG = "La dirección no puede tener más de 200 caracteres.";
const SPECIALTY_TOO_LONG =
  "La especialidad no puede tener más de 100 caracteres.";

async function bodyText(response: APIResponse): Promise<string> {
  return JSON.stringify(await response.json());
}

async function expectIdentityFreeBody(
  response: APIResponse,
  forbiddenFragments: string[],
) {
  const body = (await response.json()) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["code", "message"]);
  const text = JSON.stringify(body);
  for (const fragment of forbiddenFragments) {
    expect(text).not.toContain(fragment);
  }
}

test.describe("Lo que crea el dueño sin organización (CA-41, CA-7 a CA-11)", () => {
  test("CA-41, CA-7 a CA-10: 201 con sólo los dos ids; cuenta, organización, sede, médico y especialidad recortados, sin teléfono ni correo", async () => {
    const owner = await createOnboardedAdmin({
      emailPrefix: "first-clinic-ok",
      phone: "+51987123456",
    });
    const emailsBefore = readEmailsTo(owner.email).length;
    const name = uniqueName("Consultorio Paredes");

    const response = await postFirstClinic(owner.context, {
      name: `  ${name}  `,
      address: "  Av. José Larco 812, of. 304, Miraflores  ",
      specialty: "  Dermatología  ",
    });

    expect(response.status()).toBe(201);
    const created = (await response.json()) as {
      organizationId: string;
      clinicId: string;
    };
    expect(Object.keys(created).sort()).toEqual(["clinicId", "organizationId"]);

    const prisma = await getTestPrisma();
    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { accountId: owner.accountId },
    });
    expect(subscription.plan).toBe("FREE");
    expect(subscription.status).toBe("ACTIVE");

    const records = await readFirstClinicRecords(owner.accountId, owner.userId);
    expect(records.organization).toMatchObject({
      resourceId: created.organizationId,
      name,
    });
    expect(records.clinic).toMatchObject({
      resourceId: created.clinicId,
      name,
      address: "Av. José Larco 812, of. 304, Miraflores",
      phone: "",
    });
    expect(records.organizationMembership?.role).toBe("ADMIN");
    expect(records.clinicMembership?.role).toBe("DOCTOR");
    expect(records.clinicMembership?.doctorProfile?.specialties).toEqual([
      { name: "Dermatología", organizationId: created.organizationId },
    ]);
    expect(await prisma.account.count({ where: { id: owner.accountId } })).toBe(
      1,
    );
    expect(
      await prisma.organization.count({
        where: { accountId: owner.accountId },
      }),
    ).toBe(1);
    expect(
      await prisma.clinic.count({
        where: { resource: { accountId: owner.accountId } },
      }),
    ).toBe(1);

    const membership = await owner.context.get(
      `${API_BASE_URL}/user/me/resource/${created.clinicId}/membership`,
    );
    expect(membership.status()).toBe(200);
    expect((await membership.json()).doctorProfileId).toBe(
      records.clinicMembership?.doctorProfile?.id,
    );

    expect(
      await prisma.userInvitation.count({
        where: { membership: { accountId: owner.accountId } },
      }),
    ).toBe(0);
    expect(readEmailsTo(owner.email)).toHaveLength(emailsBefore);
  });

  test("CA-11: sin horario el dueño no aparece en el listado público; con uno aparece con Dermatología como única especialidad", async () => {
    const { owner, clinicId } = await createOwnerWithFirstClinic({
      emailPrefix: "first-clinic-list",
    });
    const anonymous = await createApiContext();

    const before = await anonymous.get(
      `${API_BASE_URL}/clinic/${clinicId}/doctors`,
    );
    expect(before.status()).toBe(200);
    expect(await before.json()).toEqual([]);

    const saved = await owner.context.put(
      `${API_BASE_URL}/clinic/${clinicId}/availability`,
      {
        data: {
          availabilities: [
            { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
          ],
        },
      },
    );
    expect(saved.status()).toBe(201);

    const after = await anonymous.get(
      `${API_BASE_URL}/clinic/${clinicId}/doctors`,
    );
    const doctors = (await after.json()) as {
      specialties: { name: string }[];
    }[];
    expect(doctors).toHaveLength(1);
    expect(doctors[0].specialties.map((specialty) => specialty.name)).toEqual([
      "Dermatología",
    ]);
  });
});

test.describe("Una sola vez (CA-42, CA-48)", () => {
  test("CA-42 y CA-48: con una organización sin sede responde 409 sin tocar nada, y el cuerpo sólo trae message y code", async () => {
    const owner = await createOnboardedAdmin({
      emailPrefix: "first-clinic-org",
    });
    await createOrganizationResource(owner);
    const before = await readAccountFootprint(owner.accountId);

    const response = await postFirstClinic(owner.context, newFirstClinicBody());

    expect(response.status()).toBe(409);
    expect(await response.json()).toEqual({
      message: ALREADY_CREATED,
      code: "CONFLICT",
    });
    await expectIdentityFreeBody(response, [
      owner.accountId,
      owner.userId,
      owner.email,
      owner.name,
    ]);
    expect(await readAccountFootprint(owner.accountId)).toEqual(before);
  });

  test("CA-42: con organización y sede, y al repetir la petición ya atendida, responde 409 sin crear ni cambiar nada", async () => {
    const owner = await createOnboardedAdmin({
      emailPrefix: "first-clinic-twice",
    });
    const organizationId = await createOrganizationResource(owner);
    await createClinicResource(owner, organizationId);
    const withClinic = await readAccountFootprint(owner.accountId);

    const first = await postFirstClinic(owner.context, newFirstClinicBody());
    expect(first.status()).toBe(409);
    expect(await readAccountFootprint(owner.accountId)).toEqual(withClinic);

    const fresh = await createOwnerWithFirstClinic({
      emailPrefix: "first-clinic-repeat",
    });
    const afterCreate = await readAccountFootprint(fresh.owner.accountId);
    const recordsBefore = await readFirstClinicRecords(
      fresh.owner.accountId,
      fresh.owner.userId,
    );

    const repeated = await postFirstClinic(
      fresh.owner.context,
      newFirstClinicBody({ name: uniqueName("Otro nombre") }),
    );

    expect(repeated.status()).toBe(409);
    expect(await readAccountFootprint(fresh.owner.accountId)).toEqual(
      afterCreate,
    );
    expect(
      await readFirstClinicRecords(fresh.owner.accountId, fresh.owner.userId),
    ).toEqual(recordsBefore);
  });
});

test.describe("Sólo el dueño (CA-43, CA-48)", () => {
  test("CA-43 y CA-48: un ADMIN, un DOCTOR y un USER invitados reciben 403 aunque la cuenta ya tenga organización, sin escribir y sin ids, nombres ni correos", async () => {
    const { owner, organizationId, clinicId } =
      await createOwnerWithFirstClinic({ emailPrefix: "first-clinic-members" });
    const members = [
      { role: "ADMIN" as const, resourceId: organizationId },
      { role: "DOCTOR" as const, resourceId: clinicId },
      { role: "USER" as const, resourceId: clinicId },
    ];
    for (const { role, resourceId } of members) {
      const member = await createMemberWithRole({
        accountId: owner.accountId,
        resourceId,
        role,
        createdBy: owner.userId,
        emailPrefix: `first-clinic-${role.toLowerCase()}`,
      });
      const memberFootprint = await readAccountFootprint(owner.accountId);

      const response = await postFirstClinic(
        member.context,
        newFirstClinicBody(),
      );

      expect(response.status(), role).toBe(403);
      expect((await response.json()).message).toBe(OWNER_ONLY);
      await expectIdentityFreeBody(response, [
        owner.accountId,
        owner.userId,
        owner.email,
        owner.name,
        organizationId,
        clinicId,
        member.userId,
        member.email,
      ]);
      expect(await readAccountFootprint(owner.accountId)).toEqual(
        memberFootprint,
      );
    }
  });

  test("CA-43: un usuario de la cuenta sin memberships recibe 403 cuando la cuenta aún no tiene organizaciones, y el dueño sigue pudiendo crear la suya", async () => {
    const owner = await createOnboardedAdmin({
      emailPrefix: "first-clinic-bystander-owner",
    });
    const bystanderContext = await createApiContext();
    const bystander = await createConfirmedUser(bystanderContext, {
      emailPrefix: "first-clinic-bystander",
    });
    const prisma = await getTestPrisma();
    await prisma.user.update({
      where: { email: bystander.email },
      data: { accountId: owner.accountId, onboardingCompleted: true },
    });
    const before = await readAccountFootprint(owner.accountId);

    const response = await postFirstClinic(
      bystanderContext,
      newFirstClinicBody(),
    );

    expect(response.status()).toBe(403);
    expect((await response.json()).message).toBe(OWNER_ONLY);
    await expectIdentityFreeBody(response, [
      owner.accountId,
      owner.userId,
      owner.email,
      bystander.userId,
      bystander.email,
    ]);
    expect(await readAccountFootprint(owner.accountId)).toEqual(before);

    const ownerResponse = await postFirstClinic(
      owner.context,
      newFirstClinicBody(),
    );
    expect(ownerResponse.status()).toBe(201);
  });
});

test.describe("Política (CA-44)", () => {
  test("CA-44: sin sesión 401; sin cuenta, sin correo confirmado o sin onboarding 403, y ninguno escribe", async () => {
    const prisma = await getTestPrisma();
    const body = newFirstClinicBody();

    const anonymous = await createApiContext();
    expect((await postFirstClinic(anonymous, body)).status()).toBe(401);

    const accountlessContext = await createApiContext();
    const accountless = await createConfirmedUser(accountlessContext, {
      emailPrefix: "first-clinic-sin-cuenta",
    });
    const withoutAccount = await postFirstClinic(accountlessContext, body);
    expect(withoutAccount.status()).toBe(403);
    expect(
      await prisma.account.count({ where: { ownerId: accountless.userId } }),
    ).toBe(0);
    expect(
      await prisma.userResourceMembership.count({
        where: { userId: accountless.userId },
      }),
    ).toBe(0);

    const unconfirmed = await createOnboardedAdmin({
      emailPrefix: "first-clinic-sin-confirmar",
    });
    const unconfirmedBefore = await readAccountFootprint(unconfirmed.accountId);
    await prisma.user.update({
      where: { id: unconfirmed.userId },
      data: { confirmed: false },
    });
    expect((await postFirstClinic(unconfirmed.context, body)).status()).toBe(
      403,
    );
    expect(await readAccountFootprint(unconfirmed.accountId)).toEqual(
      unconfirmedBefore,
    );

    const notOnboarded = await createOnboardedAdmin({
      emailPrefix: "first-clinic-sin-onboarding",
    });
    const notOnboardedBefore = await readAccountFootprint(
      notOnboarded.accountId,
    );
    await prisma.user.update({
      where: { id: notOnboarded.userId },
      data: { onboardingCompleted: false },
    });
    expect((await postFirstClinic(notOnboarded.context, body)).status()).toBe(
      403,
    );
    expect(await readAccountFootprint(notOnboarded.accountId)).toEqual(
      notOnboardedBefore,
    );
  });
});

test.describe("Ningún id del cuerpo decide dónde se escribe (CA-45)", () => {
  async function createVictim(emailPrefix: string, withOrganization: boolean) {
    const owner = await createOnboardedAdmin({ emailPrefix });
    const organizationId = withOrganization
      ? await createOrganizationResource(owner)
      : undefined;
    const clinicId =
      organizationId && withOrganization
        ? await createClinicResource(owner, organizationId)
        : undefined;
    return { owner, organizationId, clinicId };
  }

  test("CA-45: un accountId, organizationId, resourceId, clinicId, userId u ownerId ajeno no mueve la escritura: responde 400 o crea en la cuenta de la sesión", async () => {
    const betaVictim = await createVictim("first-clinic-victima-beta", false);
    const fullVictim = await createVictim("first-clinic-victima-org", true);
    const victims: OnboardedAdmin[] = [betaVictim.owner, fullVictim.owner];
    const victimFootprintsBefore = await Promise.all(
      victims.map((victim) => readAccountFootprint(victim.accountId)),
    );

    const injectedIds: Record<string, string> = {
      accountId: betaVictim.owner.accountId,
      organizationId: fullVictim.organizationId as string,
      resourceId: fullVictim.clinicId as string,
      clinicId: fullVictim.clinicId as string,
      userId: betaVictim.owner.userId,
      ownerId: fullVictim.owner.userId,
    };

    for (const [field, value] of Object.entries(injectedIds)) {
      const attacker = await createOnboardedAdmin({
        emailPrefix: `first-clinic-atacante-${field.toLowerCase()}`,
      });

      const response = await postFirstClinic(attacker.context, {
        ...newFirstClinicBody(),
        [field]: value,
      });

      expect([201, 400], field).toContain(response.status());
      if (response.status() === 201) {
        const attackerFootprint = await readAccountFootprint(
          attacker.accountId,
        );
        expect(attackerFootprint.organizations, field).toBe(1);
        expect(attackerFootprint.clinics, field).toBe(1);
      }
    }

    const victimFootprintsAfter = await Promise.all(
      victims.map((victim) => readAccountFootprint(victim.accountId)),
    );
    expect(victimFootprintsAfter).toEqual(victimFootprintsBefore);

    const victimResponse = await postFirstClinic(
      betaVictim.owner.context,
      newFirstClinicBody(),
    );
    expect(victimResponse.status()).toBe(201);
  });
});

test.describe("Cuerpo inválido (CA-46)", () => {
  const valid = {
    name: "Consultorio Paredes",
    address: "Av. José Larco 812, of. 304, Miraflores",
    specialty: "Dermatología",
  };
  const invalidBodies: {
    label: string;
    body: Record<string, unknown>;
    message: string;
  }[] = [
    { label: "sin cuerpo útil", body: {}, message: NAME_REQUIRED },
    {
      label: "sin nombre",
      body: { address: valid.address, specialty: valid.specialty },
      message: NAME_REQUIRED,
    },
    {
      label: "sin dirección",
      body: { name: valid.name, specialty: valid.specialty },
      message: ADDRESS_REQUIRED,
    },
    {
      label: "sin especialidad",
      body: { name: valid.name, address: valid.address },
      message: SPECIALTY_REQUIRED,
    },
    {
      label: "nombre vacío",
      body: { ...valid, name: "" },
      message: NAME_REQUIRED,
    },
    {
      label: "dirección vacía",
      body: { ...valid, address: "" },
      message: ADDRESS_REQUIRED,
    },
    {
      label: "especialidad vacía",
      body: { ...valid, specialty: "" },
      message: SPECIALTY_REQUIRED,
    },
    {
      label: "nombre sólo de espacios",
      body: { ...valid, name: "   " },
      message: NAME_REQUIRED,
    },
    {
      label: "dirección sólo de espacios",
      body: { ...valid, address: "   " },
      message: ADDRESS_REQUIRED,
    },
    {
      label: "especialidad sólo de espacios",
      body: { ...valid, specialty: "   " },
      message: SPECIALTY_REQUIRED,
    },
    {
      label: "nombre numérico",
      body: { ...valid, name: 123 },
      message: NAME_REQUIRED,
    },
    {
      label: "dirección nula",
      body: { ...valid, address: null },
      message: ADDRESS_REQUIRED,
    },
    {
      label: "especialidad en lista",
      body: { ...valid, specialty: ["Dermatología"] },
      message: SPECIALTY_REQUIRED,
    },
    {
      label: "nombre de 101 caracteres",
      body: { ...valid, name: "n".repeat(101) },
      message: NAME_TOO_LONG,
    },
    {
      label: "dirección de 201 caracteres",
      body: { ...valid, address: "d".repeat(201) },
      message: ADDRESS_TOO_LONG,
    },
    {
      label: "especialidad de 101 caracteres",
      body: { ...valid, specialty: "e".repeat(101) },
      message: SPECIALTY_TOO_LONG,
    },
  ];

  test("CA-46: cada cuerpo inválido responde 400 con el mensaje en español de su campo y no escribe nada", async () => {
    const owner = await createOnboardedAdmin({
      emailPrefix: "first-clinic-400",
    });
    const before = await readAccountFootprint(owner.accountId);

    for (const { label, body, message } of invalidBodies) {
      const response = await postFirstClinic(owner.context, body);

      expect(response.status(), label).toBe(400);
      const text = await bodyText(response);
      expect(text, label).toContain(message);
      expect(text, label).not.toMatch(/expected|invalid input|required/i);
    }

    expect(await readAccountFootprint(owner.accountId)).toEqual(before);
  });

  test("CA-46: los máximos exactos (100, 200 y 100 caracteres) se aceptan", async () => {
    const owner = await createOnboardedAdmin({
      emailPrefix: "first-clinic-max",
    });

    const response = await postFirstClinic(owner.context, {
      name: "n".repeat(100),
      address: "d".repeat(200),
      specialty: "e".repeat(100),
    });

    expect(response.status()).toBe(201);
  });
});

test.describe("Concurrencia (CA-47)", () => {
  test("CA-47: dos peticiones simultáneas del mismo dueño dejan un 201 y un 409, y una sola organización, sede, membership ADMIN y DOCTOR, perfil y especialidad", async () => {
    const owners = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        createOnboardedAdmin({ emailPrefix: `first-clinic-carrera-${index}` }),
      ),
    );

    const results = await Promise.all(
      owners.map(async (owner) => {
        const responses = await Promise.all([
          postFirstClinic(owner.context, newFirstClinicBody()),
          postFirstClinic(owner.context, newFirstClinicBody()),
        ]);
        return { owner, statuses: responses.map((r) => r.status()).sort() };
      }),
    );

    const prisma = await getTestPrisma();
    for (const { owner, statuses } of results) {
      expect(statuses).toEqual([201, 409]);
      expect(await readAccountFootprint(owner.accountId)).toMatchObject({
        organizations: 1,
        clinics: 1,
        memberships: 2,
        doctorProfiles: 1,
        specialties: 1,
        invitations: 0,
        subscriptions: 1,
      });
      expect(
        await prisma.userResourceMembership.count({
          where: { userId: owner.userId, role: "ADMIN" },
        }),
      ).toBe(1);
      expect(
        await prisma.userResourceMembership.count({
          where: { userId: owner.userId, role: "DOCTOR" },
        }),
      ).toBe(1);
    }
  });
});
