import type { Prisma } from "@prisma/client";

// Perfil que atiende: su membership de sede está viva y es DOCTOR. Un ADMIN de
// la organización atiende con una membership DOCTOR directa en la sede.
export function liveDoctorProfileWhere(
  filter: {
    clinicId?: string;
    organizationId?: string;
    userId?: string;
    accountId?: string;
  } = {},
): Prisma.DoctorProfileWhereInput {
  return {
    membership: {
      role: "DOCTOR",
      deletedAt: null,
      ...(filter.clinicId && { resourceId: filter.clinicId }),
      ...(filter.organizationId && {
        resource: { parentResourceId: filter.organizationId },
      }),
      ...(filter.userId && { userId: filter.userId }),
      ...(filter.accountId && { accountId: filter.accountId }),
    },
  };
}

// Un ADMIN atiende por defecto con perfil vacío; sólo cuenta quien tiene horarios.
export function countedDoctorProfileWhere(
  filter: Parameters<typeof liveDoctorProfileWhere>[0] = {},
): Prisma.DoctorProfileWhereInput {
  return {
    ...liveDoctorProfileWhere(filter),
    availabilities: { some: {} },
  };
}
