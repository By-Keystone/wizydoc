import type { APIRequestContext } from "@playwright/test";
import {
  createApiContext,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  type SeedMembershipRole,
} from "../../support/accounts";
import {
  createManagedAppointment,
  createPortalScenario,
  type PortalScenario,
} from "../../support/appointment-portal";
import { getTestPrisma } from "../../support/db";
import { readUserEmail } from "../../support/doctor-treatment";
import {
  expectNoEmailTo,
  readEmailsTo,
  waitForEmailTo,
} from "../../support/email";
import { API_BASE_URL } from "../../support/env";
import {
  ageInvitationIssuance,
  softDeleteMembership,
} from "../../support/invitations";
import { expect, test } from "../../support/test";
import { signIn, uniqueEmail, uniqueName } from "../../support/users";

// docs/features/doctor-profile-membership/plan.md: asignar crea, revive o edita la membership y, como Médico, su perfil.

const INVITATION_SUBJECT = "WizyDoc - Invitación";
const RESEND_SUFFIX = "Le reenviamos la invitación.";

interface Person {
  email: string;
  name: string;
  lastName: string;
  phone: string;
}

interface AssignResult {
  outcome: "created" | "revived" | "updated";
  invitationSent: boolean;
  message: string;
}

function newPerson(prefix: string): Person {
  return {
    email: uniqueEmail(prefix),
    name: "Nora",
    lastName: uniqueName("Vega"),
    phone: "+51933333333",
  };
}

function assignToClinic(
  context: APIRequestContext,
  clinicId: string,
  person: Person,
  body: Record<string, unknown>,
) {
  return context.post(`${API_BASE_URL}/clinic/${clinicId}/invitations`, {
    data: { ...person, ...body },
  });
}

function assignToOrganization(
  context: APIRequestContext,
  organizationId: string,
  person: Person,
  role: string,
) {
  return context.post(
    `${API_BASE_URL}/organization/${organizationId}/invitations`,
    { data: { ...person, role } },
  );
}

async function assignOk(
  context: APIRequestContext,
  clinicId: string,
  person: Person,
  body: Record<string, unknown>,
): Promise<AssignResult> {
  const response = await assignToClinic(context, clinicId, person, body);
  expect(response.status()).toBe(200);
  return (await response.json()) as AssignResult;
}

async function personOfMember(
  scenario: PortalScenario,
  role: SeedMembershipRole,
  resourceId = scenario.organizationId,
): Promise<Person & { userId: string; membershipId: string }> {
  const member = await createMemberWithRole({
    accountId: scenario.admin.accountId,
    resourceId,
    role,
    createdBy: scenario.admin.userId,
    emailPrefix: `assign-${role.toLowerCase()}`,
  });
  return {
    email: member.email,
    name: member.name,
    lastName: member.lastName,
    phone: member.phone,
    userId: member.userId,
    membershipId: member.membershipId,
  };
}

async function membershipOf(email: string, resourceId: string) {
  const prisma = await getTestPrisma();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  return prisma.userResourceMembership.findFirst({
    where: { userId: user.id, resourceId },
  });
}

async function profileOf(email: string, clinicId: string) {
  const prisma = await getTestPrisma();
  const profile = await prisma.doctorProfile.findFirst({
    where: { membership: { user: { email }, resourceId: clinicId } },
    select: {
      id: true,
      membershipId: true,
      specialties: { select: { id: true } },
    },
  });
  if (!profile) return null;
  return {
    id: profile.id,
    membershipId: profile.membershipId,
    specialtyIds: (profile.specialties ?? []).map((s) => s.id).sort(),
  };
}

async function invitationOf(email: string, resourceId: string) {
  const prisma = await getTestPrisma();
  return prisma.userInvitation.findFirst({
    where: { membership: { user: { email }, resourceId } },
  });
}

async function tokenOf(email: string, resourceId: string): Promise<string> {
  const invitation = await invitationOf(email, resourceId);
  if (!invitation) throw new Error(`Sin invitación de ${email}`);
  return invitation.token;
}

