import { randomUUID } from "node:crypto";
import { createApiContext, createClinicResource } from "../../support/accounts";
import { createOwnerWithFirstClinic } from "../../support/first-use";
import {
  addListedClinic,
  addTeamMember,
  createListedClinic,
  INVALID_CONTACT_MESSAGE,
  LIMA_LANDLINE_CONTACT,
  MOBILE_CONTACT,
  PROVINCE_LANDLINE_CONTACT,
  putPatientContact,
  readPatientContact,
  setPatientContact,
} from "../../support/monthly-cap";
import { expect, test } from "../../support/test";

// docs/features/tope-citas-mes/plan.md: CA-50 a CA-53 y CA-55 (parte api).

const NORMALIZED_INPUTS: Array<[string, string]> = [
  ["987654321", MOBILE_CONTACT],
  ["987 654 321", MOBILE_CONTACT],
  ["+51 987-654-321", MOBILE_CONTACT],
  ["(01) 234-5678", LIMA_LANDLINE_CONTACT],
  ["012345678", LIMA_LANDLINE_CONTACT],
  ["(044) 123456", PROVINCE_LANDLINE_CONTACT],
];
const REJECTED_INPUTS = ["12345", "887654321", "98765432", "llámame pronto"];

test("CA-50: se aceptan en varios formatos y se guardan normalizados en E.164", async () => {
  const world = await createListedClinic("contact-ca50");

  for (const [typed, normalized] of NORMALIZED_INPUTS) {
    const response = await putPatientContact(
      world.owner.context,
      world.clinicId,
      { patientContact: typed },
    );

    expect(response.status(), typed).toBe(200);
    expect(await response.json(), typed).toEqual({
      patientContact: normalized,
    });
    expect(await readPatientContact(world.clinicId), typed).toBe(normalized);
  }
});

test("CA-51: un número inválido responde 400 con el mensaje del formato y no cambia el guardado", async () => {
  const world = await createListedClinic("contact-ca51", {
    patientContact: MOBILE_CONTACT,
  });

  for (const typed of REJECTED_INPUTS) {
    const response = await putPatientContact(
      world.owner.context,
      world.clinicId,
      { patientContact: typed },
    );

    expect(response.status(), typed).toBe(400);
    expect((await response.json()).message, typed).toBe(
      INVALID_CONTACT_MESSAGE,
    );
    expect(await readPatientContact(world.clinicId), typed).toBe(
      MOBILE_CONTACT,
    );
  }
});

test("CA-52: un PUT con cadena vacía o con null borra el contacto", async () => {
  const world = await createListedClinic("contact-ca52");

  for (const emptyValue of ["", null]) {
    await setPatientContact(world.clinicId, MOBILE_CONTACT);

    const response = await putPatientContact(
      world.owner.context,
      world.clinicId,
      { patientContact: emptyValue },
    );

    expect(response.status(), String(emptyValue)).toBe(200);
    expect(await response.json()).toEqual({ patientContact: null });
    expect(await readPatientContact(world.clinicId)).toBeNull();
  }
});

test("CA-53: el contacto empieza vacío en una sede del primer uso, en la que crea el onboarding y en una creada desde Sedes con teléfono", async () => {
  const firstUse = await createOwnerWithFirstClinic({
    emailPrefix: "contact-ca53-primer-uso",
  });
  const world = await createListedClinic("contact-ca53-sedes", {
    plan: "CLINICA",
  });
  const createdFromClinics = await createClinicResource(
    world.owner,
    world.organizationId,
    { phone: "+51999111222" },
  );

  expect(await readPatientContact(firstUse.clinicId)).toBeNull();
  expect(await readPatientContact(world.clinicId)).toBeNull();
  expect(await readPatientContact(createdFromClinics)).toBeNull();
});

test("CA-55: el ADMIN de la sede y el de su organización guardan; DOCTOR y USER reciben 403 sin cambios", async () => {
  const world = await createListedClinic("contact-ca55-roles", {
    patientContact: MOBILE_CONTACT,
  });
  const clinicAdmin = await addTeamMember(world, "ADMIN");
  const organizationAdmin = await addTeamMember(
    world,
    "ADMIN",
    world.organizationId,
  );
  const doctor = await addTeamMember(world, "DOCTOR");
  const user = await addTeamMember(world, "USER");

  const fromClinicAdmin = await putPatientContact(
    clinicAdmin.context,
    world.clinicId,
    { patientContact: "(01) 234-5678" },
  );
  expect(fromClinicAdmin.status()).toBe(200);
  expect(await fromClinicAdmin.json()).toEqual({
    patientContact: LIMA_LANDLINE_CONTACT,
  });
  const fromOrganizationAdmin = await putPatientContact(
    organizationAdmin.context,
    world.clinicId,
    { patientContact: "987 654 321" },
  );
  expect(fromOrganizationAdmin.status()).toBe(200);
  expect(await fromOrganizationAdmin.json()).toEqual({
    patientContact: MOBILE_CONTACT,
  });

  await setPatientContact(world.clinicId, PROVINCE_LANDLINE_CONTACT);
  for (const member of [doctor, user]) {
    const response = await putPatientContact(member.context, world.clinicId, {
      patientContact: "955 123 456",
    });

    expect(response.status()).toBe(403);
    expect(await readPatientContact(world.clinicId)).toBe(
      PROVINCE_LANDLINE_CONTACT,
    );
  }
});

test("CA-55: el ADMIN de otra cuenta recibe 404, el id de una organización 404 y sin sesión 401, sin cambios", async () => {
  const world = await createListedClinic("contact-ca55-ajeno", {
    patientContact: MOBILE_CONTACT,
  });
  const outsider = await createListedClinic("contact-ca55-intruso");
  const anonymous = await createApiContext();
  const body = { patientContact: "955 123 456" };

  const fromOutsider = await putPatientContact(
    outsider.owner.context,
    world.clinicId,
    body,
  );
  const onOrganization = await putPatientContact(
    world.owner.context,
    world.organizationId,
    body,
  );
  const withoutSession = await putPatientContact(
    anonymous,
    world.clinicId,
    body,
  );
  const unknownClinic = await putPatientContact(
    world.owner.context,
    randomUUID(),
    body,
  );

  expect(fromOutsider.status()).toBe(404);
  expect(onOrganization.status()).toBe(404);
  expect(withoutSession.status()).toBe(401);
  expect(unknownClinic.status()).toBe(404);
  expect(await readPatientContact(world.clinicId)).toBe(MOBILE_CONTACT);
  expect(await readPatientContact(outsider.clinicId)).toBeNull();
});

test("CA-55: un accountId, clinicId o resourceId de otra sede en el cuerpo no deciden nada: solo cambia la sede de la URL", async () => {
  const world = await createListedClinic("contact-ca55-cuerpo");
  const outsider = await createListedClinic("contact-ca55-cuerpo-ajena", {
    patientContact: PROVINCE_LANDLINE_CONTACT,
  });
  const sibling = await addListedClinic(world);

  const response = await putPatientContact(
    world.owner.context,
    world.clinicId,
    {
      patientContact: "987 654 321",
      accountId: outsider.accountId,
      clinicId: outsider.clinicId,
      resourceId: sibling.clinicId,
    },
  );

  expect(response.status()).toBe(200);
  expect(await readPatientContact(world.clinicId)).toBe(MOBILE_CONTACT);
  expect(await readPatientContact(outsider.clinicId)).toBe(
    PROVINCE_LANDLINE_CONTACT,
  );
  expect(await readPatientContact(sibling.clinicId)).toBeNull();
});
