import { Badge } from "@/components/ui/badge";
import type { AppointmentStatus } from "@/lib/api/appointments/types";

const NEUTRAL_COLORS = "bg-gray-100 text-brand-gray";

const appearanceByStatus: Record<
  AppointmentStatus,
  { label: string; className: string }
> = {
  PENDING: { label: "Pendiente", className: NEUTRAL_COLORS },
  CONFIRMED: { label: "Confirmada", className: NEUTRAL_COLORS },
  COMPLETED: {
    label: "Atendida",
    className: "bg-brand-teal/10 text-brand-teal-dark",
  },
  NO_SHOW: { label: "No asistió", className: "bg-red-50 text-red-700" },
  CANCELLED: {
    label: "Cancelada",
    className: "bg-white text-brand-gray ring-1 ring-inset ring-gray-200",
  },
};

export function AppointmentStatusBadge({
  status,
}: {
  status: AppointmentStatus;
}) {
  const { label, className } = appearanceByStatus[status];

  return <Badge className={`whitespace-nowrap ${className}`}>{label}</Badge>;
}
