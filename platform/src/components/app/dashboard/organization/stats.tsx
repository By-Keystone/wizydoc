import { organizationsApi } from "@/lib/api/organizations";
import { StatCard } from "../statcard";
import { Building2, UserRound } from "lucide-react";

interface OrganizationStatsProps {
  resourceId: string;
}

export const OrganizationStats = async ({
  resourceId,
}: OrganizationStatsProps) => {
  const [{ clinicCount }, { doctorCount }] = await Promise.all([
    organizationsApi.getClinicCount(resourceId),
    organizationsApi.getDoctorCount(resourceId),
  ]);
  return (
    <>
      <StatCard icon={UserRound} label="Médicos" value={doctorCount} />

      <StatCard icon={Building2} label="Sedes" value={clinicCount} />
    </>
  );
};
