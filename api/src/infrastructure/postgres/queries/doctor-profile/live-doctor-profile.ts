import type { Prisma } from "@prisma/client";

// Perfil que atiende: su membership de sede está viva y es DOCTOR. Un ADMIN de
// la organización atiende con una membership DOCTOR directa en la sede.
export function liveDoctorProfileWhere(
  filter: { clinicId?: string; userId?: string; accountId?: string } = {},
): Prisma.DoctorProfileWhereInput {
  return {
    membership: {
      role: "DOCTOR",
      deletedAt: null,
      ...(filter.clinicId && { resourceId: filter.clinicId }),
      ...(filter.userId && { userId: filter.userId }),
      ...(filter.accountId && { accountId: filter.accountId }),
    },
  };
}
