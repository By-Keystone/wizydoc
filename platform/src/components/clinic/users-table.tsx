import { ClinicUser } from "@/lib/api/clinic/types";
import { Column, Table } from "../common/table";

interface Props {
  users: ClinicUser[];
}

const columns: Column<ClinicUser>[] = [
  {
    key: "name",
    header: "Nombre",
    align: "center",
    cell: (row) => (
      <span>
        {row.name} {row.lastName}
      </span>
    ),
  },
  {
    key: "email",
    header: "Correo electrónico",
    align: "center",
    cell: (row) => <span>{row.email}</span>,
  },
  {
    key: "phone",
    header: "Teléfono",
    align: "center",
    cell: (row) => <span>{row.phone}</span>,
  },
  {
    key: "role",
    header: "Rol",
    align: "center",
    cell: (row) => <span>{row.role}</span>,
  },
];

export const UsersTable = ({ users }: Props) => {
  return (
    <Table
      getRowKey={(row) => row.email}
      rows={users}
      columns={columns}
      empty="Esta sede aún no tiene usuarios."
    />
  );
};
