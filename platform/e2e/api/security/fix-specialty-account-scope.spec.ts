import { randomUUID } from "node:crypto";
import { type APIRequestContext } from "@playwright/test";
import { test, expect } from "../../support/test";
import { API_BASE_URL } from "../../support/env";
import {
  createApiContext,
  createClinicResource,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  inviteUserViaApi,
} from "../../support/accounts";
import { createConfirmedUser, uniqueEmail, uniqueName } from "../../support/users";
import { getTestPrisma } from "../../support/db";

/**
 * docs/features/fix-specialty-account-scope/plan.md — CA-1 a CA-17 y CA-19 a
 * CA-25 ([e2e]). CA-18 (toast del panel) y CA-26 (booking en el celular) son
 * de navegador: viven en `e2e/ui/specialties/` y `e2e/ui/booking/`. CA-23 ya
 * la cubre `ui/invitations/invite-doctor.spec.ts`, que sigue pasando sin
 * cambios. CA-19 (que `prisma migrate deploy` no falle) la garantiza el
 * `global-setup`: si fallara, ningún test de este archivo llegaría a correr;
 * el test que lleva su ID además ejercita de punta a punta el esquema
 * migrado.
 */

function postSpecialty(context: APIRequestContext, organizationId: string, name: string) {
  return context.post(`${API_BASE_URL}/${organizationId}/specialty`, { data: { name } });
}

function putSpecialty(
  context: APIRequestContext,
  organizationId: string,
  specialtyId: string,
  name: string,
) {
  return context.put(`${API_BASE_URL}/${organizationId}/specialty/${specialtyId}`, {
    data: { name },
  });
}

interface SpecialtyListItem {
  id: string;
  name: string;
}

async function listSpecialtyNames(
  context: APIRequestContext,
  organizationId: string,
): Promise<string[]> {
  const response = await context.get(`${API_BASE_URL}/${organizationId}/specialties`);
  const body = (await response.json()) as { specialties: SpecialtyListItem[] };
  return body.specialties.map((specialty) => specialty.name);
}

async function readSpecialtyName(specialtyId: string): Promise<string | null> {
  const prisma = await getTestPrisma();
  const specialty = await prisma.specialty.findUnique({ where: { id: specialtyId } });
  return specialty?.name ?? null;
}

interface PublicClinicDoctor {
  doctorProfileId: string;
  userId: string;
  name: string;
  lastName: string;
  specialties: { id: string; name: string }[];
}

async function getPublicClinicDoctors(clinicId: string): Promise<PublicClinicDoctor[]> {
  const anonymous = await createApiContext();
  const response = await anonymous.get(`${API_BASE_URL}/clinic/${clinicId}/doctors`);
  return (await response.json()) as PublicClinicDoctor[];
}

interface InviteRawParams {
  email: string;
  role: "DOCTOR" | "USER";
  resourceId: string;
  specialtyIds?: string[];
  name?: string;
  lastName?: string;
  phone?: string;
}

/** A diferencia de `inviteUserViaApi`, no lanza si la respuesta no es ok: hace falta para probar los rechazos. */
function inviteRaw(context: APIRequestContext, params: InviteRawParams) {
  return context.post(`${API_BASE_URL}/user/invite`, {
    data: {
      name: "Intento",
      lastName: "Invitado",
      phone: "+51900000000",
      ...params,
    },
  });
}

async function expectUserAbsent(email: string): Promise<void> {
  const prisma = await getTestPrisma();
  // La transacción es atómica: si el usuario no quedó creado, tampoco quedaron perfil, membership ni invitación.
  expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
}

