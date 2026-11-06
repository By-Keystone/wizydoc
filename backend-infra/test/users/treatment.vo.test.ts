import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type TreatmentVO,
  treatmentSchema,
} from "../../lib/src/users/domain/value-objects/treatment.vo";

test("acepta Dr. y Dra.", () => {
  assert.equal(treatmentSchema.parse("DR"), "DR");
  assert.equal(treatmentSchema.parse("DRA"), "DRA");
});

test("rechaza cualquier otro valor con el mensaje en español", () => {
  for (const raw of ["", "dr", "Dr.", " DR", "DOCTOR"]) {
    const parsed = treatmentSchema.safeParse(raw);

    assert.equal(parsed.success, false, raw);
    assert.equal(parsed.error?.issues[0]?.message, "Tratamiento inválido", raw);
  }
});

test("un string sin validar no es un TreatmentVO", () => {
  const requireTreatment = (treatment: TreatmentVO) => treatment;
  const raw: string = "DR";

  // @ts-expect-error
  requireTreatment(raw);
  assert.equal(requireTreatment(treatmentSchema.parse(raw)), "DR");
});
