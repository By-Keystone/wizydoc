import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type TreatmentVO,
  treatmentSchema,
} from "../../lib/src/users/domain/value-objects/treatment.vo";

test("el tratamiento acepta DR y DRA", () => {
  assert.equal(treatmentSchema.parse("DR"), "DR");
  assert.equal(treatmentSchema.parse("DRA"), "DRA");
});

test("el tratamiento acepta null sólo con nullable", () => {
  assert.equal(treatmentSchema.nullable().parse(null), null);
  assert.equal(treatmentSchema.safeParse(null).success, false);
});

test("el tratamiento rechaza cualquier otro valor con el mensaje en español", () => {
  for (const raw of ["", "dr", "Dr.", " DR", "DOCTOR", undefined]) {
    assert.equal(
      treatmentSchema.safeParse(raw).error?.issues[0]?.message,
      "Tratamiento inválido",
      String(raw),
    );
  }
});

test("un string sin validar no es un TreatmentVO", () => {
  const requireTreatment = (treatment: TreatmentVO) => treatment;
  const raw: string = "DR";

  // @ts-expect-error
  requireTreatment(raw);
  assert.equal(requireTreatment(treatmentSchema.parse(raw)), "DR");
});
