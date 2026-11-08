import assert from "node:assert/strict";
import { test } from "node:test";
import { createSignUpCode } from "../../lib/src/users/domain/sign-up-code.entity";
import { emailSchema } from "../../lib/src/users/domain/value-objects/email.vo";
import {
  buildUser,
  capturingSes,
  emailsFor,
  FROM_ADDRESS,
  TEMPLATE_NAMES,
  templateDataOf,
} from "./fakes";

test("a un correo con cuenta le manda el aviso con los enlaces para iniciar sesión y cambiar la contraseña", async () => {
  const { sesClient, inputs } = capturingSes();

  await emailsFor(sesClient).sendAccountExists(buildUser().email);

  const [sent] = inputs;
  assert.equal(
    sent.Content?.Template?.TemplateName,
    TEMPLATE_NAMES.accountExists,
  );
  assert.deepEqual(templateDataOf(sent), {
    loginUrl: "https://app.wizydoc.app/login",
    forgotPasswordUrl: "https://app.wizydoc.app/forgot-password",
  });
});

test("el código va a su plantilla con su vigencia, y el correo no manda el nombre", async () => {
  const { sesClient, inputs } = capturingSes();
  const signUpCode = createSignUpCode(emailSchema.parse("ana@clinica.pe"));

  await emailsFor(sesClient).sendSignUpCode(signUpCode);

  const [sent] = inputs;
  assert.equal(sent.FromEmailAddress, FROM_ADDRESS);
  assert.deepEqual(sent.Destination?.ToAddresses, ["ana@clinica.pe"]);
  assert.equal(sent.Content?.Template?.TemplateName, TEMPLATE_NAMES.signUpCode);
  assert.deepEqual(templateDataOf(sent), {
    code: signUpCode.code,
    codeLifetimeMinutes: "10",
  });
});
