import type { Organization } from "@/domain/entities/organization/entity";
import type { Organization as PrismaOrganization } from "@prisma/client";

export function toDomain(organization: PrismaOrganization): Organization {
  return organization;
}
