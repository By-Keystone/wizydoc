import Link from "next/link";
import { Users } from "lucide-react";
import { UsersTable } from "@/components/clinic/users-table";
import { OrganizationUsersTopHeader } from "@/components/organization/users-top-header";
import { userMembershipsApi } from "@/lib/api/memberships";
import { organizationsApi } from "@/lib/api/organizations";
import { getMe } from "@/lib/auth/me";

interface Props {
  params: Promise<{ accountId: string; resourceId: string }>;
}

export default async function OrganizationUsersPage({ params }: Props) {
  const { accountId, resourceId } = await params;

  const [users, me, membership] = await Promise.all([
    organizationsApi.getOrganizationUsers(resourceId),
    getMe(),
    userMembershipsApi.getMembershipForResource(resourceId),
  ]);

  const isOnlyCurrentUser = users.length === 1 && users[0].email === me?.email;

  return (
    <div>
      <OrganizationUsersTopHeader
        organizationId={resourceId}
        organizationName={membership.resourceName}
      />
      <UsersTable
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
              Invita aquí a quien deba trabajar en todas las sedes. Para sumar a
              alguien a una sola sede —por ejemplo, a un médico—, hazlo desde{" "}
              <Link
                href={`/account/${accountId}/organization/${resourceId}/clinics`}
                className="font-medium text-brand-teal hover:text-brand-teal-dark"
              >
                Sedes
              </Link>
              .
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
