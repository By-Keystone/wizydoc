import type { Prisma } from "@prisma/client";

// El ADMIN con perfil no cuenta como médico hasta tener horarios. Quien fue
// invitado como DOCTOR sí, esté o no vivo en la sede: así se contaba antes de
// que los ADMIN pudieran tener perfil.
export function countedDoctorProfileWhere(
  clinicId: string,
): Prisma.DoctorProfileWhereInput {
  return {
    clinicId,
    OR: [
      { availabilities: { some: {} } },
      {
        user: {
          resourceMemberships: {
            some: { resourceId: clinicId, role: "DOCTOR" },
          },
        },
      },
    ],
  };
}
