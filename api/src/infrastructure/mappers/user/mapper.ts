import type { User as PrismaUser } from "@prisma/client";
import type { User } from "@/domain/entities/user/entity";

export function toDomain(user: PrismaUser): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    lastName: user.lastName,
    phone: user.phone,
    treatment: user.treatment,
    confirmed: user.confirmed,
    onboardingCompleted: user.onboardingCompleted,
    accountId: user.accountId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
