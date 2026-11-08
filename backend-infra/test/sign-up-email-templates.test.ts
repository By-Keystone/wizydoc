import assert from "node:assert/strict";
import { test } from "node:test";
import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { SignUpEmailTemplates } from "../lib/sign-up-email-templates";
import {
  type ConfirmationToken,
  createConfirmationToken,
} from "../lib/src/users/domain/confirmation-token.entity";
import { createSignUpCode } from "../lib/src/users/domain/sign-up-code.entity";
import type { User } from "../lib/src/users/domain/user.entity";
import type { SesSignUpEmails } from "../lib/src/users/infrastructure/email/ses/sign-up-emails";
import {
  buildUser,
  capturingSes,
  emailsFor,
  TEMPLATES_STACK_NAME,
  templateDataOf,
} from "./users/fakes";

interface SesTemplate {
  TemplateName: string;
  SubjectPart: string;
  HtmlPart: string;
  TextPart: string;
}

type SendEmail = (
  emails: SesSignUpEmails,
  user: User,
  confirmationToken: ConfirmationToken,
) => Promise<void>;

const PLACEHOLDER = /{{\s*(\w+)\s*}}/g;
const NAME_WITH_HTML = "Ñandú & <b>";
const ESCAPED_NAME_WITH_HTML = "Ñandú &amp; &lt;b&gt;";

const sendConfirmation: SendEmail = (emails, user, confirmationToken) =>
  emails.sendConfirmation(user, confirmationToken);
const sendPendingConfirmation: SendEmail = (emails, user, confirmationToken) =>
  emails.sendPendingConfirmation(user, confirmationToken);
const sendAccountExists: SendEmail = (emails, user) =>
  emails.sendAccountExists(user.email);
const sendSignUpCode: SendEmail = (emails, user) =>
  emails.sendSignUpCode(createSignUpCode(user.email));

const synthesizedTemplates = (): Map<string, SesTemplate> => {
  const stack = new Stack(new App(), TEMPLATES_STACK_NAME);
  new SignUpEmailTemplates(stack, "SignUpEmailTemplates");
  const resources =
    Template.fromStack(stack).findResources("AWS::SES::Template");
  return new Map(
    Object.values(resources).map((resource) => {
      const sesTemplate: SesTemplate = resource.Properties.Template;
      return [sesTemplate.TemplateName, sesTemplate];
    }),
  );
};

const SES_TEMPLATES = synthesizedTemplates();

const fillPlaceholders = (
  content: string,
  templateData: Record<string, string>,
): string =>
  content.replace(
    PLACEHOLDER,
    (_, placeholder: string) => templateData[placeholder],
  );

const placeholdersOf = (content: string): string[] =>
  [
    ...new Set(
      [...content.matchAll(PLACEHOLDER)].map(([, placeholder]) => placeholder),
    ),
  ].sort();

const collapsedWhitespace = (text: string): string =>
  text.replace(/\s+/g, " ").trim();

const visibleText = (html: string): string =>
  collapsedWhitespace(html.replace(/<[^>]+>/g, " "));

