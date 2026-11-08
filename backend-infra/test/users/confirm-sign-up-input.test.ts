import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmSignUpInputSchemaFor } from "../../lib/src/users/application/confirm-sign-up.usecase";
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  CURRENT_TERMS_VERSION,
} from "../../lib/src/users/domain/legal-documents";

const TOKEN_EXPIRED = "Tu verificación venció. Vuelve a pedir el código.";
const PASSWORD_TOO_SHORT = "La contraseña debe tener al menos 8 caracteres";
const PASSWORD_WITH_SPACES_AT_THE_EDGES =
  "La contraseña no puede empezar ni terminar con un espacio, ni tener saltos de línea";

const withoutTerms = confirmSignUpInputSchemaFor(false);
const withTerms = confirmSignUpInputSchemaFor(true);

const validBody = {
  email: "ana@clinica.pe",
  password: "una-clave-segura",
  verificationToken: "A".repeat(43),
};

const acceptedTermsBody = {
  ...validBody,
  acceptedTerms: true,
  termsVersion: CURRENT_TERMS_VERSION,
  privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION,
};

const firstMessage = (schema: typeof withTerms, body: unknown) => {
  const parsed = schema.safeParse(body);
  assert.equal(parsed.success, false, JSON.stringify(body));
  return parsed.error?.issues[0]?.message;
};

test("rechaza las entradas inválidas con el mensaje en español", () => {
  const expectations: [unknown, string][] = [
    [null, "La solicitud no es válida."],
    [[], "La solicitud no es válida."],
    ["registro", "La solicitud no es válida."],
    [{ ...validBody, email: undefined }, "Correo inválido"],
    [{ ...validBody, password: "corta" }, PASSWORD_TOO_SHORT],
    [
      { ...validBody, password: "a".repeat(257) },
      "La contraseña puede tener hasta 256 caracteres",
    ],
    [{ ...validBody, verificationToken: undefined }, TOKEN_EXPIRED],
    [{ ...validBody, verificationToken: "A".repeat(42) }, TOKEN_EXPIRED],
    [{ ...validBody, verificationToken: `${"A".repeat(42)}=` }, TOKEN_EXPIRED],
  ];

  for (const [body, message] of expectations) {
    assert.equal(firstMessage(withoutTerms, body), message);
  }
});

test("rechaza las contraseñas que Cognito no acepta", () => {
  for (const password of [" secreta123", "secreta123 ", "secr\neta123"]) {
    assert.equal(
      firstMessage(withoutTerms, { ...validBody, password }),
      PASSWORD_WITH_SPACES_AT_THE_EDGES,
    );
  }
  assert.equal(
    firstMessage(withoutTerms, { ...validBody, password: "😀😀😀😀" }),
    PASSWORD_TOO_SHORT,
  );
  assert.equal(
    withoutTerms.safeParse({ ...validBody, password: "una clave con espacios" })
      .success,
    true,
  );
});

test("con el flag encendido exige aceptar los términos", () => {
  const notAccepted =
    "Para crear tu cuenta, acepta los Términos y condiciones.";

  assert.equal(
    firstMessage(withTerms, { ...acceptedTermsBody, acceptedTerms: undefined }),
    notAccepted,
  );
  assert.equal(
    firstMessage(withTerms, { ...acceptedTermsBody, acceptedTerms: false }),
    notAccepted,
  );
  assert.equal(withTerms.safeParse(acceptedTermsBody).success, true);
});

test("con el flag encendido rechaza versiones que no son las vigentes", () => {
  const outdated = "Actualizamos los términos. Recarga la página para verlos.";

  assert.equal(
    firstMessage(withTerms, {
      ...acceptedTermsBody,
      termsVersion: "2025-01-01",
    }),
    outdated,
  );
  assert.equal(
    firstMessage(withTerms, {
      ...acceptedTermsBody,
      privacyPolicyVersion: "2025-01-01",
    }),
    outdated,
  );
});

test("con el flag apagado acepta la entrada sin la casilla ni las versiones", () => {
  assert.equal(withoutTerms.safeParse(validBody).success, true);
});
