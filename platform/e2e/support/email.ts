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

interface EmailWaitOptions {
  subject?: string;
  timeoutMs?: number;
  afterCount?: number;
}

const POLL_INTERVAL_MS = 100;
const DEFAULT_WAIT_TIMEOUT_MS = 5_000;
const DEFAULT_ABSENCE_WINDOW_MS = 2_000;

function findEmail(
  email: string,
  subject?: string,
  afterCount = 0,
): CapturedEmail | undefined {
  return readEmailsTo(email)
    .slice(afterCount)
    .filter((captured) => !subject || captured.subject === subject)
    .at(-1);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Hay correos que el api envía sin esperar el envío, así que pueden llegar al
// archivo un instante después de la respuesta: se reintenta hasta el tope.
export async function waitForEmailTo(
  email: string,
  {
    subject,
    timeoutMs = DEFAULT_WAIT_TIMEOUT_MS,
    afterCount,
  }: EmailWaitOptions = {},
): Promise<CapturedEmail> {
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const found = findEmail(email, subject, afterCount);
    if (found) return found;
    if (Date.now() >= deadline) {
      throw new Error(
        `No llegó ningún correo${subject ? ` "${subject}"` : ""} a ${email} en ${timeoutMs} ms`,
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

// Un "no llegó" solo vale tras dejar pasar la ventana en la que el envío sin
// espera ya habría escrito el correo.
export async function expectNoEmailTo(
  email: string,
  {
    subject,
    timeoutMs = DEFAULT_ABSENCE_WINDOW_MS,
    afterCount,
  }: EmailWaitOptions = {},
): Promise<void> {
  await sleep(timeoutMs);

  if (findEmail(email, subject, afterCount)) {
    throw new Error(
      `Llegó un correo${subject ? ` "${subject}"` : ""} a ${email} que no debía llegar`,
    );
  }
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
