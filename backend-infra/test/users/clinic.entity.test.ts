import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeTime, ulid } from "ulid";
import { createOwnerClinic } from "../../lib/src/users/domain/clinic.entity";

const NOW = new Date("2026-11-12T15:00:00.000Z");
const OWNER_USER_ID = ulid();
const ACCOUNT_ID = ulid();

const buildOwnerClinic = () =>
  createOwnerClinic(
    {
      ownerUserId: OWNER_USER_ID,
      accountId: ACCOUNT_ID,
      name: "Consultorio Sol",
      address: "Av. Larco 123",
      specialty: "Cardiología",
    },
    NOW,
  );

test("la fábrica del consultorio usa el mismo nombre, da la especialidad sólo al DOCTOR y fecha los ids en now", () => {
  const { organization, clinic, memberships } = buildOwnerClinic();
  const [adminMembership, doctorMembership] = memberships;

  assert.equal(organization.name, "Consultorio Sol");
  assert.equal(clinic.name, "Consultorio Sol");
  assert.equal(decodeTime(organization.id), NOW.getTime());
  assert.equal(decodeTime(clinic.id), NOW.getTime());
  assert.equal(adminMembership.role, "ADMIN");
  assert.equal(adminMembership.specialties, undefined);
  assert.equal(doctorMembership.role, "DOCTOR");
  assert.deepEqual(doctorMembership.specialties, ["Cardiología"]);
});

test("la fábrica del consultorio apunta la sede a su organización y lleva el accountId recibido en las cuatro piezas", () => {
  const { ownerUserId, organization, clinic, memberships } = buildOwnerClinic();

  assert.equal(clinic.organizationId, organization.id);
  assert.equal(memberships[0].resourceId, organization.id);
  assert.equal(memberships[1].resourceId, clinic.id);
  for (const { accountId } of [organization, clinic, ...memberships]) {
    assert.equal(accountId, ACCOUNT_ID);
  }
  for (const { userId } of memberships) assert.equal(userId, ownerUserId);
});
