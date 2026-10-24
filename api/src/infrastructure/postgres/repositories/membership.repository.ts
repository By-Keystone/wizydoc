import type {
  AttendingOutcome,
  GrantAttendingInput,
  IMembershipRepository,
} from "@/domain/repositories/membership.repository";
import { getClient } from "../transaction-context";

export class MembershipRepository implements IMembershipRepository {
  async findOrganizationAdminIds(
    organizationId: string,
    accountId: string,
  ): Promise<string[]> {
    const memberships = await getClient().userResourceMembership.findMany({
      where: {
        resourceId: organizationId,
        accountId,
        role: "ADMIN",
        deletedAt: null,
      },
      select: { userId: true },
    });
    return memberships.map((membership) => membership.userId);
  }

  async findOrganizationClinicIds(
    organizationId: string,
    accountId: string,
  ): Promise<string[]> {
    const clinics = await getClient().resource.findMany({
      where: { parentResourceId: organizationId, accountId, type: "CLINIC" },
      select: { id: true },
    });
    return clinics.map((clinic) => clinic.id);
  }

  async grantAttending({
    userId,
    clinicId,
    accountId,
    createdBy,
  }: GrantAttendingInput): Promise<AttendingOutcome> {
    const client = getClient();

    // Excepción a «toda lectura filtra deletedAt»: una membership borrada se revive.
    const existing = await client.userResourceMembership.findUnique({
      where: { userId_resourceId: { userId, resourceId: clinicId } },
      select: { id: true, deletedAt: true },
    });

    if (existing && !existing.deletedAt) return "kept";

    let membershipId: string;
    if (existing) {
      await client.userResourceMembership.update({
        where: { id: existing.id },
        data: { deletedAt: null, role: "DOCTOR" },
      });
      membershipId = existing.id;
    } else {
      const created = await client.userResourceMembership.create({
        data: {
          userId,
          resourceId: clinicId,
          accountId,
          createdBy,
          role: "DOCTOR",
        },
      });
      membershipId = created.id;
    }

    // Sin tocar especialidades: un perfil revivido conserva las suyas.
    await client.doctorProfile.upsert({
      where: { membershipId },
      create: { membershipId },
      update: {},
    });

    return existing ? "revived" : "created";
  }
}
