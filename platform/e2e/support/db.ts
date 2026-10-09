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

export interface TestPrismaInvitationRow {
  id: string;
  token: string;
  membershipId: string;
  status: string;
  acceptedAt: Date | null;
  expiresAt: Date;
}

export interface TestPrismaSessionRow {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface TestPrismaAccountRow {
  id: string;
  name: string;
  ownerId: string;
}

export interface TestPrismaSubscriptionRow {
  accountId: string;
  plan: string;
  status: string;
  extraDoctors: number;
  extraClinics: number;
  paymentProviderCustomerId: string | null;
  paymentProviderCardId: string | null;
  paymentProviderSubscriptionId: string | null;
}

export interface TestPrismaAppointmentRow {
  id: string;
  doctorProfileId: string;
  clinicId: string;
  patientId: string;
  scheduledAt: Date;
  status: string;
  specialty: string;
  cancelledAt: Date | null;
  rescheduleCount: number;
}

export interface TestPrisma {
  user: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findUnique(args: {
      where: Record<string, unknown>;
    }): Promise<TestPrismaUserRow | null>;
    update(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<TestPrismaUserRow>;
  };
  account: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findFirst(args: {
      where: Record<string, unknown>;
    }): Promise<TestPrismaAccountRow | null>;
  };
  subscription: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findUnique(args: {
      where: Record<string, unknown>;
    }): Promise<TestPrismaSubscriptionRow | null>;
    update(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<TestPrismaSubscriptionRow>;
  };
  organization: {
    findFirst(args: {
      where: Record<string, unknown>;
    }): Promise<{ resourceId: string } | null>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
  clinic: {
    findFirst(args: {
      where: Record<string, unknown>;
    }): Promise<{ resourceId: string } | null>;
    create(args: {
      data: Record<string, unknown>;
    }): Promise<{ resourceId: string }>;
  };
  resource: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
  userResourceMembership: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    update(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<unknown>;
    findFirst(args: {
      where: Record<string, unknown>;
    }): Promise<{ id: string; role: string; resourceId: string } | null>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findMany(args: { where: Record<string, unknown> }): Promise<unknown[]>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  doctorProfile: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findMany(args: { where: Record<string, unknown> }): Promise<unknown[]>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    findFirst(args: {
      where: Record<string, unknown>;
    }): Promise<{ id: string } | null>;
    findUniqueOrThrow(args: {
      where: Record<string, unknown>;
    }): Promise<{ id: string }>;
  };
  authAccount: {
    findMany(args: {
      where: Record<string, unknown>;
    }): Promise<{ providerId: string }[]>;
  };
  session: {
    findFirst(args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
    }): Promise<TestPrismaSessionRow | null>;
  };
  availability: {
    createMany(args: { data: Record<string, unknown>[] }): Promise<unknown>;
  };
  userInvitation: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findMany(args: { where: Record<string, unknown> }): Promise<unknown[]>;
    findFirst(args: {
      where: Record<string, unknown>;
    }): Promise<TestPrismaInvitationRow | null>;
    findUnique(args: {
      where: Record<string, unknown>;
    }): Promise<TestPrismaInvitationRow | null>;
    update(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<TestPrismaInvitationRow>;
  };
  specialty: {
    findUnique(args: {
      where: Record<string, unknown>;
    }): Promise<{ id: string; name: string; organizationId: string } | null>;
  };
  patient: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findFirst(args: { where: Record<string, unknown> }): Promise<{
      id: string;
      name: string;
      lastName: string;
      email: string;
      phone: string;
      birthDate: string | null;
    } | null>;
  };
  appointment: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findFirst(args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
    }): Promise<TestPrismaAppointmentRow | null>;
    findMany(args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
    }): Promise<TestPrismaAppointmentRow[]>;
    update(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<TestPrismaAppointmentRow>;
  };
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
  $disconnect(): Promise<void>;
}

let testPrismaPromise: Promise<TestPrisma> | undefined;

export function getTestPrisma(): Promise<TestPrisma> {
  if (!testPrismaPromise) {
    testPrismaPromise = import(clientModulePath).then(
      (clientModule) => clientModule.prisma,
    );
  }
  return testPrismaPromise;
}
