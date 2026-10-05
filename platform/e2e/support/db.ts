import { apiEnv, assertTestDatabase } from "./env";

assertTestDatabase(apiEnv.DATABASE_URL);
// `client.ts` lee DATABASE_URL al importarse, antes del import dinámico de abajo.
process.env.DATABASE_URL = apiEnv.DATABASE_URL;

// Variable, no literal: tsc no resuelve @prisma/client por el symlink de node_modules; sólo Node lo hace, en runtime.
const clientModulePath = "../../../api/src/infrastructure/postgres/client";

export interface TestPrismaUserRow {
  id: string;
  email: string;
  name: string;
  accountId: string | null;
  role: string;
  confirmed: boolean;
  onboardingCompleted: boolean;
}

export interface TestPrisma {
  user: {
    findUnique(args: { where: Record<string, unknown> }): Promise<TestPrismaUserRow | null>;
    update(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<TestPrismaUserRow>;
  };
  organization: {
    findFirst(args: { where: Record<string, unknown> }): Promise<{ resourceId: string } | null>;
  };
  clinic: {
    findFirst(args: { where: Record<string, unknown> }): Promise<{ resourceId: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ resourceId: string }>;
  };
  resource: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  userResourceMembership: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    update(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<unknown>;
    findFirst(args: {
      where: Record<string, unknown>;
    }): Promise<{ id: string; role: string; resourceId: string } | null>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
  doctorProfile: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
  userInvitation: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $disconnect(): Promise<void>;
}

let testPrismaPromise: Promise<TestPrisma> | undefined;

export function getTestPrisma(): Promise<TestPrisma> {
  if (!testPrismaPromise) {
    testPrismaPromise = import(clientModulePath).then((clientModule) => clientModule.prisma);
  }
  return testPrismaPromise;
}
