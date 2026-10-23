import type { APIRequestContext } from "@playwright/test";
import {
  createApiContext,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
} from "../../support/accounts";
import {
  addPortalDoctor,
  createPortalScenario,
  type PortalScenario,
} from "../../support/appointment-portal";
import { seedFullDayAvailability } from "../../support/availability";
import { getTestPrisma } from "../../support/db";
import {
  readUserEmail,
  setDoctorTreatment,
} from "../../support/doctor-treatment";
import { API_BASE_URL } from "../../support/env";
import { softDeleteMembership } from "../../support/invitations";
import { expect, test } from "../../support/test";
import { createConfirmedUser, signIn } from "../../support/users";

// docs/features/perfil-usuario/plan.md — PR 3, CA-24 a CA-41.

const PROFILE_URL = `${API_BASE_URL}/user/me/profile`;
const TREATMENT_FORBIDDEN =
  "Solo quien atiende como médico puede tener tratamiento.";

interface Profile {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  treatment: "DR" | "DRA" | null;
  doctorDisplayName: string | null;
  clinics: {
    clinicId: string;
    clinicName: string;
    organizationName: string;
    specialties: { id: string; name: string }[];
  }[];
}

async function getProfile(context: APIRequestContext) {
  const response = await context.get(PROFILE_URL);
  expect(response.status()).toBe(200);
  return (await response.json()) as Profile;
}

async function loginAsDoctor(userId: string) {
  const context = await createApiContext();
  await signIn(context, await readUserEmail(userId));
  return context;
}

async function readUserRow(userId: string) {
  const prisma = await getTestPrisma();
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}

async function addDoctorToClinic(
  scenario: PortalScenario,
  userId: string,
  clinicId: string,
  specialtyIds: string[],
) {
  const prisma = await getTestPrisma();
  const membership = await prisma.userResourceMembership.create({
    data: {
      userId,
      resourceId: clinicId,
      accountId: scenario.admin.accountId,
      role: "DOCTOR",
      createdBy: scenario.admin.userId,
    },
  });
  await prisma.doctorProfile.create({
    data: {
      membershipId: membership.id,
      specialties: { connect: specialtyIds.map((id) => ({ id })) },
    },
  });
  return membership.id;
}

async function createSecondClinic(scenario: PortalScenario) {
  return createClinicResourceViaPrisma(scenario.admin, scenario.organizationId);
}

async function patchProfile(
  context: APIRequestContext,
  data: Record<string, unknown>,
) {
  return context.patch(PROFILE_URL, { data });
}

const VALID_BODY = { name: "Marta", lastName: "Quispe", phone: "+51912345678" };

