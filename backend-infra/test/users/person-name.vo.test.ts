import assert from "node:assert/strict";
import { test } from "node:test";
import {
  familyNameSchema,
  givenNameSchema,
} from "../../lib/src/users/domain/value-objects/person-name.vo";

test("el nombre y el apellido se recortan", () => {
  assert.equal(givenNameSchema.parse("  Ana  "), "Ana");
  assert.equal(familyNameSchema.parse("  Pérez "), "Pérez");
});

test("el nombre y el apellido aceptan 100 caracteres y no 101", () => {
  assert.equal(givenNameSchema.safeParse("a".repeat(100)).success, true);
  assert.equal(familyNameSchema.safeParse("a".repeat(100)).success, true);
  assert.equal(
    givenNameSchema.safeParse("a".repeat(101)).error?.issues[0]?.message,
    "El nombre no puede tener más de 100 caracteres.",
  );
  assert.equal(
    familyNameSchema.safeParse("a".repeat(101)).error?.issues[0]?.message,
    "El apellido no puede tener más de 100 caracteres.",
  );
});

test("un nombre o un apellido vacío, en blanco o que no es texto responde el mensaje de la spec", () => {
  for (const raw of ["", "   ", undefined, 7, null]) {
    assert.equal(
      givenNameSchema.safeParse(raw).error?.issues[0]?.message,
      "Escribe tu nombre.",
    );
    assert.equal(
      familyNameSchema.safeParse(raw).error?.issues[0]?.message,
      "Escribe tu apellido.",
    );
  }
});
