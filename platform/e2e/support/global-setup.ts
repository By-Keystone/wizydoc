import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import {
  API_DIR,
  EMAIL_CAPTURE_PATH,
  apiEnv,
  assertE2eEnvironment,
} from "./env";
import { getTestPrisma } from "./db";

export default async function globalSetup(): Promise<void> {
  assertE2eEnvironment();

  const testPrisma = await getTestPrisma();
  try {
    await testPrisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error(
      "La base de pruebas no responde en localhost:5433. Levántala con: " +
        "cd api && docker compose -f docker-compose.e2e.yml up -d",
    );
  } finally {
    await testPrisma.$disconnect();
  }

  execFileSync("./node_modules/.bin/prisma", ["migrate", "deploy"], {
    cwd: API_DIR,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: apiEnv.DATABASE_URL,
      DOTENV_CONFIG_PATH: ".env.e2e",
    },
  });

  rmSync(EMAIL_CAPTURE_PATH, { force: true });
}