test.describe("Mi perfil: lectura (GET /user/me/profile)", () => {
  test("CA-24: el médico recibe exactamente sus datos y sus sedes, sin ids de usuario, cuenta ni rol", async () => {
    const scenario = await createPortalScenario("profile-shape");
    await setDoctorTreatment(scenario.doctor.userId, "DRA");
    const doctor = scenario.doctor;
    const context = await loginAsDoctor(doctor.userId);

    const response = await context.get(PROFILE_URL);

    expect(response.status()).toBe(200);
    const body = (await response.json()) as Profile;
    expect(Object.keys(body).sort()).toEqual([
      "clinics",
      "doctorDisplayName",
      "editableClinics",
      "email",
      "lastName",
      "name",
      "organizations",
      "phone",
      "treatment",
    ]);
    expect(body.treatment).toBe("DRA");
    expect(body.doctorDisplayName).toBe(
      `Dra. ${doctor.name} ${doctor.lastName}`,
    );
    expect(body.clinics).toHaveLength(1);
    expect(Object.keys(body.clinics[0]).sort()).toEqual([
      "clinicId",
      "clinicName",
      "organizationName",
      "specialties",
    ]);
    expect(body.clinics[0].clinicId).toBe(scenario.clinicId);
    expect(body.clinics[0].clinicName).toBe(scenario.clinicName);
    expect(body.clinics[0].specialties).toEqual([
      { id: scenario.specialtyId, name: scenario.specialtyName },
    ]);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(doctor.userId);
    expect(raw).not.toContain(scenario.admin.accountId);
    expect(raw).not.toContain("DOCTOR");
  });

  test("CA-25: un USER y un ADMIN sin perfil de médico reciben clinics vacío y doctorDisplayName null", async () => {
    const scenario = await createPortalScenario("profile-nodoctor");
    for (const role of ["USER", "ADMIN"] as const) {
      const member = await createMemberWithRole({
        accountId: scenario.admin.accountId,
        resourceId: scenario.clinicId,
        role,
        createdBy: scenario.admin.userId,
        emailPrefix: `profile-${role.toLowerCase()}`,
      });

      const profile = await getProfile(member.context);

      expect(profile.clinics).toEqual([]);
      expect(profile.doctorDisplayName).toBeNull();
      expect(profile.email).toBe(member.email);
    }
  });

  test("CA-26: el dueño sin organización recibe 200 con clinics vacío", async () => {
    const owner = await createOnboardedAdmin({ emailPrefix: "profile-owner" });

    const profile = await getProfile(owner.context);

    expect(profile.clinics).toEqual([]);
    expect(profile.doctorDisplayName).toBeNull();
    expect(profile.name).toBe(owner.name);
  });

  test("CA-27: un médico en dos sedes recibe un bloque por sede y la sede con membership borrada no aparece", async () => {
    const scenario = await createPortalScenario("profile-two-clinics");
    const secondClinicId = await createSecondClinic(scenario);
    const secondMembershipId = await addDoctorToClinic(
      scenario,
      scenario.doctor.userId,
      secondClinicId,
      [scenario.specialtyId],
    );
    const context = await loginAsDoctor(scenario.doctor.userId);

    const both = await getProfile(context);
    expect(both.clinics.map((clinic) => clinic.clinicId).sort()).toEqual(
      [scenario.clinicId, secondClinicId].sort(),
    );

    await softDeleteMembership(secondMembershipId);

    const remaining = await getProfile(context);
    expect(remaining.clinics.map((clinic) => clinic.clinicId)).toEqual([
      scenario.clinicId,
    ]);
  });

  test("CA-28: una especialidad de otra organización no aparece y una sede sin especialidades sale con []", async () => {
    const scenario = await createPortalScenario("profile-specialties");
    const otherOrganizationId = await createOrganizationResource(
      scenario.admin,
    );
    const foreignSpecialtyId = await createSpecialty(
      scenario.admin,
      otherOrganizationId,
    );
    const prisma = await getTestPrisma();
    const ownProfile = await prisma.doctorProfile.findFirstOrThrow({
      where: {
        membership: {
          userId: scenario.doctor.userId,
          resourceId: scenario.clinicId,
        },
      },
    });
    await prisma.doctorProfile.update({
      where: { id: ownProfile.id },
      data: { specialties: { connect: [{ id: foreignSpecialtyId }] } },
    });
    const emptyClinicId = await createSecondClinic(scenario);
    await addDoctorToClinic(
      scenario,
      scenario.doctor.userId,
      emptyClinicId,
      [],
    );
    const context = await loginAsDoctor(scenario.doctor.userId);

    const profile = await getProfile(context);

    const own = profile.clinics.find(
      (clinic) => clinic.clinicId === scenario.clinicId,
    );
    expect(own?.specialties).toEqual([
      { id: scenario.specialtyId, name: scenario.specialtyName },
    ]);
    const empty = profile.clinics.find(
      (clinic) => clinic.clinicId === emptyClinicId,
    );
    expect(empty?.specialties).toEqual([]);
  });
});

