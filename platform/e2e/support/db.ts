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
  lastName: string;
  phone: string;
  accountId: string | null;
  role: string;
  confirmed: boolean;
  onboardingCompleted: boolean;
  treatment: string | null;
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
  specialty: string;
  durationMinutes: number;
  status: string;
  scheduledAt: Date;
  rescheduleCount: number;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

export interface TestPrismaVerificationRow {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
}

export interface TestPrismaProfileRow {
  id: string;
  userId: string;
  clinicId: string;
  specialties: { id: string }[];
}

export interface TestPrisma {
  user: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findUnique(args: {
      where: Record<string, unknown>;
    }): Promise<TestPrismaUserRow | null>;
    findUniqueOrThrow(args: {
      where: Record<string, unknown>;
    }): Promise<TestPrismaUserRow>;
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
    findMany(args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }): Promise<TestPrismaProfileRow[]>;
    findUnique(args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }): Promise<TestPrismaProfileRow | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    findFirst(args: {
      where: Record<string, unknown>;
    }): Promise<{ id: string } | null>;
    findUniqueOrThrow(args: {
      where: Record<string, unknown>;
    }): Promise<{ id: string }>;
    findFirstOrThrow(args: {
      where: Record<string, unknown>;
    }): Promise<{ id: string }>;
    update(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
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
    deleteMany(args: {
      where: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  availability: {
    createMany(args: { data: Record<string, unknown>[] }): Promise<unknown>;
    deleteMany(args: {
      where: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  appointmentAccessToken: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
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
    findMany(args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }): Promise<{ id: string }[]>;
    createMany(args: { data: Record<string, unknown>[] }): Promise<unknown>;
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
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findMany(args: {
      where: Record<string, unknown>;
    }): Promise<TestPrismaAppointmentRow[]>;
    findFirst(args: {
      where: Record<string, unknown>;
    }): Promise<TestPrismaAppointmentRow | null>;
    findUniqueOrThrow(args: {
      where: Record<string, unknown>;
    }): Promise<TestPrismaAppointmentRow>;
    update(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<TestPrismaAppointmentRow>;
  };
  verification: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findMany(args: {
      where: Record<string, unknown>;
    }): Promise<TestPrismaVerificationRow[]>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
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
