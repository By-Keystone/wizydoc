import type { ICanEditOrganizationSpecialtiesQuery } from "@/application/queries/organization/can-edit-organization-specialties.query";
import type {
  IGetMyProfileQuery,
  MyProfile,
  MyProfileEditableClinic,
  MyProfileOrganization,
} from "@/application/queries/user/get-my-profile.query";
import { formatDoctorName } from "@/domain/services/doctor-name";
import type { Prisma } from "@prisma/client";
import { getClient } from "../../transaction-context";
import { CanEditOrganizationSpecialtiesQuery } from "../organization/can-edit-organization-specialties.query";

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

function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, "es");
}

export class GetMyProfileQuery implements IGetMyProfileQuery {
  constructor(
    private readonly canEdit: ICanEditOrganizationSpecialtiesQuery = new CanEditOrganizationSpecialtiesQuery(),
  ) {}

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

    const editableIds = await this.canEdit.editableOrganizationIds(
      userId,
      accountId,
    );

    const [profiles, editableClinics, organizations] = await Promise.all([
      client.doctorProfile.findMany({
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
      }),
      this.findEditableClinics(userId, accountId, editableIds),
      this.findEditableOrganizations(userId, accountId, editableIds),
    ]);

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
            .sort(byName),
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
      editableClinics,
      organizations,
    };
  }

  async hasDoctorProfile(userId: string, accountId: string): Promise<boolean> {
    const count = await getClient().doctorProfile.count({
      where: attendingProfilesWhere(userId, accountId),
    });
    return count > 0;
  }

  // Quien edita especialidades (ADMIN de la organización o dueño) también
  // atiende como médico aunque su perfil aún no exista (se crea al guardarlas).
  async canSetTreatment(userId: string, accountId: string): Promise<boolean> {
    if (await this.hasDoctorProfile(userId, accountId)) return true;

    const organizationIds = await this.canEdit.editableOrganizationIds(
      userId,
      accountId,
    );
    if (!organizationIds.length) return false;

    const clinics = await getClient().clinic.count({
      where: {
        resource: { accountId, parentResourceId: { in: organizationIds } },
      },
    });
    return clinics > 0;
  }

  private async findEditableClinics(
    userId: string,
    accountId: string,
    organizationIds: string[],
  ): Promise<MyProfileEditableClinic[]> {
    if (!organizationIds.length) return [];

    const clinics = await getClient().clinic.findMany({
      where: {
        resource: { accountId, parentResourceId: { in: organizationIds } },
      },
      select: {
        resourceId: true,
        name: true,
        resource: {
          select: {
            parentResourceId: true,
            parent: { select: { organization: { select: { name: true } } } },
            resourceMemberships: {
              where: { userId, deletedAt: null },
              select: { id: true },
            },
          },
        },
        doctors: {
          where: { userId },
          select: {
            specialties: {
              select: { id: true, name: true, organizationId: true },
            },
            _count: { select: { availabilities: true } },
          },
        },
      },
    });

    return clinics
      .map((clinic) => {
        const organizationId = clinic.resource.parentResourceId ?? "";
        const profile = clinic.doctors[0];
        return {
          clinicId: clinic.resourceId,
          clinicName: clinic.name,
          organizationId,
          organizationName: clinic.resource.parent?.organization?.name ?? "",
          specialties: (profile?.specialties ?? [])
            .filter((specialty) => specialty.organizationId === organizationId)
            .map(({ id, name }) => ({ id, name }))
            .sort(byName),
          isClinicDoctor:
            profile !== undefined &&
            clinic.resource.resourceMemberships.length > 0,
          hasSchedule: (profile?._count.availabilities ?? 0) > 0,
        };
      })
      .sort(
        (a, b) =>
          a.organizationName.localeCompare(b.organizationName, "es") ||
          a.clinicName.localeCompare(b.clinicName, "es"),
      );
  }

  private async findEditableOrganizations(
    userId: string,
    accountId: string,
    organizationIds: string[],
  ): Promise<MyProfileOrganization[]> {
    if (!organizationIds.length) return [];
    const client = getClient();

    const [organizations, adminMemberships] = await Promise.all([
      client.organization.findMany({
        where: { accountId, resourceId: { in: organizationIds } },
        select: {
          resourceId: true,
          name: true,
          specialties: { select: { id: true, name: true } },
        },
      }),
      client.userResourceMembership.findMany({
        where: {
          userId,
          accountId,
          role: "ADMIN",
          deletedAt: null,
          resourceId: { in: organizationIds },
        },
        select: { resourceId: true },
      }),
    ]);

    const adminOf = new Set(adminMemberships.map((m) => m.resourceId));

    return organizations
      .map((organization) => ({
        organizationId: organization.resourceId,
        organizationName: organization.name,
        specialties: organization.specialties.sort(byName),
        canCreateSpecialties: adminOf.has(organization.resourceId),
      }))
      .sort((a, b) =>
        a.organizationName.localeCompare(b.organizationName, "es"),
      );
  }
}
