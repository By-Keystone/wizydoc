import Link from "next/link";
import { Users } from "lucide-react";
import { ClinicWithUser } from "@/lib/api/clinic/types";
import { Column, Table } from "../common/table";

interface Props {
  clinics: ClinicWithUser[];
  accountId: string;
  organizationId: string;
}

const buildColumns = (
  accountId: string,
  organizationId: string,
): Column<ClinicWithUser>[] => [
  {
    key: "name",
    header: "Nombre de la clínica",
    align: "center",
    cell: (row) => <span>{row.name}</span>,
  },
  {
    key: "address",
    header: "Dirección",
    align: "center",
    cell: (row) => <span>{row.address}</span>,
  },
  {
    key: "phone",
    header: "Número de teléfono",
    align: "center",
    cell: (row) => <span>{row.phone}</span>,
  },
  {
    key: "createdBy",
    header: "Propietario",
    align: "center",
    cell: (row) => (
      <span>
        {row.createdBy.name} {row.createdBy.lastName}
      </span>
    ),
  },
  {
    key: "actions",
    header: "Acciones",
    align: "center",
    cell: (row) => (
      <Link
        href={`/account/${accountId}/organization/${organizationId}/clinic/${row.id}/users`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-brand-gray transition hover:bg-gray-50"
      >
        <Users className="h-4 w-4" />
        Ver Usuarios
      </Link>
    ),
  },
];

export const ClinicsTable = ({
  clinics,
  accountId,
  organizationId,
}: Props) => {
  return (
    <Table
      getRowKey={(row) => row.id}
      rows={clinics}
      columns={buildColumns(accountId, organizationId)}
    />
  );
};
