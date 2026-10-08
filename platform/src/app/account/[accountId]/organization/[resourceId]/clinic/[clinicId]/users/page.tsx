import { clinicApi } from "@/lib/api/clinic";
import { specialtyApi } from "@/lib/api/specialty";
import { UsersTable } from "@/components/clinic/users-table";
import { UsersTopHeader } from "@/components/clinic/users-top-header";

interface Props {
  params: Promise<{ resourceId: string; clinicId: string }>;
}

export default async function ClinicUsersPage({ params }: Props) {
  const { resourceId, clinicId } = await params;

  const [users, specialties] = await Promise.all([
    clinicApi.getClinicUsers(clinicId),
    specialtyApi.getOrganizationSpecialties(resourceId),
  ]);

  return (
    <div>
      <UsersTopHeader specialties={specialties} />
      <UsersTable
        users={users}
        emptyMessage="Esta sede aún no tiene usuarios."
      />
    </div>
  );
}