test.describe("No se puede editar una especialidad ajena", () => {
  test("CA-1: un ADMIN no puede renombrar, desde su propia organización, una especialidad de otra cuenta", async () => {
    const victim = await createOnboardedAdmin({ emailPrefix: "victima-ca1" });
    const orgB = await createOrganizationResource(victim, uniqueName("ORG-B-CA1"));
    const specialtyId = await createSpecialty(victim, orgB, uniqueName("Pediatría CA-1"));

    const attacker = await createOnboardedAdmin({ emailPrefix: "atacante-ca1" });
    const orgA = await createOrganizationResource(attacker, uniqueName("ORG-A-CA1"));

    const response = await putSpecialty(attacker.context, orgA, specialtyId, "Hackeada CA-1");

    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ message: "Especialidad no encontrada" });
    expect(await readSpecialtyName(specialtyId)).not.toBe("Hackeada CA-1");
  });

  test("CA-2: usar la organización de la víctima en la URL ya lo bloquea la política con 404", async () => {
    const victim = await createOnboardedAdmin({ emailPrefix: "victima-ca2" });
    const orgB = await createOrganizationResource(victim, uniqueName("ORG-B-CA2"));
    const specialtyId = await createSpecialty(victim, orgB, uniqueName("Pediatría CA-2"));

    const attacker = await createOnboardedAdmin({ emailPrefix: "atacante-ca2" });

    const response = await putSpecialty(attacker.context, orgB, specialtyId, "Hackeada CA-2");

    expect(response.status()).toBe(404);
    expect(await readSpecialtyName(specialtyId)).not.toBe("Hackeada CA-2");
  });

  test("CA-3: un ADMIN con dos organizaciones no puede editar la de una desde la otra", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca3" });
    const orgX = await createOrganizationResource(admin, uniqueName("ORG-X-CA3"));
    const orgY = await createOrganizationResource(admin, uniqueName("ORG-Y-CA3"));
    const specialtyYId = await createSpecialty(admin, orgY, uniqueName("Traumatología CA-3"));

    const response = await putSpecialty(admin.context, orgX, specialtyYId, "Hackeada CA-3");

    expect(response.status()).toBe(404);
    expect(await readSpecialtyName(specialtyYId)).not.toBe("Hackeada CA-3");
  });

  test("CA-4: editar a través del resourceId de una sede (no de la organización) no funciona", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca4" });
    const orgA = await createOrganizationResource(admin, uniqueName("ORG-CA4"));
    const clinicS = await createClinicResource(admin, orgA, { name: uniqueName("Sede-CA4") });
    const specialtyId = await createSpecialty(admin, orgA, uniqueName("Dermatología CA-4"));

    const response = await putSpecialty(admin.context, clinicS, specialtyId, "Hackeada CA-4");

    // La política deja pasar al ADMIN por herencia desde el org (ver CA-17 de
    // fix-user-by-email-scope), pero `organizationId` en el update es el id de
    // la sede, no el de la organización: no coincide y el use case responde 404,
    // igual que con un id ajeno (decisión 6 del plan).
    expect(response.status()).toBe(404);
    expect(await readSpecialtyName(specialtyId)).not.toBe("Hackeada CA-4");
  });

  test("CA-5: un DOCTOR o un USER de la organización no pueden crear ni editar especialidades", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca5" });
    const orgA = await createOrganizationResource(admin, uniqueName("ORG-CA5"));
    const specialtyName = uniqueName("Cardiología CA-5");
    const specialtyId = await createSpecialty(admin, orgA, specialtyName);

    const doctor = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: orgA,
      role: "DOCTOR",
      createdBy: admin.userId,
      emailPrefix: "doctor-ca5",
    });
    const user = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: orgA,
      role: "USER",
      createdBy: admin.userId,
      emailPrefix: "user-ca5",
    });

    for (const member of [doctor, user]) {
      const createResponse = await postSpecialty(member.context, orgA, uniqueName("Intento CA-5"));
      expect(createResponse.status()).toBe(403);
      expect((await createResponse.json()).message).toBe("Insufficient role on this resource");

      const updateResponse = await putSpecialty(member.context, orgA, specialtyId, "Hackeada CA-5");
      expect(updateResponse.status()).toBe(403);
    }

    expect(await readSpecialtyName(specialtyId)).not.toBe("Hackeada CA-5");
    expect(await listSpecialtyNames(admin.context, orgA)).toEqual([specialtyName]);
  });
});