async function listedProfileIds(clinicId: string): Promise<string[]> {
  const anonymous = await createApiContext();
  const response = await anonymous.get(
    `${API_BASE_URL}/clinic/${clinicId}/doctors`,
  );
  expect(response.status()).toBe(200);
  return ((await response.json()) as { doctorProfileId: string }[]).map(
    (doctor) => doctor.doctorProfileId,
  );
}

async function membershipPayload(email: string, clinicId: string) {
  const context = await createApiContext();
  await signIn(context, email);
  const response = await context.get(
    `${API_BASE_URL}/user/me/resource/${clinicId}/membership`,
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    role: string;
    doctorProfileId: string | null;
  };
}

test.describe("Crear, editar y revivir", () => {
  test("a alguien nuevo como Médico se le crean membership, perfil e invitación, y recibe el correo", async () => {
    const scenario = await createPortalScenario("assign-create");
    const person = newPerson("assign-new");

    const result = await assignOk(
      scenario.admin.context,
      scenario.clinicId,
      person,
      { role: "DOCTOR", specialtyIds: [scenario.specialtyId] },
    );

    expect(result).toEqual({
      outcome: "created",
      invitationSent: true,
      message: `Invitación enviada. ${person.name} ${person.lastName} aparece en los usuarios de ${scenario.clinicName}.`,
    });
    expect((await membershipOf(person.email, scenario.clinicId))?.role).toBe(
      "DOCTOR",
    );
    expect(
      (await profileOf(person.email, scenario.clinicId))?.specialtyIds,
    ).toEqual([scenario.specialtyId]);
    expect(await invitationOf(person.email, scenario.clinicId)).not.toBeNull();
    await waitForEmailTo(person.email, { subject: INVITATION_SUBJECT });
  });

  test("editar a quien ya está en la sede cambia el rol y reemplaza las especialidades en el mismo perfil", async () => {
    const scenario = await createPortalScenario("assign-edit");
    const other = await createSpecialty(
      scenario.admin,
      scenario.organizationId,
      uniqueName("Otra"),
    );
    const person = await personOfMember(scenario, "USER", scenario.clinicId);
    expect(await profileOf(person.email, scenario.clinicId)).toBeNull();

    const promoted = await assignOk(
      scenario.admin.context,
      scenario.clinicId,
      person,
      { role: "DOCTOR", specialtyIds: [scenario.specialtyId] },
    );
    const profile = await profileOf(person.email, scenario.clinicId);
    const edited = await assignOk(
      scenario.admin.context,
      scenario.clinicId,
      person,
      { role: "DOCTOR", specialtyIds: [other] },
    );

    expect(promoted).toMatchObject({
      outcome: "updated",
      invitationSent: false,
    });
    expect(edited.message).toBe(
      `Guardamos los cambios de ${person.name} ${person.lastName}.`,
    );
    const after = await profileOf(person.email, scenario.clinicId);
    expect(after?.id).toBe(profile?.id);
    expect(after?.specialtyIds).toEqual([other]);
  });

  test("reasignar a quien se quitó de la sede revive la misma membership con su perfil, horarios y citas", async () => {
    const scenario = await createPortalScenario("assign-revive");
    const { doctor } = scenario;
    const doctorEmail = await readUserEmail(doctor.userId);
    const appointment = await createManagedAppointment(scenario);
    const other = await createSpecialty(
      scenario.admin,
      scenario.organizationId,
      uniqueName("Nueva"),
    );
    await softDeleteMembership(doctor.membershipId);
    expect(await listedProfileIds(scenario.clinicId)).not.toContain(
      doctor.doctorProfileId,
    );
    const emailsBefore = readEmailsTo(doctorEmail).length;

    const result = await assignOk(
      scenario.admin.context,
      scenario.clinicId,
      {
        email: doctorEmail,
        name: doctor.name,
        lastName: doctor.lastName,
        phone: "+51900000000",
      },
      { role: "DOCTOR", specialtyIds: [other] },
    );

    expect(result).toMatchObject({ outcome: "revived", invitationSent: false });
    const membership = await membershipOf(doctorEmail, scenario.clinicId);
    expect(membership).toMatchObject({
      id: doctor.membershipId,
      role: "DOCTOR",
      deletedAt: null,
    });
    const profile = await profileOf(doctorEmail, scenario.clinicId);
    expect(profile?.id).toBe(doctor.doctorProfileId);
    expect(profile?.specialtyIds).toEqual([other]);
    const prisma = await getTestPrisma();
    expect(
      await prisma.availability.count({
        where: { doctorProfileId: doctor.doctorProfileId },
      }),
    ).toBe(7);
    expect(
      await prisma.appointment.count({
        where: {
          id: appointment.appointmentId,
          doctorProfileId: doctor.doctorProfileId,
        },
      }),
    ).toBe(1);
    expect(readEmailsTo(doctorEmail)).toHaveLength(emailsBefore);
  });

  test("un USER de la organización asignado como Médico es DOCTOR en esa sede y USER en la otra", async () => {
    const scenario = await createPortalScenario("assign-user-to-doctor");
    const otherClinicId = await createClinicResourceViaPrisma(
      scenario.admin,
      scenario.organizationId,
    );
    const person = await personOfMember(scenario, "USER");

    await assignOk(scenario.admin.context, scenario.clinicId, person, {
      role: "DOCTOR",
      specialtyIds: [scenario.specialtyId],
    });

    const here = await membershipPayload(person.email, scenario.clinicId);
    const there = await membershipPayload(person.email, otherClinicId);
    expect(here.role).toBe("DOCTOR");
    expect(here.doctorProfileId).toBe(
      (await profileOf(person.email, scenario.clinicId))?.id,
    );
    expect(there.role).toBe("USER");
    expect(there.doctorProfileId).toBeNull();
  });
});

