import assert from "node:assert/strict";
import { test } from "node:test";
import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { SignUpEmailTemplates } from "../lib/sign-up-email-templates";
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

type SendEmail = (emails: SesSignUpEmails, user: User) => Promise<void>;

const PLACEHOLDER = /{{\s*(\w+)\s*}}/g;

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
  const user = buildUser();

  await sendEmail(emailsFor(sesClient), user);

  const [sent] = inputs;
  const sesTemplate = SES_TEMPLATES.get(
    sent.Content?.Template?.TemplateName ?? "",
  );
  assert.ok(sesTemplate, "el adaptador usa una plantilla que el stack no crea");
  const templateData = templateDataOf(sent);
  return {
    sesTemplate,
    templateData,
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

test("el aviso a un correo con cuenta dice el texto de la spec, con los botones para iniciar sesión y cambiar la contraseña", async () => {
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

test("cada plantilla usa exactamente los datos que manda el adaptador, en el HTML y en el texto", async () => {
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