test.describe("No se puede vincular una especialidad ajena al invitar a un médico", () => {
  test("CA-6: invitar con un specialtyId de otra cuenta no crea nada", async () => {
    const victim = await createOnboardedAdmin({ emailPrefix: "victima-ca6" });
    const orgB = await createOrganizationResource(victim, uniqueName("ORG-B-CA6"));
    const foreignSpecialtyId = await createSpecialty(victim, orgB, uniqueName("Especialidad-B-CA6"));

    const attacker = await createOnboardedAdmin({ emailPrefix: "atacante-ca6" });
    const orgA = await createOrganizationResource(attacker, uniqueName("ORG-A-CA6"));
    const clinicA = await createClinicResource(attacker, orgA, { name: uniqueName("Sede-A-CA6") });
    const doctorEmail = uniqueEmail("doctor-ca6");

    const response = await inviteRaw(attacker.context, {
      email: doctorEmail,
      role: "DOCTOR",
      resourceId: clinicA,
      specialtyIds: [foreignSpecialtyId],
    });

    expect(response.status()).toBe(404);
    expect((await response.json()).message).toBe("Especialidad no encontrada");
    await expectUserAbsent(doctorEmail);
  });

  test("CA-7: dentro de la misma cuenta, una especialidad de otra organización tampoco se puede usar", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca7" });
    const orgX = await createOrganizationResource(admin, uniqueName("ORG-X-CA7"));
    const orgY = await createOrganizationResource(admin, uniqueName("ORG-Y-CA7"));
    const clinicX = await createClinicResource(admin, orgX, { name: uniqueName("Sede-X-CA7") });
    const specialtyYId = await createSpecialty(admin, orgY, uniqueName("Especialidad-Y-CA7"));
    const doctorEmail = uniqueEmail("doctor-ca7");

    const response = await inviteRaw(admin.context, {
      email: doctorEmail,
      role: "DOCTOR",
      resourceId: clinicX,
      specialtyIds: [specialtyYId],
    });

    expect(response.status()).toBe(404);
    await expectUserAbsent(doctorEmail);
  });

  test("CA-8: una especialidad propia junto a una ajena rechaza la invitación entera, no sólo la ajena", async () => {
    const victim = await createOnboardedAdmin({ emailPrefix: "victima-ca8" });
    const orgB = await createOrganizationResource(victim, uniqueName("ORG-B-CA8"));
    const foreignSpecialtyId = await createSpecialty(victim, orgB, uniqueName("Especialidad-B-CA8"));

    const attacker = await createOnboardedAdmin({ emailPrefix: "atacante-ca8" });
    const orgA = await createOrganizationResource(attacker, uniqueName("ORG-A-CA8"));
    const clinicA = await createClinicResource(attacker, orgA, { name: uniqueName("Sede-A-CA8") });
    const ownSpecialtyId = await createSpecialty(attacker, orgA, uniqueName("Especialidad-A-CA8"));
    const doctorEmail = uniqueEmail("doctor-ca8");

    const response = await inviteRaw(attacker.context, {
      email: doctorEmail,
      role: "DOCTOR",
      resourceId: clinicA,
      specialtyIds: [ownSpecialtyId, foreignSpecialtyId],
    });

    expect(response.status()).toBe(404);
    await expectUserAbsent(doctorEmail);
  });

  test("CA-9: el intento de CA-6 no cambia lo que el booking público muestra de la víctima", async () => {
    const victim = await createOnboardedAdmin({ emailPrefix: "victima-ca9" });
    const orgB = await createOrganizationResource(victim, uniqueName("ORG-B-CA9"));
    const clinicB = await createClinicResource(victim, orgB, { name: uniqueName("Sede-B-CA9") });
    const victimSpecialtyId = await createSpecialty(victim, orgB, uniqueName("Especialidad-B-CA9"));
    await inviteUserViaApi(victim, {
      email: uniqueEmail("doctor-victima-ca9"),
      name: "Vera",
      lastName: "Víctima",
      phone: "+51900000003",
      role: "DOCTOR",
      resourceId: clinicB,
      specialtyIds: [victimSpecialtyId],
    });

    const before = await getPublicClinicDoctors(clinicB);

    const attacker = await createOnboardedAdmin({ emailPrefix: "atacante-ca9" });
    const orgA = await createOrganizationResource(attacker, uniqueName("ORG-A-CA9"));
    const clinicA = await createClinicResource(attacker, orgA, { name: uniqueName("Sede-A-CA9") });
    await inviteRaw(attacker.context, {
      email: uniqueEmail("doctor-ca9"),
      role: "DOCTOR",
      resourceId: clinicA,
      specialtyIds: [victimSpecialtyId],
    });

    const after = await getPublicClinicDoctors(clinicB);
    expect(after).toEqual(before);
  });
});

