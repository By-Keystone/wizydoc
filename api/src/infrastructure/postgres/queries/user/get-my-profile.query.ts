import type { ICanEditOrganizationSpecialtiesQuery } from "@/application/queries/organization/can-edit-organization-specialties.query";
import type {
  IGetMyProfileQuery,
  MyProfile,
  MyProfileEditableClinic,
  MyProfileOrganization,
} from "@/application/queries/user/get-my-profile.query";
import { formatDoctorName } from "@/domain/services/doctor-name";
import { getClient } from "../../transaction-context";
import { CanEditOrganizationSpecialtiesQuery } from "../organization/can-edit-organization-specialties.query";
import { liveDoctorProfileWhere } from "../doctor-profile/live-doctor-profile";

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

    const [profiles, organizations] = await Promise.all([
      client.doctorProfile.findMany({
        where: liveDoctorProfileWhere({ userId, accountId }),
        select: {
          id: true,
          membership: {
            select: {
              resourceId: true,
              resource: {
                select: {
                  parentResourceId: true,
                  clinic: { select: { name: true } },
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
          _count: { select: { availabilities: true } },
        },
      }),
      this.findEditableOrganizations(userId, accountId, editableIds),
    ]);

    const rows = profiles.map((profile) => {
      const { resource } = profile.membership;
      const organizationId = resource.parentResourceId ?? "";
      return {
        doctorProfileId: profile.id,
        clinicId: profile.membership.resourceId,
        clinicName: resource.clinic?.name ?? "",
        organizationId,
        organizationName: resource.parent?.organization?.name ?? "",
        // Una especialidad de otra organización no se muestra, igual que en el booking.
        specialties: profile.specialties
          .filter((specialty) => specialty.organizationId === organizationId)
          .map(({ id, name }) => ({ id, name }))
          .sort(byName),
        hasSchedule: profile._count.availabilities > 0,
      };
    });

    const sorted = rows.sort(
      (a, b) =>
        a.organizationName.localeCompare(b.organizationName, "es") ||
        a.clinicName.localeCompare(b.clinicName, "es"),
    );

    const clinics = sorted.map(
      ({ clinicId, clinicName, organizationName, specialties }) => ({
        clinicId,
        clinicName,
        organizationName,
        specialties,
      }),
    );

    const editableClinics: MyProfileEditableClinic[] = sorted
      .filter((row) => editableIds.includes(row.organizationId))
      .map(
        ({
          doctorProfileId,
          clinicId,
          clinicName,
          organizationId,
          organizationName,
          specialties,
          hasSchedule,
        }) => ({
          clinicId,
          clinicName,
          organizationId,
          organizationName,
          specialties,
          doctorProfileId,
          hasSchedule,
        }),
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
      where: liveDoctorProfileWhere({ userId, accountId }),
    });
    return count > 0;
  }

  // El tratamiento (Dr./Dra.) es de quien atiende, no de quien administra.
  canSetTreatment(userId: string, accountId: string): Promise<boolean> {
    return this.hasDoctorProfile(userId, accountId);
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