test.describe("Mi perfil: escritura (PATCH /user/me/profile)", () => {
  test("CA-29: guardar nombre, apellido, celular y «DR» responde con el perfil nuevo y un GET lo confirma", async () => {
    const scenario = await createPortalScenario("profile-save");
    const context = await loginAsDoctor(scenario.doctor.userId);

    const response = await patchProfile(context, {
      ...VALID_BODY,
      treatment: "DR",
    });

    expect(response.status()).toBe(200);
    const saved = (await response.json()) as Profile;
    expect(saved.name).toBe("Marta");
    expect(saved.lastName).toBe("Quispe");
    expect(saved.phone).toBe("+51912345678");
    expect(saved.treatment).toBe("DR");
    expect(saved.doctorDisplayName).toBe("Dr. Marta Quispe");
    expect(await getProfile(context)).toEqual(saved);
  });

  test("CA-30: sin la clave treatment no cambia y con null se borra", async () => {
    const scenario = await createPortalScenario("profile-treatment-key");
    await setDoctorTreatment(scenario.doctor.userId, "DRA");
    const context = await loginAsDoctor(scenario.doctor.userId);

    const withoutKey = await patchProfile(context, VALID_BODY);
    expect(withoutKey.status()).toBe(200);
    expect(((await withoutKey.json()) as Profile).treatment).toBe("DRA");

    const withNull = await patchProfile(context, {
      ...VALID_BODY,
      treatment: null,
    });
    expect(withNull.status()).toBe(200);
    const cleared = (await withNull.json()) as Profile;
    expect(cleared.treatment).toBeNull();
    expect(cleared.doctorDisplayName).toBe("Marta Quispe");
    expect((await readUserRow(scenario.doctor.userId)).treatment).toBeNull();
  });

  test("CA-31: los espacios al inicio y al final se quitan", async () => {
    const scenario = await createPortalScenario("profile-trim");
    const context = await loginAsDoctor(scenario.doctor.userId);

    const response = await patchProfile(context, {
      name: "  Andrés  ",
      lastName: "  Rojas ",
      phone: "  +51911222333 ",
    });

    expect(response.status()).toBe(200);
    const row = await readUserRow(scenario.doctor.userId);
    expect(row.name).toBe("Andrés");
    expect(row.lastName).toBe("Rojas");
    expect(row.phone).toBe("+51911222333");
  });

  const REQUIRED_FIELDS = [
    { field: "name", message: "Ingresa tu nombre" },
    { field: "lastName", message: "Ingresa tu apellido" },
    { field: "phone", message: "Ingresa tu celular" },
  ] as const;

  for (const { field, message } of REQUIRED_FIELDS) {
    test(`CA-32: ${field} vacío, solo con espacios o ausente responde 400 «${message}» y no cambia la fila`, async () => {
      const scenario = await createPortalScenario(
        `profile-required-${field.toLowerCase()}`,
      );
      const context = await loginAsDoctor(scenario.doctor.userId);
      const before = await readUserRow(scenario.doctor.userId);

      const { [field]: _omitted, ...withoutField } = VALID_BODY;
      const attempts = [
        { ...VALID_BODY, [field]: "" },
        { ...VALID_BODY, [field]: "   " },
        withoutField,
      ];
      for (const attempt of attempts) {
        const response = await patchProfile(context, attempt);

        expect(response.status()).toBe(400);
        if (field in attempt) {
          expect(await response.text()).toContain(message);
        }
      }

      expect(await readUserRow(scenario.doctor.userId)).toEqual(before);
    });
  }

  test("CA-33: un treatment fuera de DR, DRA o null responde 400 sin cambios", async () => {
    const scenario = await createPortalScenario("profile-bad-treatment");
    await setDoctorTreatment(scenario.doctor.userId, "DRA");
    const context = await loginAsDoctor(scenario.doctor.userId);
    const before = await readUserRow(scenario.doctor.userId);

    for (const treatment of ["dr", "DOCTOR", "", 1, true]) {
      const response = await patchProfile(context, {
        ...VALID_BODY,
        treatment,
      });
      expect(response.status()).toBe(400);
    }

    expect(await readUserRow(scenario.doctor.userId)).toEqual(before);
  });

  test("CA-34: cada clave de más responde 400 y no cambia ningún dato del usuario", async () => {
    const scenario = await createPortalScenario("profile-extra-keys");
    const context = await loginAsDoctor(scenario.doctor.userId);
    const before = await readUserRow(scenario.doctor.userId);
    const extras: Record<string, unknown> = {
      id: "00000000-0000-4000-8000-000000000000",
      userId: scenario.admin.userId,
      email: "intruso@e2e.wizydoc.test",
      role: "ADMIN",
      accountId: "00000000-0000-4000-8000-000000000000",
      onboardingCompleted: false,
      confirmed: false,
      inventada: "x",
    };

    for (const [key, value] of Object.entries(extras)) {
      const response = await patchProfile(context, {
        ...VALID_BODY,
        [key]: value,
      });

      expect(response.status(), `clave ${key}`).toBe(400);
    }

    expect(await readUserRow(scenario.doctor.userId)).toEqual(before);
  });

  test("CA-35: un nombre y un apellido de 300 caracteres y un celular de 40 se guardan completos", async () => {
    const scenario = await createPortalScenario("profile-long");
    const context = await loginAsDoctor(scenario.doctor.userId);
    const long = {
      name: "N".repeat(300),
      lastName: "A".repeat(300),
      phone: "+51".padEnd(40, "9"),
    };

    const response = await patchProfile(context, long);

    expect(response.status()).toBe(200);
    const row = await readUserRow(scenario.doctor.userId);
    expect(row.name).toBe(long.name);
    expect(row.lastName).toBe(long.lastName);
    expect(row.phone).toBe(long.phone);
  });

  test("CA-36: un USER o un ADMIN sin perfil de médico recibe 403 con «DRA» y 200 con null", async () => {
    const scenario = await createPortalScenario("profile-no-doctor-treatment");
    for (const role of ["USER", "ADMIN"] as const) {
      const member = await createMemberWithRole({
        accountId: scenario.admin.accountId,
        resourceId: scenario.clinicId,
        role,
        createdBy: scenario.admin.userId,
        emailPrefix: `profile-treat-${role.toLowerCase()}`,
      });
      const before = await readUserRow(member.userId);

      const denied = await patchProfile(member.context, {
        ...VALID_BODY,
        treatment: "DRA",
      });

      expect(denied.status()).toBe(403);
      expect(await denied.text()).toContain(TREATMENT_FORBIDDEN);
      expect(await readUserRow(member.userId)).toEqual(before);

      const cleared = await patchProfile(member.context, {
        ...VALID_BODY,
        treatment: null,
      });
      expect(cleared.status()).toBe(200);
    }
  });

  test("CA-37: un médico al que quitaron de su única sede recibe 403 con «DRA» y 200 con null", async () => {
    const scenario = await createPortalScenario("profile-removed-doctor");
    await setDoctorTreatment(scenario.doctor.userId, "DR");
    const context = await loginAsDoctor(scenario.doctor.userId);
    await softDeleteMembership(scenario.doctor.membershipId);

    const denied = await patchProfile(context, {
      ...VALID_BODY,
      treatment: "DRA",
    });
    expect(denied.status()).toBe(403);
    expect(await denied.text()).toContain(TREATMENT_FORBIDDEN);
    expect((await readUserRow(scenario.doctor.userId)).treatment).toBe("DR");

    const cleared = await patchProfile(context, {
      ...VALID_BODY,
      treatment: null,
    });
    expect(cleared.status()).toBe(200);
    expect((await readUserRow(scenario.doctor.userId)).treatment).toBeNull();
  });

  test("CA-38: el PATCH solo cambia a quien lo envía, no a otra persona de su cuenta ni de otra cuenta", async () => {
    const scenario = await createPortalScenario("profile-isolation");
    const colleague = await addPortalDoctor({
      label: "profile-isolation-colleague",
      clinicId: scenario.clinicId,
      admin: scenario.admin,
      specialtyId: scenario.specialtyId,
    });
    const stranger = await createPortalScenario("profile-isolation-other");
    const context = await loginAsDoctor(scenario.doctor.userId);
    const watched = [
      scenario.admin.userId,
      colleague.userId,
      stranger.admin.userId,
      stranger.doctor.userId,
    ];
    const before = await Promise.all(watched.map(readUserRow));

    const response = await patchProfile(context, {
      ...VALID_BODY,
      treatment: "DRA",
    });

    expect(response.status()).toBe(200);
    expect(await Promise.all(watched.map(readUserRow))).toEqual(before);
    expect((await readUserRow(scenario.doctor.userId)).name).toBe("Marta");
  });

  test("CA-38: un userId ajeno en la URL no redirige la escritura ni la lectura", async () => {
    const scenario = await createPortalScenario("profile-url-id");
    const victim = await createPortalScenario("profile-url-id-victim");
    const context = await loginAsDoctor(scenario.doctor.userId);
    const before = await readUserRow(victim.doctor.userId);

    const patch = await context.patch(
      `${PROFILE_URL}/${victim.doctor.userId}`,
      { data: VALID_BODY },
    );
    const get = await context.get(`${PROFILE_URL}/${victim.doctor.userId}`);

    expect(patch.status()).toBeGreaterThanOrEqual(400);
    expect(get.status()).toBeGreaterThanOrEqual(400);
    expect(await readUserRow(victim.doctor.userId)).toEqual(before);
  });
});