test.describe("Médico, Usuario y de vuelta a Médico", () => {
  test("pasar a Usuario lo saca del booking y deja doctorProfileId en null; volver a Médico lo recupera", async () => {
    const scenario = await createPortalScenario("assign-roundtrip");
    const { doctor } = scenario;
    const person: Person = {
      email: await readUserEmail(doctor.userId),
      name: doctor.name,
      lastName: doctor.lastName,
      phone: "+51900000000",
    };
    expect(await listedProfileIds(scenario.clinicId)).toContain(
      doctor.doctorProfileId,
    );

    const demoted = await assignOk(
      scenario.admin.context,
      scenario.clinicId,
      person,
      { role: "USER" },
    );

    expect(demoted.outcome).toBe("updated");
    expect(await listedProfileIds(scenario.clinicId)).not.toContain(
      doctor.doctorProfileId,
    );
    expect(
      (await membershipPayload(person.email, scenario.clinicId))
        .doctorProfileId,
    ).toBeNull();
    expect((await profileOf(person.email, scenario.clinicId))?.id).toBe(
      doctor.doctorProfileId,
    );

    await assignOk(scenario.admin.context, scenario.clinicId, person, {
      role: "DOCTOR",
      specialtyIds: [scenario.specialtyId],
    });

    expect(await listedProfileIds(scenario.clinicId)).toContain(
      doctor.doctorProfileId,
    );
    expect(
      (await membershipPayload(person.email, scenario.clinicId))
        .doctorProfileId,
    ).toBe(doctor.doctorProfileId);
  });
});

