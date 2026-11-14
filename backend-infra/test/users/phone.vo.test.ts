import assert from "node:assert/strict";
import { test } from "node:test";
import { phoneSchema } from "../../lib/src/users/domain/value-objects/phone.vo";

const MISSING_PHONE = "Escribe tu celular.";
const INVALID_PHONE =
  "Escribe un celular de 9 dígitos que empiece con 9, o un fijo con su código de ciudad.";

const messageOf = (raw: unknown) =>
  phoneSchema.safeParse(raw).error?.issues[0]?.message;

test("el celular normaliza celulares y fijos de Perú a +51", () => {
  const expectations: Record<string, string> = {
    "987654321": "+51987654321",
    "+51 987 654 321": "+51987654321",
    "51987654321": "+51987654321",
    "(01) 456-7890": "+5114567890",
    "044 123456": "+5144123456",
  };

  for (const [raw, expected] of Object.entries(expectations)) {
    assert.equal(phoneSchema.parse(raw), expected);
  }
});

test("un celular que ya lleva +51 vuelve a dar el mismo", () => {
  assert.equal(phoneSchema.parse("+51987654321"), "+51987654321");
});

test("un celular que falta, está en blanco o no es texto responde Escribe tu celular.", () => {
  for (const raw of [undefined, null, 987654321, "", "   "]) {
    assert.equal(messageOf(raw), MISSING_PHONE);
  }
});

test("un celular que no es de Perú o no tiene el formato responde el mensaje del celular", () => {
  for (const raw of ["12345", "+1 202 555 0100", "abc"]) {
    assert.equal(messageOf(raw), INVALID_PHONE);
  }
});
