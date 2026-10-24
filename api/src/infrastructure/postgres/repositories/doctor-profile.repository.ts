import type {
  IDoctorProfileRepository,
  SpecialtySummary,
} from "@/domain/repositories/doctor-profile.repository";
import { liveDoctorProfileWhere } from "../queries/doctor-profile/live-doctor-profile";
import { getClient } from "../transaction-context";

export function sortedByName(
  specialties: SpecialtySummary[],
): SpecialtySummary[] {
  return specialties
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export class DoctorProfileRepository implements IDoctorProfileRepository {
  async clinicBelongsToOrganization(
    clinicId: string,
    organizationId: string,
    accountId: string,
  ): Promise<boolean> {
    const clinic = await getClient().clinic.findFirst({
      where: {
        resourceId: clinicId,
        resource: { accountId, parentResourceId: organizationId },
      },
      select: { resourceId: true },
    });
    return clinic !== null;
  }

  // Sin este filtro se podrían conectar especialidades de otra organización o cuenta.
  countSpecialtiesOfClinicOrganization(
    clinicId: string,
    specialtyIds: string[],
  ): Promise<number> {
    return getClient().specialty.count({
      where: {
        id: { in: specialtyIds },
        organization: { resource: { children: { some: { id: clinicId } } } },
      },
    });
  }

  async upsertForMembership(
    membershipId: string,
    specialtyIds: string[],
  ): Promise<SpecialtySummary[]> {
    const ids = specialtyIds.map((id) => ({ id }));

    const profile = await getClient().doctorProfile.upsert({
      where: { membershipId },
      create: { membershipId, specialties: { connect: ids } },
      update: { specialties: { set: ids } },
      select: { specialties: { select: { id: true, name: true } } },
    });
    return sortedByName(profile.specialties);
  }

  findClinicDoctor(
    doctorProfileId: string,
    clinicId: string,
  ): Promise<{ id: string } | null> {
    return getClient().doctorProfile.findFirst({
      where: { id: doctorProfileId, ...liveDoctorProfileWhere({ clinicId }) },
      select: { id: true },
    });
  }

  async setSpecialties(
    doctorProfileId: string,
    specialtyIds: string[],
  ): Promise<SpecialtySummary[]> {
    const updated = await getClient().doctorProfile.update({
      where: { id: doctorProfileId },
      data: { specialties: { set: specialtyIds.map((id) => ({ id })) } },
      select: { specialties: { select: { id: true, name: true } } },
    });
    return sortedByName(updated.specialties);
  }
}