test.describe("Regla del correo", () => {
  test("sin contraseña: la segunda vez seguida no envía nada y, pasado el enfriamiento, reenvía con otro token", async () => {
    const scenario = await createPortalScenario("assign-email-rule");
    const person = newPerson("assign-cooldown");
    const body = { role: "DOCTOR", specialtyIds: [scenario.specialtyId] };
    await assignOk(scenario.admin.context, scenario.clinicId, person, body);
    await waitForEmailTo(person.email, { subject: INVITATION_SUBJECT });
    const firstToken = await tokenOf(person.email, scenario.clinicId);
    const emailsAfterFirst = readEmailsTo(person.email).length;

    const immediate = await assignOk(
      scenario.admin.context,
      scenario.clinicId,
      person,
      body,
    );

    expect(immediate).toMatchObject({
      outcome: "updated",
      invitationSent: false,
    });
    expect(immediate.message).not.toContain(RESEND_SUFFIX);
    await expectNoEmailTo(person.email, { afterCount: emailsAfterFirst });
    expect(await tokenOf(person.email, scenario.clinicId)).toBe(firstToken);

    await ageInvitationIssuance(firstToken);
    const resent = await assignOk(
      scenario.admin.context,
      scenario.clinicId,
      person,
      body,
    );

    expect(resent.invitationSent).toBe(true);
    expect(resent.message).toBe(
      `Guardamos los cambios de ${person.name} ${person.lastName}. ${RESEND_SUFFIX}`,
    );
    await waitForEmailTo(person.email, {
      subject: INVITATION_SUBJECT,
      afterCount: emailsAfterFirst,
    });
    expect(await tokenOf(person.email, scenario.clinicId)).not.toBe(firstToken);
  });

  test("con contraseña: ninguna invitación ni correo, y el acceso vale desde ya", async () => {
    const scenario = await createPortalScenario("assign-with-password");
    const person = await personOfMember(scenario, "USER");
    const emailsBefore = readEmailsTo(person.email).length;

    const result = await assignOk(
      scenario.admin.context,
      scenario.clinicId,
      person,
      { role: "DOCTOR", specialtyIds: [scenario.specialtyId] },
    );

    expect(result).toMatchObject({ invitationSent: false });
    expect(await invitationOf(person.email, scenario.clinicId)).toBeNull();
    await expectNoEmailTo(person.email, { afterCount: emailsBefore });
    expect(
      (await membershipPayload(person.email, scenario.clinicId)).role,
    ).toBe("DOCTOR");
  });

  test("segunda sede a quien tiene la invitación pendiente: otra invitación y otro correo", async () => {
    const scenario = await createPortalScenario("assign-second-clinic");
    const secondClinicId = await createClinicResourceViaPrisma(
      scenario.admin,
      scenario.organizationId,
    );
    const person = newPerson("assign-second");
    await assignOk(scenario.admin.context, scenario.clinicId, person, {
      role: "USER",
    });
    await waitForEmailTo(person.email, { subject: INVITATION_SUBJECT });
    const emailsAfterFirst = readEmailsTo(person.email).length;

    const result = await assignOk(
      scenario.admin.context,
      secondClinicId,
      person,
      { role: "USER" },
    );

    expect(result).toMatchObject({ outcome: "created", invitationSent: true });
    await waitForEmailTo(person.email, {
      subject: INVITATION_SUBJECT,
      afterCount: emailsAfterFirst,
    });
    const first = await invitationOf(person.email, scenario.clinicId);
    const second = await invitationOf(person.email, secondClinicId);
    expect(second).not.toBeNull();
    expect(second?.token).not.toBe(first?.token);
  });
});

test.describe("Conflictos 409", () => {
  test("nadie cambia su propio rol ni el del dueño en la organización; con el mismo rol es 200", async () => {
    const scenario = await createPortalScenario("assign-409-org");
    const otherAdmin = await createMemberWithRole({
      accountId: scenario.admin.accountId,
      resourceId: scenario.organizationId,
      role: "ADMIN",
      createdBy: scenario.admin.userId,
      emailPrefix: "assign-409-admin",
    });
    const own: Person = {
      email: otherAdmin.email,
      name: otherAdmin.name,
      lastName: otherAdmin.lastName,
      phone: otherAdmin.phone,
    };
    const owner: Person = {
      email: scenario.admin.email,
      name: scenario.admin.name,
      lastName: scenario.admin.lastName,
      phone: scenario.admin.phone,
    };

    const self = await assignToOrganization(
      otherAdmin.context,
      scenario.organizationId,
      own,
      "USER",
    );
    const ownerChange = await assignToOrganization(
      otherAdmin.context,
      scenario.organizationId,
      owner,
      "USER",
    );
    const sameRole = await assignToOrganization(
      otherAdmin.context,
      scenario.organizationId,
      own,
      "ADMIN",
    );

    expect(self.status()).toBe(409);
    expect(await self.json()).toMatchObject({
      message: "No puedes cambiar tu propio rol.",
    });
    expect(ownerChange.status()).toBe(409);
    expect(await ownerChange.json()).toMatchObject({
      message: "El rol del dueño de la cuenta no se puede cambiar.",
    });
    expect(sameRole.status()).toBe(200);
    expect((await membershipOf(own.email, scenario.organizationId))?.role).toBe(
      "ADMIN",
    );
    expect(
      (await membershipOf(owner.email, scenario.organizationId))?.role,
    ).toBe("ADMIN");
  });

  test("el ADMIN directo de una sede (dato sembrado) no se degrada ni se asigna como Médico", async () => {
    const scenario = await createPortalScenario("assign-409-clinic-admin");
    const clinicAdmin = await personOfMember(
      scenario,
      "ADMIN",
      scenario.clinicId,
    );

    for (const body of [
      { role: "USER" },
      { role: "DOCTOR", specialtyIds: [scenario.specialtyId] },
    ]) {
      const response = await assignToClinic(
        scenario.admin.context,
        scenario.clinicId,
        clinicAdmin,
        body,
      );

      expect(response.status()).toBe(409);
      expect(await response.json()).toMatchObject({
        message: "El rol de un administrador de la sede no se puede cambiar.",
      });
    }
    expect(
      (await membershipOf(clinicAdmin.email, scenario.clinicId))?.role,
    ).toBe("ADMIN");
    expect(await profileOf(clinicAdmin.email, scenario.clinicId)).toBeNull();
  });
});

