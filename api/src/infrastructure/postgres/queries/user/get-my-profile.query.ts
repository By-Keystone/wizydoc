import type {
  IGetMyProfileQuery,
  MyProfile,
} from "@/application/queries/user/get-my-profile.query";
import { formatDoctorName } from "@/domain/services/doctor-name";
import type { Prisma } from "@prisma/client";
import { getClient } from "../../transaction-context";

// Mismo criterio que el booking para decidir quién atiende en una sede: perfil
// de médico y membership viva y directa sobre la sede.
function attendingProfilesWhere(
  userId: string,
  accountId: string,
): Prisma.DoctorProfileWhereInput {
  return {
    userId,
    clinic: {
      resource: {
        accountId,
        resourceMemberships: { some: { userId, deletedAt: null } },
      },
    },
  };
}

export class GetMyProfileQuery implements IGetMyProfileQuery {
  async execute(userId: string, accountId: string): Promise<MyProfile | null> {
    const client = getClient();

    const user = await client.user.findFirst({
      where: { id: userId, accountId },
      select: {
        name: true,
        lastName: true,
        email: true,
        phone: true,
        treatment: true,
      },
    });
    if (!user) return null;

    const profiles = await client.doctorProfile.findMany({
      where: attendingProfilesWhere(userId, accountId),
      select: {
        clinicId: true,
        clinic: {
          select: {
            name: true,
            resource: {
              select: {
                parentResourceId: true,
                parent: {
                  select: { organization: { select: { name: true } } },
                },
              },
            },
          },
        },
        specialties: {
          select: { id: true, name: true, organizationId: true },
        },
      },
    });

    const clinics = profiles
      .map((profile) => {
        const organizationId = profile.clinic.resource.parentResourceId;
        return {
          clinicId: profile.clinicId,
          clinicName: profile.clinic.name,
          organizationName:
            profile.clinic.resource.parent?.organization?.name ?? "",
          // Una especialidad de otra organización no se muestra, igual que en el booking.
          specialties: profile.specialties
            .filter((specialty) => specialty.organizationId === organizationId)
            .map(({ id, name }) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name, "es")),
        };
      })
      .sort(
        (a, b) =>
          a.organizationName.localeCompare(b.organizationName, "es") ||
          a.clinicName.localeCompare(b.clinicName, "es"),
      );

    return {
      ...user,
      doctorDisplayName: clinics.length ? formatDoctorName(user) : null,
      clinics,
    };
  }

  async hasDoctorProfile(userId: string, accountId: string): Promise<boolean> {
    const count = await getClient().doctorProfile.count({
      where: attendingProfilesWhere(userId, accountId),
    });
    return count > 0;
  }
}