test.describe("Un id inexistente y uno ajeno responden igual", () => {
  test("CA-10: PUT con un id ajeno y PUT con un id inexistente responden exactamente igual", async () => {
    const victim = await createOnboardedAdmin({ emailPrefix: "victima-ca10" });
    const orgB = await createOrganizationResource(victim, uniqueName("ORG-B-CA10"));
    const foreignSpecialtyId = await createSpecialty(victim, orgB, uniqueName("Especialidad-B-CA10"));

    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca10" });
    const orgA = await createOrganizationResource(admin, uniqueName("ORG-A-CA10"));

    const forForeignId = await putSpecialty(admin.context, orgA, foreignSpecialtyId, "Hackeada CA-10");
    const forNonExistentId = await putSpecialty(admin.context, orgA, randomUUID(), "Hackeada CA-10");

    expect(forForeignId.status()).toBe(404);
    expect(forForeignId.status()).toBe(forNonExistentId.status());
    expect(await forForeignId.json()).toEqual(await forNonExistentId.json());
  });

  test("CA-11: invitar con un specialtyId ajeno y con uno inexistente responde exactamente igual", async () => {
    const victim = await createOnboardedAdmin({ emailPrefix: "victima-ca11" });
    const orgB = await createOrganizationResource(victim, uniqueName("ORG-B-CA11"));
    const foreignSpecialtyId = await createSpecialty(victim, orgB, uniqueName("Especialidad-B-CA11"));

    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca11" });
    const orgA = await createOrganizationResource(admin, uniqueName("ORG-A-CA11"));
    const clinicA = await createClinicResource(admin, orgA, { name: uniqueName("Sede-CA11") });

    const forForeignId = await inviteRaw(admin.context, {
      email: uniqueEmail("doctor-ca11-ajeno"),
      role: "DOCTOR",
      resourceId: clinicA,
      specialtyIds: [foreignSpecialtyId],
    });
    const forNonExistentId = await inviteRaw(admin.context, {
      email: uniqueEmail("doctor-ca11-inexistente"),
      role: "DOCTOR",
      resourceId: clinicA,
      specialtyIds: [randomUUID()],
    });

    expect(forForeignId.status()).toBe(404);
    expect(forForeignId.status()).toBe(forNonExistentId.status());
    expect(await forForeignId.json()).toEqual(await forNonExistentId.json());
  });

  test("CA-12: crear un nombre que ya existe en otra cuenta responde 201, igual que si no existiera", async () => {
    const accountB = await createOnboardedAdmin({ emailPrefix: "cuenta-b-ca12" });
    const orgB = await createOrganizationResource(accountB, uniqueName("ORG-B-CA12"));
    await createSpecialty(accountB, orgB, "Cardiología CA-12");

    const accountA = await createOnboardedAdmin({ emailPrefix: "cuenta-a-ca12" });
    const orgA = await createOrganizationResource(accountA, uniqueName("ORG-A-CA12"));

    const response = await postSpecialty(accountA.context, orgA, "Cardiología CA-12");

    expect(response.status()).toBe(201);
  });
});

