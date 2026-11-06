import assert from "node:assert/strict";
import { test } from "node:test";
import type { SendEmailCommandInput, SESv2Client } from "@aws-sdk/client-sesv2";
import { createConfirmationToken } from "../../lib/src/users/domain/confirmation-token.entity";
import { SesSignUpEmails } from "../../lib/src/users/infrastructure/email/ses/sign-up-emails";
import { buildUser } from "./fakes";

const FROM_ADDRESS = "WizyDoc <no-reply@wizydoc.app>";

const capturingSes = () => {
  const inputs: SendEmailCommandInput[] = [];
  const sesClient = {
    send: async (command: { input: SendEmailCommandInput }) => {
      inputs.push(command.input);
      return {};
    },
  } as unknown as SESv2Client;
  return { sesClient, inputs };
};

const emailsFor = (sesClient: SESv2Client) =>
  new SesSignUpEmails(sesClient, {
    fromAddress: FROM_ADDRESS,
    frontendUrl: "https://app.wizydoc.app/",
  });

test("la confirmación lleva el token en el fragmento del enlace a /verify-email", async () => {
  const { sesClient, inputs } = capturingSes();
  const user = buildUser({ confirmed: false });
  const confirmationToken = createConfirmationToken(user.id);

  await emailsFor(sesClient).sendConfirmation(user, confirmationToken);

  const [sent] = inputs;
  const confirmUrl = `https://app.wizydoc.app/verify-email#token=${confirmationToken.token}`;
  assert.equal(sent.FromEmailAddress, FROM_ADDRESS);
  assert.deepEqual(sent.Destination?.ToAddresses, ["ana@clinica.pe"]);
  assert.equal(
    sent.Content?.Simple?.Subject?.Data,
    "Confirma tu correo en WizyDoc",
  );
  assert.ok(sent.Content?.Simple?.Body?.Html?.Data?.includes(confirmUrl));
  assert.ok(sent.Content?.Simple?.Body?.Text?.Data?.includes(confirmUrl));
  assert.ok(
    sent.Content?.Simple?.Body?.Text?.Data?.includes("vence en 24 horas"),
  );
});

test("a una cuenta confirmada le avisa del intento, con enlaces para iniciar sesión y cambiar la contraseña", async () => {
  const { sesClient, inputs } = capturingSes();

  await emailsFor(sesClient).sendAccountExists(buildUser());

  const [sent] = inputs;
  const html = sent.Content?.Simple?.Body?.Html?.Data ?? "";
  const text = sent.Content?.Simple?.Body?.Text?.Data ?? "";
  assert.equal(
    sent.Content?.Simple?.Subject?.Data,
    "Intentaron crear una cuenta con tu correo",
  );
  assert.ok(html.includes('href="https://app.wizydoc.app/login"'));
  assert.ok(html.includes('href="https://app.wizydoc.app/forgot-password"'));
  assert.ok(html.includes("Cambiar contraseña"));
  assert.ok(text.includes("te recomendamos cambiar tu contraseña"));
});

test("a una cuenta sin confirmar le avisa del intento y le da el botón para confirmarla", async () => {
  const { sesClient, inputs } = capturingSes();
  const user = buildUser({ confirmed: false });
  const confirmationToken = createConfirmationToken(user.id);

  await emailsFor(sesClient).sendPendingConfirmation(user, confirmationToken);

  const [sent] = inputs;
  const html = sent.Content?.Simple?.Body?.Html?.Data ?? "";
  const confirmUrl = `https://app.wizydoc.app/verify-email#token=${confirmationToken.token}`;
  assert.equal(
    sent.Content?.Simple?.Subject?.Data,
    "Confirma tu cuenta en WizyDoc",
  );
  assert.ok(html.includes("Alguien intentó crear una cuenta"));
  assert.ok(html.includes("Si fuiste tú, confírmala"));
  assert.ok(html.includes(confirmUrl));
  assert.ok(html.includes("Confirmar cuenta"));
});

test("el nombre se escapa en el HTML del correo", async () => {
  const { sesClient, inputs } = capturingSes();

  await emailsFor(sesClient).sendAccountExists(
    buildUser({ name: '<img src=x onerror="alert(1)">' }),
  );

  const html = inputs[0].Content?.Simple?.Body?.Html?.Data ?? "";
  assert.equal(html.includes("<img"), false);
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
});
