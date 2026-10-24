import type {
  LookedUpAccountUser,
  LookupAccountUserDto,
} from "@/application/queries/user/lookup-account-user.query";
import { BLOCKING_APPOINTMENT_STATUSES } from "@/domain/entities/appointment/entity";
import { getClient } from "../../transaction-context";
import { sortedByName } from "../../repositories/doctor-profile.repository";

export class LookupAccountUserQuery {
  async execute({
    resourceId,
    email,
  }: LookupAccountUserDto): Promise<LookedUpAccountUser | null> {
    const client = getClient();

    const organization = await client.resource.findUnique({
      where: { id: resourceId },
      select: { accountId: true, type: true },
    });

    if (!organization || organization.type !== "ORGANIZATION") return null;

    const { accountId } = organization;

    const user = await client.user.findFirst({
      where: { email, accountId },
      select: { id: true, name: true, lastName: true, phone: true },
    });

    if (!user) return null;

    const [memberships, ownedAccount] = await Promise.all([
      client.userResourceMembership.findMany({
        where: {
          userId: user.id,
          accountId,
          deletedAt: null,
          OR: [{ resourceId }, { resource: { parentResourceId: resourceId } }],
        },
        select: {
          resourceId: true,
          role: true,
          doctorProfile: {
            select: {
              id: true,
              specialties: {
                where: { organizationId: resourceId },
                select: { id: true, name: true },
              },
            },
          },
        },
      }),
      client.account.findFirst({
        where: { id: accountId, ownerId: user.id },
        select: { id: true },
      }),
    ]);

    const profileIds = memberships.flatMap((m) =>
      m.role === "DOCTOR" && m.doctorProfile ? [m.doctorProfile.id] : [],
    );
    const pending = profileIds.length
      ? await client.appointment.groupBy({
          by: ["doctorProfileId"],
          where: {
            doctorProfileId: { in: profileIds },
            status: { in: [...BLOCKING_APPOINTMENT_STATUSES] },
            scheduledAt: { gte: new Date() },
          },
          _count: { _all: true },
        })
      : [];
    const pendingByProfile = new Map(
      pending.map((row) => [row.doctorProfileId, row._count._all]),
    );

    const organizationRole =
      memberships.find((membership) => membership.resourceId === resourceId)
        ?.role ?? null;

    return {
      name: user.name,
      lastName: user.lastName,
      phone: user.phone,
      isAccountOwner: ownedAccount !== null,
      organizationRole,
      clinics: memberships
        .filter((membership) => membership.resourceId !== resourceId)
        .map((membership) => ({
          clinicId: membership.resourceId,
          role: membership.role,
          specialties:
            membership.role === "DOCTOR"
              ? sortedByName(membership.doctorProfile?.specialties ?? [])
              : [],
          pendingAppointments:
            membership.role === "DOCTOR" && membership.doctorProfile
              ? (pendingByProfile.get(membership.doctorProfile.id) ?? 0)
              : 0,
        })),
    };
  }
}