const buttonsOf = (html: string) =>
  [...html.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map(
    ([, href, label]) => ({ label, href }),
  );

const sendAndRender = async (sendEmail: SendEmail) => {
  const { sesClient, inputs } = capturingSes();
  const user = buildUser({ name: NAME_WITH_HTML, confirmed: false });
  const confirmationToken = createConfirmationToken(user.id);

  await sendEmail(emailsFor(sesClient), user, confirmationToken);

  const [sent] = inputs;
  const sesTemplate = SES_TEMPLATES.get(
    sent.Content?.Template?.TemplateName ?? "",
  );
  assert.ok(sesTemplate, "el adaptador usa una plantilla que el stack no crea");
  const templateData = templateDataOf(sent);
  return {
    sesTemplate,
    templateData,
    confirmUrl: `https://app.wizydoc.app/verify-email#token=${confirmationToken.token}`,
    html: fillPlaceholders(sesTemplate.HtmlPart, templateData),
    text: fillPlaceholders(sesTemplate.TextPart, templateData),
  };
};

const assertSaysInBothParts = (
  email: { html: string; text: string },
  paragraphs: string[],
) => {
  const htmlText = visibleText(email.html);
  const plainText = collapsedWhitespace(email.text);
  for (const paragraph of paragraphs) {
    assert.ok(htmlText.includes(paragraph), `HTML: ${paragraph}`);
    assert.ok(plainText.includes(paragraph), `texto: ${paragraph}`);
  }
};

test("la confirmación dice el texto de la spec, con el botón «Confirmar correo» al enlace con el token y el plazo de 24 horas", async () => {
  const email = await sendAndRender(sendConfirmation);

  assert.equal(email.sesTemplate.SubjectPart, "Confirma tu correo en WizyDoc");
  assertSaysInBothParts(email, [
    "Gracias por registrarte en WizyDoc. Para activar tu cuenta, confirma tu correo haciendo clic en el botón:",
    "El enlace vence en 24 horas. Si no creaste esta cuenta, puedes ignorar este correo.",
  ]);
  assert.deepEqual(buttonsOf(email.html), [
    { label: "Confirmar correo", href: email.confirmUrl },
  ]);
  assert.ok(email.text.includes(email.confirmUrl));
});

test("el aviso a una cuenta sin confirmar dice el texto de la spec, con el botón «Confirmar cuenta» al enlace con el token y el plazo de 24 horas", async () => {
  const email = await sendAndRender(sendPendingConfirmation);

  assert.equal(email.sesTemplate.SubjectPart, "Confirma tu cuenta en WizyDoc");
  assertSaysInBothParts(email, [
    "Alguien intentó crear una cuenta en WizyDoc con este correo. Tu cuenta todavía no está confirmada.",
    "Si fuiste tú, confírmala con este botón:",
    "El enlace vence en 24 horas. Si no fuiste tú, ignora este correo: la cuenta no se activa sin tu confirmación.",
  ]);
  assert.deepEqual(buttonsOf(email.html), [
    { label: "Confirmar cuenta", href: email.confirmUrl },
  ]);
  assert.ok(email.text.includes(email.confirmUrl));
});

test("el aviso a una cuenta confirmada dice el texto de la spec, con los botones para iniciar sesión y cambiar la contraseña", async () => {
  const email = await sendAndRender(sendAccountExists);

  assert.equal(
    email.sesTemplate.SubjectPart,
    "Intentaron crear una cuenta con tu correo",
  );
  assertSaysInBothParts(email, [
    "Alguien intentó crear una cuenta en WizyDoc con este correo. Ya tienes una cuenta con él.",
    "Si fuiste tú, inicia sesión:",
    "Si no fuiste tú, te recomendamos cambiar tu contraseña:",
  ]);
  assert.deepEqual(buttonsOf(email.html), [
    { label: "Iniciar sesión", href: "https://app.wizydoc.app/login" },
    {
      label: "Cambiar contraseña",
      href: "https://app.wizydoc.app/forgot-password",
    },
  ]);
  assert.ok(email.text.includes("https://app.wizydoc.app/login"));
  assert.ok(email.text.includes("https://app.wizydoc.app/forgot-password"));
});

test("el correo del código dice el texto de la spec, con el código y el plazo de 10 minutos, sin botones", async () => {
  const email = await sendAndRender(sendSignUpCode);

  assert.equal(
    email.sesTemplate.SubjectPart,
    "Tu código para crear tu cuenta en WizyDoc",
  );
  assertSaysInBothParts(email, [
    "Hola,",
    "Tu código para crear tu cuenta en WizyDoc es:",
    email.templateData.code,
    "Vence en 10 minutos. Si no pediste crear una cuenta, ignora este correo.",
  ]);
  assert.match(email.templateData.code, /^\d{6}$/);
  assert.deepEqual(buttonsOf(email.html), []);
});

test("cada plantilla usa exactamente los datos que manda el adaptador: las confirmaciones, el HTML con el nombre escapado y el texto con el nombre tal cual", async () => {
  for (const sendEmail of [sendConfirmation, sendPendingConfirmation]) {
    const { sesTemplate, templateData, html, text } =
      await sendAndRender(sendEmail);
    const sentKeys = Object.keys(templateData);
    const templateName = sesTemplate.TemplateName;

    assert.deepEqual(
      placeholdersOf(sesTemplate.HtmlPart),
      sentKeys.filter((key) => key !== "name").sort(),
      templateName,
    );
    assert.deepEqual(
      placeholdersOf(sesTemplate.TextPart),
      sentKeys.filter((key) => key !== "escapedName").sort(),
      templateName,
    );
    assert.ok(html.includes(`Hola ${ESCAPED_NAME_WITH_HTML},`), templateName);
    assert.equal(html.includes("<b>"), false, templateName);
    assert.ok(text.startsWith(`Hola ${NAME_WITH_HTML},`), templateName);
  }
});

test("las plantillas sin nombre usan exactamente los datos que manda el adaptador, en el HTML y en el texto", async () => {
  for (const sendEmail of [sendAccountExists, sendSignUpCode]) {
    const { sesTemplate, templateData, html, text } =
      await sendAndRender(sendEmail);
    const sentKeys = Object.keys(templateData).sort();
    const templateName = sesTemplate.TemplateName;

    assert.deepEqual(
      placeholdersOf(sesTemplate.HtmlPart),
      sentKeys,
      templateName,
    );
    assert.deepEqual(
      placeholdersOf(sesTemplate.TextPart),
      sentKeys,
      templateName,
    );
    assert.ok(visibleText(html).startsWith("Hola,"), templateName);
    assert.ok(text.startsWith("Hola,"), templateName);
  }
});
