import { clinicApi } from "@/lib/api/clinic";
import { userMembershipsApi } from "@/lib/api/memberships";
import { specialtyApi } from "@/lib/api/specialty";
import { getMe } from "@/lib/auth/me";
import { UsersTable } from "./users-table";
import { UsersTopHeader } from "./users-top-header";

interface Props {
  clinicId: string;
}

export async function ClinicUsersView({ clinicId }: Props) {
  const clinicMembership =
    await userMembershipsApi.getMembershipForResource(clinicId);

  if (clinicMembership.resourceType !== "CLINIC") {
    throw new Error("El recurso no es una sede");
  }

  const organizationId = clinicMembership.parentOrganization.resourceId;

  const [users, specialties, me, organizationMembership] = await Promise.all([
    clinicApi.getClinicUsers(clinicId),
    specialtyApi.getOrganizationSpecialties(organizationId),
    getMe(),
    // Un ADMIN directo de la sede no tiene membership en la organización.
    userMembershipsApi
      .getMembershipForResource(organizationId)
      .catch(() => null),
  ]);

  const organizationName =
    organizationMembership?.resourceName ??
    clinicMembership.parentOrganization.name;

  // El api sólo deja editar al ADMIN de la organización o al dueño; un ADMIN
  // directo de la sede vería botones que responden 403.
  const canEditSpecialties =
    organizationMembership?.role === "ADMIN" || !!me?.isAccountOwner;

  return (
    <div>
      <UsersTopHeader
        organizationId={organizationId}
        organizationName={organizationName}
        clinics={[{ id: clinicId, name: clinicMembership.resourceName }]}
        fixedClinicId={clinicId}
        specialties={specialties}
        currentUserEmail={me?.email}
        subtitle={`Personas con acceso a ${clinicMembership.resourceName}.`}
      />
      <UsersTable
        users={users}
        currentUserEmail={me?.email}
        emptyMessage="Esta sede aún no tiene usuarios."
        specialtyEditing={
          canEditSpecialties
            ? {
                organizationId,
                organizationName,
                clinicId,
                clinicName: clinicMembership.resourceName,
                organizationSpecialties: specialties,
              }
            : undefined
        }
      />
    </div>
  );
}
