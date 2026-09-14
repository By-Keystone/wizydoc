import Link from "next/link";
import { PatientListEntry } from "@/lib/api/patients/types";
import { Column, Table } from "../common/table";
import { formatDocument, formatShortDate } from "./format";

interface Props {
  patients: PatientListEntry[];
  /** Sin esto el nombre no enlaza: la vista de organización no tiene detalle. */
  buildHref?: (patientId: string) => string;
}

function StatusBadge({ patient }: { patient: PatientListEntry }) {
  if (patient.nextAppointmentAt) {
    return (
      <span className="inline-block rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
        Con cita próxima
      </span>
    );
  }

  if (patient.noShowCount > 0) {
    return (
      <span className="inline-block rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
        {patient.noShowCount}{" "}
        {patient.noShowCount === 1 ? "inasistencia" : "inasistencias"}
      </span>
    );
  }

  return (
    <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-brand-gray">
      Sin cita próxima
    </span>
  );
}

export const PatientsTable = ({ patients, buildHref }: Props) => {
  const columns: Column<PatientListEntry>[] = [
    {
      key: "name",
      header: "Paciente",
      align: "left",
      cell: (row) => {
        const fullName = `${row.name} ${row.lastName}`;

        return (
          <div className="flex flex-col">
            {buildHref ? (
              <Link
                href={buildHref(row.id)}
                className="font-medium text-brand-ink hover:text-brand-teal hover:underline"
              >
                {fullName}
              </Link>
            ) : (
              <span className="font-medium text-brand-ink">{fullName}</span>
            )}
            <span className="text-xs text-brand-gray">
              {formatDocument(row.documentType, row.documentNumber)}
            </span>
          </div>
        );
      },
    },
    {
      key: "phone",
      header: "Teléfono",
      align: "left",
      cell: (row) => row.phone,
    },
    {
      key: "lastVisit",
      header: "Última visita",
      align: "left",
      cell: (row) => formatShortDate(row.lastVisitAt),
    },
    {
      key: "appointments",
      header: "Citas",
      align: "center",
      cell: (row) => row.totalAppointments,
    },
    {
      key: "status",
      header: "Estado",
      align: "left",
      cell: (row) => <StatusBadge patient={row} />,
    },
  ];

  return (
    <Table
      getRowKey={(row) => row.id}
      rows={patients}
      columns={columns}
      empty="Todavía no hay pacientes registrados"
    />
  );
};
