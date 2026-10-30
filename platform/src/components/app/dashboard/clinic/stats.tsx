import { CalendarDays, UserRound, Users } from "lucide-react";
import { PlanFeatureNotice } from "@/components/common/plan-feature-notice";
import { clinicApi } from "@/lib/api/clinic";
import type { BookingUsage, ClinicMetrics } from "@/lib/api/clinic/types";
import { isPlanFeatureError } from "@/lib/api/errors";
import { offersPlanUpgrade } from "@/lib/booking-usage";
import { StatCard } from "../statcard";

interface Props {
  resourceId: string;
  bookingUsage: Promise<BookingUsage | null>;
}

async function loadMetrics(resourceId: string): Promise<ClinicMetrics | null> {
  try {
    return await clinicApi.getMetrics(resourceId);
  } catch (error) {
    if (isPlanFeatureError(error)) return null;
    throw error;
  }
}

export async function ClinicStats({ resourceId, bookingUsage }: Props) {
  const [metrics, usage] = await Promise.all([
    loadMetrics(resourceId),
    bookingUsage,
  ]);

  if (!metrics) {
    // Una sola mejora de plan por pantalla: la de la tarjeta de uso, cuando la ofrece.
    if (usage && offersPlanUpgrade(usage)) return null;

    // Un solo botón coral por pantalla: el coral lo lleva el link o la guía.
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
