import { CONFIRMATION_TOKEN_LIFETIME_HOURS } from "../../domain/confirmation-token.entity";

const BRAND_COLOR = "#0E8C82";
const MUTED_TEXT_COLOR = "#5C6B6A";
const PAGE_BACKGROUND_COLOR = "#f4f4f4";
const SOMEONE_TRIED_TO_SIGN_UP =
  "Alguien intentó crear una cuenta en WizyDoc con este correo.";

export interface EmailMessage {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const greeting = (name: string): string =>
  `<p style="margin:0 0 16px;font-size:20px;font-weight:bold;">Hola ${escapeHtml(name)},</p>`;

const paragraph = (text: string): string =>
  `<p style="margin:0 0 16px;font-size:16px;line-height:24px;">${text}</p>`;

const note = (text: string): string =>
  `<p style="margin:0;font-size:14px;line-height:20px;color:${MUTED_TEXT_COLOR};">${text}</p>`;

const button = (label: string, href: string): string =>
  `<p style="margin:24px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;background-color:${BRAND_COLOR};color:#ffffff;font-size:16px;text-decoration:none;border-radius:4px;">${label}</a></p>`;

const layout = (blocks: string[]): string =>
  `<!doctype html><html lang="es"><body style="margin:0;padding:24px 0;background-color:${PAGE_BACKGROUND_COLOR};font-family:Arial,Helvetica,sans-serif;color:#000000;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;"><tr><td style="padding:40px;">${blocks.join("")}</td></tr></table></td></tr></table></body></html>`;

const linkExpiration = `El enlace vence en ${CONFIRMATION_TOKEN_LIFETIME_HOURS} horas.`;

export interface ConfirmEmailContent {
  name: string;
  confirmUrl: string;
}

export const confirmEmailMessage = ({
  name,
  confirmUrl,
}: ConfirmEmailContent): EmailMessage => {
  const invitation =
    "Gracias por registrarte en WizyDoc. Para activar tu cuenta, confirma tu correo haciendo clic en el botón:";
  const closing = `${linkExpiration} Si no creaste esta cuenta, puedes ignorar este correo.`;

  return {
    subject: "Confirma tu correo en WizyDoc",
    html: layout([
      greeting(name),
      paragraph(invitation),
      button("Confirmar correo", confirmUrl),
      note(closing),
    ]),
    text: [`Hola ${name},`, invitation, confirmUrl, closing].join("\n\n"),
  };
};

export const pendingConfirmationMessage = ({
  name,
  confirmUrl,
}: ConfirmEmailContent): EmailMessage => {
  const status = `${SOMEONE_TRIED_TO_SIGN_UP} Tu cuenta todavía no está confirmada.`;
  const invitation = "Si fuiste tú, confírmala con este botón:";
  const closing = `${linkExpiration} Si no fuiste tú, ignora este correo: la cuenta no se activa sin tu confirmación.`;

  return {
    subject: "Confirma tu cuenta en WizyDoc",
    html: layout([
      greeting(name),
      paragraph(status),
      paragraph(invitation),
      button("Confirmar cuenta", confirmUrl),
      note(closing),
    ]),
    text: [`Hola ${name},`, status, invitation, confirmUrl, closing].join(
      "\n\n",
    ),
  };
};

export interface AccountExistsContent {
  name: string;
  loginUrl: string;
  forgotPasswordUrl: string;
}

export const accountExistsMessage = ({
  name,
  loginUrl,
  forgotPasswordUrl,
}: AccountExistsContent): EmailMessage => {
  const explanation = `${SOMEONE_TRIED_TO_SIGN_UP} Ya tienes una cuenta con él.`;
  const ifItWasYou = "Si fuiste tú, inicia sesión:";
  const ifItWasNotYou =
    "Si no fuiste tú, te recomendamos cambiar tu contraseña:";

  return {
    subject: "Intentaron crear una cuenta con tu correo",
    html: layout([
      greeting(name),
      paragraph(explanation),
      paragraph(ifItWasYou),
      button("Iniciar sesión", loginUrl),
      paragraph(ifItWasNotYou),
      button("Cambiar contraseña", forgotPasswordUrl),
    ]),
    text: [
      `Hola ${name},`,
      explanation,
      `${ifItWasYou} ${loginUrl}`,
      `${ifItWasNotYou} ${forgotPasswordUrl}`,
    ].join("\n\n"),
  };
};