test.describe("Mi perfil: acceso", () => {
  test("CA-39: sin sesión, GET y PATCH responden 401", async () => {
    const anonymous = await createApiContext();

    expect((await anonymous.get(PROFILE_URL)).status()).toBe(401);
    expect((await patchProfile(anonymous, VALID_BODY)).status()).toBe(401);
  });

  // El login ya rechaza al usuario sin confirmar, así que se le quita la
  // confirmación a una sesión viva para llegar a la política.
  test("CA-39: con la sesión viva pero sin confirmar, GET y PATCH responden 403 y no escriben", async () => {
    const scenario = await createPortalScenario("profile-unconfirmed");
    const context = await loginAsDoctor(scenario.doctor.userId);
    const prisma = await getTestPrisma();
    await prisma.user.update({
      where: { id: scenario.doctor.userId },
      data: { confirmed: false },
    });
    const before = await readUserRow(scenario.doctor.userId);

    expect((await context.get(PROFILE_URL)).status()).toBe(403);
    expect((await patchProfile(context, VALID_BODY)).status()).toBe(403);
    expect(await readUserRow(scenario.doctor.userId)).toEqual(before);
  });

  test("CA-39: con la sesión viva pero sin onboarding, GET y PATCH responden 403 y no escriben", async () => {
    const scenario = await createPortalScenario("profile-no-onboarding");
    const context = await loginAsDoctor(scenario.doctor.userId);
    const prisma = await getTestPrisma();
    await prisma.user.update({
      where: { id: scenario.doctor.userId },
      data: { onboardingCompleted: false },
    });
    const before = await readUserRow(scenario.doctor.userId);

    expect((await context.get(PROFILE_URL)).status()).toBe(403);
    expect((await patchProfile(context, VALID_BODY)).status()).toBe(403);
    expect(await readUserRow(scenario.doctor.userId)).toEqual(before);
  });

  test("CA-39: un usuario confirmado sin cuenta recibe 403 en GET y PATCH", async () => {
    const context = await createApiContext();
    const { userId } = await createConfirmedUser(context, {
      emailPrefix: "profile-no-account",
    });
    const before = await readUserRow(userId);

    expect((await context.get(PROFILE_URL)).status()).toBe(403);
    expect((await patchProfile(context, VALID_BODY)).status()).toBe(403);
    expect(await readUserRow(userId)).toEqual(before);
  });
});

