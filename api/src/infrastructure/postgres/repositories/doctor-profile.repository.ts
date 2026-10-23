import type {
  IDoctorProfileRepository,
  SpecialtySummary,
} from "@/domain/repositories/doctor-profile.repository";
import { Prisma } from "@prisma/client";
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

  async upsertSpecialties(
    userId: string,
    clinicId: string,
    specialtyIds: string[],
  ): Promise<SpecialtySummary[]> {
    const ids = specialtyIds.map((id) => ({ id }));

    const upsert = () =>
      getClient().doctorProfile.upsert({
        where: { userId_clinicId: { userId, clinicId } },
        create: { userId, clinicId, specialties: { connect: ids } },
        update: { specialties: { set: ids } },
        select: { specialties: { select: { id: true, name: true } } },
      });

    try {
      return sortedByName((await upsert()).specialties);
    } catch (error) {
      // Prisma no usa ON CONFLICT con escrituras anidadas: dos primeros
      // guardados simultáneos chocan en el índice único y el segundo debe
      // reintentar por la rama de actualización.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return sortedByName((await upsert()).specialties);
      }
      throw error;
    }
  }

  findClinicDoctor(
    doctorProfileId: string,
    clinicId: string,
  ): Promise<{ id: string; userId: string } | null> {
    return getClient().doctorProfile.findFirst({
      where: {
        id: doctorProfileId,
        clinicId,
        user: {
          resourceMemberships: {
            some: { resourceId: clinicId, role: "DOCTOR", deletedAt: null },
          },
        },
      },
      select: { id: true, userId: true },
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
