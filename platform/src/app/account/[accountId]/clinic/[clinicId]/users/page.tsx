import { ClinicUsersView } from "@/components/clinic/clinic-users-view";

interface Props {
  params: Promise<{ clinicId: string }>;
}

export default async function ClinicUsersPage({ params }: Props) {
  const { clinicId } = await params;

  return <ClinicUsersView clinicId={clinicId} />;
}
