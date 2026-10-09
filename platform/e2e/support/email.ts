import { readFileSync } from "node:fs";
import { EMAIL_CAPTURE_PATH } from "./env";

export interface CapturedEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
  sentAt: string;
}

export function readEmailsTo(email: string): CapturedEmail[] {
  let capturedEmailsFile: string;
  try {
    capturedEmailsFile = readFileSync(EMAIL_CAPTURE_PATH, "utf-8");
  } catch {
    return [];
  }

  return capturedEmailsFile
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CapturedEmail)
    .filter((capturedEmail) => capturedEmail.to === email);
}

export function readLatestEmailTo(email: string): CapturedEmail | undefined {
  return readEmailsTo(email).at(-1);
}

// Handlebars escapa el href como HTML; el regex no lo decodifica solo, como haría un navegador.
function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x3D;/g, "=")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function extractLink(html: string, pathFragment: string): string {
  const hrefPattern = /href="([^"]+)"/g;

  for (const match of html.matchAll(hrefPattern)) {
    const href = decodeHtmlEntities(match[1]);
    if (href.includes(pathFragment)) {
      return href;
    }
  }

  throw new Error(
    `No se encontró un enlace que contenga "${pathFragment}" en el correo`,
  );
}
