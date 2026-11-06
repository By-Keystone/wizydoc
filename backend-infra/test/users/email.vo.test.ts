import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
  type EmailVO,
  emailSchema,
} from "../../lib/src/users/domain/value-objects/email.vo";

const invalidAddresses = [
  "",
  "ana",
  "ana@",
  "@clinica.pe",
  ".ana@clinica.pe",
  "ana.@clinica.pe",
  "ana..perez@clinica.pe",
  "ana@clinica..pe",
  "ana@clinica",
  "ana@clinica.p",
  "ana@-clinica.pe",
  "ana perez@clinica.pe",
  "Ana <ana@clinica.pe>",
  "ñandu@clinica.pe",
];

test("recorta y pasa a minúsculas los correos válidos", () => {
  const expectations: Record<string, string> = {
    "ana@clinica.pe": "ana@clinica.pe",
    "  Ana.Perez+citas@Clinica.PE  ": "ana.perez+citas@clinica.pe",
    "o'brien@clinica.pe": "o'brien@clinica.pe",
    "ana_perez-1@sub.clinica.com.pe": "ana_perez-1@sub.clinica.com.pe",
  };

  for (const [raw, expected] of Object.entries(expectations)) {
    assert.equal(emailSchema.parse(raw), expected);
  }
});

test("rechaza los correos inválidos con el mensaje en español", () => {
  for (const raw of invalidAddresses) {
    const parsed = emailSchema.safeParse(raw);

    assert.equal(parsed.success, false, raw);
    assert.equal(parsed.error?.issues[0]?.message, "Correo inválido", raw);
  }
});

test("valida antes de pasar a minúsculas: el signo Kelvin no se vuelve una k", () => {
  assert.equal(emailSchema.safeParse("Kana@clinica.pe").success, false);
});

test("rechaza los correos más largos que el máximo de SMTP", () => {
  const longestAddress = `${"a".repeat(64)}@${"b".repeat(186)}.pe`;

  assert.equal(longestAddress.length, 254);
  assert.equal(emailSchema.safeParse(longestAddress).success, true);
  assert.equal(emailSchema.safeParse(`${longestAddress}e`).success, false);
});

test("rechaza una parte local de más de 64 caracteres", () => {
  assert.equal(
    emailSchema.safeParse(`${"a".repeat(64)}@clinica.pe`).success,
    true,
  );
  assert.equal(
    emailSchema.safeParse(`${"a".repeat(65)}@clinica.pe`).success,
    false,
  );
});

test("acepta lo mismo que z.email() con el correo recortado", () => {
  const plainEmail = z.email();

  for (const raw of [...invalidAddresses, "  Ana@Clinica.PE ", "a@b.co"]) {
    assert.equal(
      emailSchema.safeParse(raw).success,
      plainEmail.safeParse(raw.trim()).success,
      raw,
    );
  }
});

test("un string sin validar no es un EmailVO", () => {
  const requireEmail = (email: EmailVO) => email;

  // @ts-expect-error
  requireEmail("ana@clinica.pe");
  assert.equal(
    requireEmail(emailSchema.parse("ana@clinica.pe")),
    "ana@clinica.pe",
  );
});
