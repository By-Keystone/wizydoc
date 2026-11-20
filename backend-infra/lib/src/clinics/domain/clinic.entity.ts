import { type ULID, ulid } from "ulid";
import type { NewMembership } from "./membership.entity";
import type { Organization } from "./organization.entity";

export interface Clinic {
  id: ULID;
  accountId: ULID;
  organizationId: ULID;
  name: string;
  address: string;
}

export interface OwnerClinic {
  ownerUserId: ULID;
  organization: Organization;
  clinic: Clinic;
  memberships: [NewMembership, NewMembership];
}

export interface CreateOwnerClinicInput {
  ownerUserId: ULID;
  accountId: ULID;
  name: string;
  address: string;
  specialty: string;
}

export const createOwnerClinic = (
  { ownerUserId, accountId, name, address, specialty }: CreateOwnerClinicInput,
  now = new Date(),
): OwnerClinic => {
  const organization = {
    id: ulid(now.getTime()),
    accountId,
    name,
  };
  const clinic = {
    id: ulid(now.getTime()),
    accountId,
    organizationId: organization.id,
    name,
    address,
  };
  return {
    ownerUserId,
    organization,
    clinic,
    memberships: [
      {
        userId: ownerUserId,
        resourceId: organization.id,
        resourceType: "ORGANIZATION",
        accountId,
        role: "ADMIN",
      },
      {
        userId: ownerUserId,
        resourceId: clinic.id,
        resourceType: "CLINIC",
        accountId,
        role: "DOCTOR",
        specialties: [specialty],
      },
    ],
  };
};
