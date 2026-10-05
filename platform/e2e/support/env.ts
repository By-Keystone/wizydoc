import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import dotenv from "dotenv";

export const PLATFORM_DIR = resolve(__dirname, "../..");
export const API_DIR = resolve(PLATFORM_DIR, "../api");

function readEnvFile(path: string, label: string): Record<string, string> {
  try {
    return dotenv.parse(readFileSync(path));
  } catch {
    throw new Error(`Falta ${label}: ver docs/features/e2e-infra/plan.md`);
  }
}

export const apiEnv = readEnvFile(join(API_DIR, ".env.e2e"), "api/.env.e2e");
export const platformEnv = readEnvFile(
  join(PLATFORM_DIR, ".env.e2e"),
  "platform/.env.e2e",
);

export const API_BASE_URL = `http://localhost:${apiEnv.PORT}`;
export const PLATFORM_BASE_URL = apiEnv.CLIENT_ORIGIN;

export const EMAIL_CAPTURE_PATH = resolve(API_DIR, apiEnv.EMAIL_CAPTURE_FILE);

const TEST_DB_PORT = "5433";
const TEST_DB_PATH = "/wizydoc_test";

export function assertTestDatabase(databaseUrl: string): void {
  const url = new URL(databaseUrl);
  const isLocalHost =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";

  if (
    !isLocalHost ||
    url.port !== TEST_DB_PORT ||
    url.pathname !== TEST_DB_PATH
  ) {
    throw new Error(
      `DATABASE_URL de e2e debe apuntar a localhost:${TEST_DB_PORT}${TEST_DB_PATH} ` +
        "(el contenedor de api/docker-compose.e2e.yml), nunca a la base de desarrollo.",
    );
  }
}

export function assertE2eEnvironment(): void {
  assertTestDatabase(apiEnv.DATABASE_URL);

  if (apiEnv.EMAIL_DRIVER !== "memory") {
    throw new Error(
      "api/.env.e2e debe tener EMAIL_DRIVER=memory: con otro valor los e2e enviarían correos reales por SES.",
    );
  }

  if (apiEnv.NODE_ENV !== "test") {
    throw new Error(
      "api/.env.e2e debe tener NODE_ENV=test: es el único valor con el que la factory de correo acepta EMAIL_DRIVER=memory.",
    );
  }

  if (!platformEnv.NEXT_DIST_DIR || platformEnv.NEXT_DIST_DIR === ".next") {
    throw new Error(
      'platform/.env.e2e debe definir NEXT_DIST_DIR distinto de ".next": si no, el `next dev` ' +
        "de e2e pisaría la carpeta del `pnpm dev` de desarrollo.",
    );
  }
}