test.describe("Nombres por organización", () => {
  test("CA-13: dos cuentas con el mismo nombre cada una ve sólo el suyo en su listado", async () => {
    const accountA = await createOnboardedAdmin({ emailPrefix: "cuenta-a-ca13" });
    const orgA = await createOrganizationResource(accountA, uniqueName("ORG-A-CA13"));
    const accountB = await createOnboardedAdmin({ emailPrefix: "cuenta-b-ca13" });
    const orgB = await createOrganizationResource(accountB, uniqueName("ORG-B-CA13"));

    const responseA = await postSpecialty(accountA.context, orgA, "Cardiología CA-13");
    const responseB = await postSpecialty(accountB.context, orgB, "Cardiología CA-13");
    expect(responseA.status()).toBe(201);
    expect(responseB.status()).toBe(201);

    expect(await listSpecialtyNames(accountA.context, orgA)).toEqual(["Cardiología CA-13"]);
    expect(await listSpecialtyNames(accountB.context, orgB)).toEqual(["Cardiología CA-13"]);
  });

  test("CA-14: dos organizaciones de la misma cuenta también pueden repetir un nombre", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca14" });
    const orgX = await createOrganizationResource(admin, uniqueName("ORG-X-CA14"));
    const orgY = await createOrganizationResource(admin, uniqueName("ORG-Y-CA14"));

    const responseX = await postSpecialty(admin.context, orgX, "Dermatología CA-14");
    const responseY = await postSpecialty(admin.context, orgY, "Dermatología CA-14");

    expect(responseX.status()).toBe(201);
    expect(responseY.status()).toBe(201);
  });

  test("CA-15: repetir un nombre dentro de la misma organización responde 422, no 500", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca15" });
    const orgA = await createOrganizationResource(admin, uniqueName("ORG-CA15"));
    await createSpecialty(admin, orgA, "Cardiología CA-15");

    const response = await postSpecialty(admin.context, orgA, "Cardiología CA-15");

    expect(response.status()).toBe(422);
    expect((await response.json()).message).toBe("Ya existe esa especialidad");
  });

  test("CA-16: renombrar a un nombre ya usado en la misma organización responde 422 y nada cambia", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca16" });
    const orgA = await createOrganizationResource(admin, uniqueName("ORG-CA16"));
    const cardiologiaId = await createSpecialty(admin, orgA, "Cardiología CA-16");
    const neurologiaId = await createSpecialty(admin, orgA, "Neurología CA-16");

    const response = await putSpecialty(admin.context, orgA, neurologiaId, "Cardiología CA-16");

    expect(response.status()).toBe(422);
    expect((await response.json()).message).toBe("Ya existe esa especialidad");
    expect(await readSpecialtyName(cardiologiaId)).toBe("Cardiología CA-16");
    expect(await readSpecialtyName(neurologiaId)).toBe("Neurología CA-16");
  });

  test("CA-17: el nombre es sensible a mayúsculas, como hoy (decisión 2 del plan)", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca17" });
    const orgA = await createOrganizationResource(admin, uniqueName("ORG-CA17"));
    await createSpecialty(admin, orgA, "Cardiología CA-17");

    const response = await postSpecialty(admin.context, orgA, "cardiología CA-17");

    expect(response.status()).toBe(201);
  });
});

