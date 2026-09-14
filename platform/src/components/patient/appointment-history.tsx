import {
  AppointmentHistoryEntry,
  PatientMetrics,
} from "@/lib/api/patients/types";
import { Column, Table } from "../common/table";
import {
  formatDateTime,
  formatShortDate,
  STATUS_LABELS,
  STATUS_STYLES,
} from "./format";

interface Props {
  history: AppointmentHistoryEntry[];
  metrics: PatientMetrics;
}

function Stat({
  value,
  label,
  tone,
}: {
  value: string | number;
  label: string;
  tone?: "alert" | "next";
}) {
  const valueColor =
    tone === "alert"
      ? "text-red-600"
      : tone === "next"
        ? "text-brand-teal"
        : "text-brand-ink";

  return (
    <div className="bg-white px-3 py-2.5">
      <p className={`text-lg font-bold tabular-nums ${valueColor}`}>{value}</p>
      <p className="text-xs text-brand-gray">{label}</p>
    </div>
  );
}

const columns: Column<AppointmentHistoryEntry>[] = [
  {
    key: "scheduledAt",
    header: "Fecha",
    align: "left",
    cell: (row) => formatDateTime(row.scheduledAt),
  },
  {
    key: "clinic",
    header: "Sede",
    align: "left",
    cell: (row) => row.clinicName,
  },
  {
    key: "doctor",
    header: "Profesional",
    align: "left",
    cell: (row) => row.doctorName,
  },
  {
    key: "specialty",
    header: "Especialidad",
    align: "left",
    cell: (row) => row.specialty,
  },
  {
    key: "status",
    header: "Estado",
    align: "left",
    cell: (row) => (
      <span
        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[row.status]}`}
      >
        {STATUS_LABELS[row.status]}
      </span>
    ),
  },
];

export function AppointmentHistory({ history, metrics }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 sm:grid-cols-3 lg:grid-cols-6">
        <Stat value={metrics.totalAppointments} label="Citas totales" />
        <Stat value={metrics.completedCount} label="Completadas" />
        <Stat
          value={metrics.noShowCount}
          label={metrics.noShowCount === 1 ? "Inasistencia" : "Inasistencias"}
          tone={metrics.noShowCount > 0 ? "alert" : undefined}
        />
        <Stat
          value={formatShortDate(metrics.firstVisitAt)}
          label="Primera visita"
        />
        <Stat
          value={formatShortDate(metrics.lastVisitAt)}
          label="Última visita"
        />
        <Stat
          value={formatShortDate(metrics.nextAppointmentAt)}
          label="Próxima cita"
          tone={metrics.nextAppointmentAt ? "next" : undefined}
        />
      </div>

      <Table
        getRowKey={(row) => row.id}
        rows={history}
        columns={columns}
        empty="Este paciente todavía no tiene citas"
      />

      <p className="text-xs text-brand-gray">
        Primera y última visita cuentan solo las citas completadas: una cita
        cancelada o a la que no se asistió no es una visita.
      </p>
    </div>
  );
}
