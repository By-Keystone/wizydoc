import assert from "node:assert/strict";
import { test } from "node:test";
import type { SendEmailCommandInput, SESv2Client } from "@aws-sdk/client-sesv2";
import { createConfirmationToken } from "../../lib/src/users/domain/confirmation-token.entity";
import { SesSignUpEmails } from "../../lib/src/users/infrastructure/email/ses/sign-up-emails";
import { buildUser } from "./fakes";

export const FROM_ADDRESS = "WizyDoc <no-reply@wizydoc.app>";
export const TEMPLATE_NAMES = {
  confirmEmail: "Test-confirm-email",
  pendingConfirmation: "Test-pending-confirmation",
  accountExists: "Test-account-exists",
};

export const capturingSes = () => {
  const inputs: SendEmailCommandInput[] = [];
  const sesClient = {
    send: async (command: { input: SendEmailCommandInput }) => {
      inputs.push(command.input);
      return {};
    },
  } as unknown as SESv2Client;
  return { sesClient, inputs };
};

export const emailsFor = (sesClient: SESv2Client) =>
  new SesSignUpEmails(sesClient, {
    fromAddress: FROM_ADDRESS,
    frontendUrl: "https://app.wizydoc.app/",
    templates: TEMPLATE_NAMES,
  });

export const templateDataOf = (input: SendEmailCommandInput) =>
  JSON.parse(input.Content?.Template?.TemplateData ?? "{}");

test("la confirmación usa su plantilla, con el token en el fragmento del enlace a /verify-email", async () => {
  const { sesClient, inputs } = capturingSes();
  const user = buildUser({ confirmed: false });
  const confirmationToken = createConfirmationToken(user.id);

  await emailsFor(sesClient).sendConfirmation(user, confirmationToken);

  const [sent] = inputs;
  assert.equal(sent.FromEmailAddress, FROM_ADDRESS);
  assert.deepEqual(sent.Destination?.ToAddresses, ["ana@clinica.pe"]);
  assert.equal(sent.Content?.Simple, undefined);
  assert.equal(sent.Content?.Template?.TemplateName, "Test-confirm-email");
  assert.deepEqual(templateDataOf(sent), {
    name: "Ana",
    escapedName: "Ana",
    confirmUrl: `https://app.wizydoc.app/verify-email#token=${confirmationToken.token}`,
    linkLifetimeHours: "24",
  });
});

test("a una cuenta sin confirmar le manda el aviso con el enlace para confirmarla", async () => {
  const { sesClient, inputs } = capturingSes();
  const user = buildUser({ confirmed: false });
  const confirmationToken = createConfirmationToken(user.id);

  await emailsFor(sesClient).sendPendingConfirmation(user, confirmationToken);

  const [sent] = inputs;
  assert.equal(
    sent.Content?.Template?.TemplateName,
    "Test-pending-confirmation",
  );
  assert.equal(
    templateDataOf(sent).confirmUrl,
    `https://app.wizydoc.app/verify-email#token=${confirmationToken.token}`,
  );
});

test("a una cuenta confirmada le manda el aviso con los enlaces para iniciar sesión y cambiar la contraseña", async () => {
  const { sesClient, inputs } = capturingSes();

  await emailsFor(sesClient).sendAccountExists(buildUser());

  const [sent] = inputs;
  assert.equal(sent.Content?.Template?.TemplateName, "Test-account-exists");
  assert.deepEqual(templateDataOf(sent), {
    name: "Ana",
    escapedName: "Ana",
    loginUrl: "https://app.wizydoc.app/login",
    forgotPasswordUrl: "https://app.wizydoc.app/forgot-password",
  });
});

test("manda el nombre escapado para el HTML, porque SES no escapa los datos", async () => {
  const { sesClient, inputs } = capturingSes();

  await emailsFor(sesClient).sendAccountExists(
    buildUser({ name: '<img src=x onerror="alert(1)">' }),
  );

  const templateData = templateDataOf(inputs[0]);
  assert.equal(templateData.name, '<img src=x onerror="alert(1)">');
  assert.equal(
    templateData.escapedName,
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
});