test.describe("Lo que sigue funcionando", () => {
  test("CA-19 y CA-20: crear una especialidad responde 201 y aparece en el listado", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca20" });
    const orgA = await createOrganizationResource(admin, uniqueName("ORG-CA20"));

    const response = await postSpecialty(admin.context, orgA, "Oftalmología CA-20");

    expect(response.status()).toBe(201);
    expect(await listSpecialtyNames(admin.context, orgA)).toContain("Oftalmología CA-20");
  });

  test("CA-21: renombrar la propia especialidad se ve en el listado y en el booking público", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca21" });
    const orgA = await createOrganizationResource(admin, uniqueName("ORG-CA21"));
    const clinicA = await createClinicResource(admin, orgA, { name: uniqueName("Sede-CA21") });
    const specialtyId = await createSpecialty(admin, orgA, uniqueName("Pediatría CA-21"));
    await inviteUserViaApi(admin, {
      email: uniqueEmail("doctor-ca21"),
      name: "Dora",
      lastName: "Doctora",
      phone: "+51900000005",
      role: "DOCTOR",
      resourceId: clinicA,
      specialtyIds: [specialtyId],
    });

    const newName = uniqueName("Pediatría renombrada CA-21");
    const updateResponse = await putSpecialty(admin.context, orgA, specialtyId, newName);
    expect(updateResponse.ok()).toBe(true);

    expect(await listSpecialtyNames(admin.context, orgA)).toContain(newName);

    const publicDoctors = await getPublicClinicDoctors(clinicA);
    const publicSpecialtyNames = publicDoctors.flatMap((doctor) =>
      doctor.specialties.map((specialty) => specialty.name),
    );
    expect(publicSpecialtyNames).toContain(newName);
  });

  test("CA-22: ADMIN, DOCTOR y USER de la organización ven sólo las especialidades de esa organización", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca22" });
    const orgA = await createOrganizationResource(admin, uniqueName("ORG-A-CA22"));
    await createSpecialty(admin, orgA, "Especialidad propia CA-22");

    const otherAdmin = await createOnboardedAdmin({ emailPrefix: "admin-ajeno-ca22" });
    const orgB = await createOrganizationResource(otherAdmin, uniqueName("ORG-B-CA22"));
    await createSpecialty(otherAdmin, orgB, "Especialidad ajena CA-22");

    const doctor = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: orgA,
      role: "DOCTOR",
      createdBy: admin.userId,
      emailPrefix: "doctor-ca22",
    });
    const user = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: orgA,
      role: "USER",
      createdBy: admin.userId,
      emailPrefix: "user-ca22",
    });

    for (const member of [admin, doctor, user]) {
      expect(await listSpecialtyNames(member.context, orgA)).toEqual(["Especialidad propia CA-22"]);
    }
  });

  test("CA-24: invitar con el mismo specialtyId repetido deja al médico con esa especialidad una sola vez", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca24" });
    const orgA = await createOrganizationResource(admin, uniqueName("ORG-CA24"));
    const clinicA = await createClinicResource(admin, orgA, { name: uniqueName("Sede-CA24") });
    const specialtyId = await createSpecialty(admin, orgA, uniqueName("Especialidad-CA24"));

    const response = await inviteUserViaApi(admin, {
      email: uniqueEmail("doctor-ca24"),
      name: "Darío",
      lastName: "Repetido",
      phone: "+51900000006",
      role: "DOCTOR",
      resourceId: clinicA,
      specialtyIds: [specialtyId, specialtyId],
    });
    expect(response.ok()).toBe(true);

    const publicDoctors = await getPublicClinicDoctors(clinicA);
    expect(publicDoctors).toHaveLength(1);
    expect(publicDoctors[0].specialties).toHaveLength(1);
  });

  test("CA-25: invitar a un USER (no médico) se sigue creando igual", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca25" });
    const orgA = await createOrganizationResource(admin, uniqueName("ORG-CA25"));
    const clinicA = await createClinicResource(admin, orgA, { name: uniqueName("Sede-CA25") });
    const userEmail = uniqueEmail("user-ca25");

    const response = await inviteUserViaApi(admin, {
      email: userEmail,
      name: "Úrsula",
      lastName: "Usuaria",
      phone: "+51900000007",
      role: "USER",
      resourceId: clinicA,
    });
    expect(response.ok()).toBe(true);

    const prisma = await getTestPrisma();
    expect(await prisma.user.findUnique({ where: { email: userEmail } })).not.toBeNull();
  });
});

test.describe("Consecuencia del arreglo en el booking público", () => {
  test("un médico cuyas únicas especialidades son ajenas a la organización de su sede no aparece", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-extra" });
    const orgA = await createOrganizationResource(admin, uniqueName("ORG-A-EXTRA"));
    const clinicA = await createClinicResource(admin, orgA, { name: uniqueName("Sede-EXTRA") });
    const ownSpecialtyId = await createSpecialty(admin, orgA, uniqueName("Especialidad-propia-EXTRA"));

    await inviteUserViaApi(admin, {
      email: uniqueEmail("doctor-legitimo-extra"),
      name: "Leo",
      lastName: "Legítimo",
      phone: "+51900000008",
      role: "DOCTOR",
      resourceId: clinicA,
      specialtyIds: [ownSpecialtyId],
    });

    const otherAdmin = await createOnboardedAdmin({ emailPrefix: "admin-ajeno-extra" });
    const orgB = await createOrganizationResource(otherAdmin, uniqueName("ORG-B-EXTRA"));
    const foreignSpecialtyId = await createSpecialty(otherAdmin, orgB, uniqueName("Especialidad-ajena-EXTRA"));

    // Vínculo que la app ya no deja crear (ver CA-6 a CA-8): se simula con
    // Prisma para comprobar que, si existiera por datos previos al arreglo, el
    // doctor desaparece del booking en vez de filtrar el nombre ajeno.
    const corruptedUserContext = await createApiContext();
    const { userId: corruptedUserId } = await createConfirmedUser(corruptedUserContext, {
      emailPrefix: "doctor-corrupto-extra",
    });
    const prisma = await getTestPrisma();
    await prisma.doctorProfile.create({
      data: {
        userId: corruptedUserId,
        clinicId: clinicA,
        specialties: { connect: [{ id: foreignSpecialtyId }] },
      },
    });

    const doctors = await getPublicClinicDoctors(clinicA);

    expect(doctors).toHaveLength(1);
    expect(doctors[0].name).toBe("Leo");
  });
});