test.describe("Otra cuenta u otra organización", () => {
  test("el ADMIN de otra cuenta da 404 y no escribe nada", async () => {
    const scenario = await createPortalScenario("assign-idor-account");
    const stranger = await createOnboardedAdmin({
      emailPrefix: "assign-stranger",
    });
    const person = newPerson("assign-idor-target");

    const response = await assignToClinic(
      stranger.context,
      scenario.clinicId,
      person,
      { role: "USER" },
    );

    expect(response.status()).toBe(404);
    expect(await membershipOf(person.email, scenario.clinicId)).toBeNull();
  });

  test("un ADMIN sólo de la organización A no asigna en una sede de B (404); uno de las dos con una especialidad de A en B tampoco (404)", async () => {
    const scenario = await createPortalScenario("assign-idor-org");
    const otherOrganizationId = await createOrganizationResource(
      scenario.admin,
    );
    const clinicOfB = await createClinicResourceViaPrisma(
      scenario.admin,
      otherOrganizationId,
    );
    const adminOfA = await createMemberWithRole({
      accountId: scenario.admin.accountId,
      resourceId: scenario.organizationId,
      role: "ADMIN",
      createdBy: scenario.admin.userId,
      emailPrefix: "assign-admin-a",
    });
    const person = newPerson("assign-idor-org-target");

    const fromAdminOfA = await assignToClinic(
      adminOfA.context,
      clinicOfB,
      person,
      {
        role: "USER",
      },
    );
    const foreignSpecialty = await assignToClinic(
      scenario.admin.context,
      clinicOfB,
      person,
      { role: "DOCTOR", specialtyIds: [scenario.specialtyId] },
    );

    expect(fromAdminOfA.status()).toBe(404);
    expect(foreignSpecialty.status()).toBe(404);
    expect(await membershipOf(person.email, clinicOfB)).toBeNull();
  });

  test("un correo de otra cuenta responde 422 sin revelar nada", async () => {
    const scenario = await createPortalScenario("assign-422");
    const stranger = await createOnboardedAdmin({
      emailPrefix: "assign-422-stranger",
    });

    const response = await assignToClinic(
      scenario.admin.context,
      scenario.clinicId,
      {
        email: stranger.email,
        name: stranger.name,
        lastName: stranger.lastName,
        phone: stranger.phone,
      },
      { role: "USER" },
    );

    expect(response.status()).toBe(422);
    expect(await membershipOf(stranger.email, scenario.clinicId)).toBeNull();
  });
});

test.describe("Sin límite de médicos", () => {
  test("en Gratis se asignan tres médicos nuevos sin 402", async () => {
    const scenario = await createPortalScenario("assign-free-doctors");

    for (const prefix of ["assign-free-1", "assign-free-2", "assign-free-3"]) {
      const result = await assignOk(
        scenario.admin.context,
        scenario.clinicId,
        newPerson(prefix),
        { role: "DOCTOR", specialtyIds: [scenario.specialtyId] },
      );

      expect(result.outcome).toBe("created");
    }
  });
});
