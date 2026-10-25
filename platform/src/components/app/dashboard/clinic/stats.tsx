import { CalendarDays, UserRound, Users } from "lucide-react";
import { PlanFeatureNotice } from "@/components/common/plan-feature-notice";
import { clinicApi } from "@/lib/api/clinic";
import type { ClinicMetrics } from "@/lib/api/clinic/types";
import { isPlanFeatureError } from "@/lib/api/errors";
import { StatCard } from "../statcard";

interface Props {
  resourceId: string;
}

async function loadMetrics(resourceId: string): Promise<ClinicMetrics | null> {
  try {
    return await clinicApi.getMetrics(resourceId);
  } catch (error) {
    if (isPlanFeatureError(error)) return null;
    throw error;
  }
}

export async function ClinicStats({ resourceId }: Props) {
  const metrics = await loadMetrics(resourceId);

  if (!metrics) {
    // Un solo botón coral por pantalla: en el dashboard es «Copiar link de reservas».
    return (
      <PlanFeatureNotice
        plan="CLINICA"
        isPrimaryAction={false}
        className="sm:col-span-2 lg:col-span-4"
      />
    );
  }

  const { appointments, doctors, memberships } = metrics;

  return (
    <>
      <StatCard icon={CalendarDays} label="Citas de hoy" value={appointments} />

      {doctors !== undefined && (
        <StatCard icon={UserRound} label="Médicos" value={doctors} />
      )}

      {memberships !== undefined && (
        <StatCard icon={Users} label="Usuarios" value={memberships} />
      )}
    </>
  );
}
