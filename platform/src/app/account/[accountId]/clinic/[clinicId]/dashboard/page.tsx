import type { Metadata } from "next";
import { ClinicStats } from "@/components/app/dashboard/clinic/stats";
import { TodayAppointments } from "@/components/app/dashboard/clinic/today-appointments";
import { CopyButton } from "@/components/app/dashboard/copy-button";
import { StatisticsWrapper } from "@/components/app/dashboard/stats-wrapper";

export const metadata: Metadata = { title: "Inicio" };

interface Props {
  params: Promise<{ clinicId: string }>;
}

export default async function ClinicDashboardPage({ params }: Props) {
  const { clinicId } = await params;

  return (
    <div>
      <StatisticsWrapper actions={<CopyButton clinicId={clinicId} />}>
        <ClinicStats resourceId={clinicId} />
      </StatisticsWrapper>

      <TodayAppointments resourceId={clinicId} />
    </div>
  );
}
