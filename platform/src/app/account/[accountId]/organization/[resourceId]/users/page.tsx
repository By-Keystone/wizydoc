import { Users } from "lucide-react";
import { OrganizationUsersTable } from "@/components/organization/organization-users-table";
import { OrganizationUsersTopHeader } from "@/components/organization/users-top-header";
import { userMembershipsApi } from "@/lib/api/memberships";
import { clinicApi } from "@/lib/api/clinic";
import { organizationsApi } from "@/lib/api/organizations";
import { specialtyApi } from "@/lib/api/specialty";
import { getMe } from "@/lib/auth/me";

interface Props {
  params: Promise<{ accountId: string; resourceId: string }>;
}

export default async function OrganizationUsersPage({ params }: Props) {
  const { resourceId } = await params;

  const [users, me, membership, clinics, specialties] = await Promise.all([
    organizationsApi.getOrganizationUsers(resourceId),
    getMe(),
    userMembershipsApi.getMembershipForResource(resourceId),
    clinicApi.getOrganizationClinics(resourceId),
    specialtyApi.getOrganizationSpecialties(resourceId),
  ]);

  const isOnlyCurrentUser = users.length === 1 && users[0].email === me?.email;

  return (
    <div>
      <OrganizationUsersTopHeader
        organizationId={resourceId}
        organizationName={membership.resourceName}
        clinics={clinics.map(({ id, name }) => ({ id, name }))}
        specialties={specialties}
        currentUserEmail={me?.email}
      />
      <OrganizationUsersTable
        users={users}
        currentUserEmail={me?.email}
        emptyMessage="Esta organización aún no tiene usuarios."
      />
      {isOnlyCurrentUser && (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-surface">
            <Users className="h-6 w-6 text-brand-teal" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-brand-teal-dark">
              Aún no has invitado a nadie a la organización
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-brand-gray">
              Invita a quien trabaje en todas las sedes, o asigna a cada médico
              las sedes donde atiende.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