test.describe("Mi perfil: efecto en otras rutas", () => {
  test("CA-40: tras cambiar nombre y tratamiento, el listado público de sus dos sedes muestra el displayName nuevo", async () => {
    const scenario = await createPortalScenario("profile-public-name");
    const secondClinicId = await createSecondClinic(scenario);
    const secondProfile = await addSecondDoctorProfile(
      scenario,
      secondClinicId,
    );
    const context = await loginAsDoctor(scenario.doctor.userId);

    const response = await patchProfile(context, {
      name: "Elena",
      lastName: "Cárdenas",
      phone: "+51955443322",
      treatment: "DRA",
    });
    expect(response.status()).toBe(200);

    const anonymous = await createApiContext();
    for (const [clinicId, doctorProfileId] of [
      [scenario.clinicId, scenario.doctor.doctorProfileId],
      [secondClinicId, secondProfile],
    ]) {
      const listing = await anonymous.get(
        `${API_BASE_URL}/clinic/${clinicId}/doctors`,
      );
      expect(listing.status()).toBe(200);
      const doctors = (await listing.json()) as {
        doctorProfileId: string;
        displayName: string;
      }[];
      expect(
        doctors.find((doctor) => doctor.doctorProfileId === doctorProfileId)
          ?.displayName,
      ).toBe("Dra. Elena Cárdenas");
    }
  });

  test("CA-41: GET /user/me conserva su forma y update-user sigue respondiendo 404", async () => {
    const scenario = await createPortalScenario("profile-user-me");
    const context = await loginAsDoctor(scenario.doctor.userId);

    const me = await context.get(`${API_BASE_URL}/user/me`);

    expect(me.status()).toBe(200);
    const body = (await me.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "accountId",
      "confirmed",
      "email",
      "entitlements",
      "id",
      "isAccountOwner",
      "lastName",
      "name",
      "onboardingCompleted",
      "role",
    ]);
    expect(body.id).toBe(scenario.doctor.userId);

    const updateUser = await context.post(
      `${API_BASE_URL}/api/auth/update-user`,
      { data: { name: "Otro" } },
    );
    expect(updateUser.status()).toBe(404);
  });
});

async function addSecondDoctorProfile(
  scenario: PortalScenario,
  clinicId: string,
) {
  await addDoctorToClinic(scenario, scenario.doctor.userId, clinicId, [
    scenario.specialtyId,
  ]);
  return seedFullDayAvailability(scenario.doctor.userId, clinicId);
}
