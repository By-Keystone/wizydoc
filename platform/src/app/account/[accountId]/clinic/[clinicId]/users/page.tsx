import type { Metadata } from "next";
import { ClinicUsersView } from "@/components/clinic/clinic-users-view";

export const metadata: Metadata = { title: "Usuarios" };

interface Props {
  params: Promise<{ clinicId: string }>;
}

export default async function ClinicUsersPage({ params }: Props) {
  const { clinicId } = await params;

  return <ClinicUsersView clinicId={clinicId} />;
}
