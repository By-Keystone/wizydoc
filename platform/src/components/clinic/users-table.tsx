import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { ClinicUser } from "@/lib/api/clinic/types";
import { type Column, Table } from "../common/table";

type UserRow = ClinicUser & {
  invitationStatus?: "pending" | "expired" | null;
};

interface Props {
  users: UserRow[];
  emptyMessage: string;
  currentUserEmail?: string;
}

const roleDisplay: Record<
  string,
  { label: string; variant: BadgeProps["variant"] }
> = {
  ADMIN: { label: "Administrador", variant: "teal" },
  DOCTOR: { label: "Médico", variant: "blue" },
  USER: { label: "Usuario", variant: "gray" },
};

const statusTagClass =
  "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold";

const invitationTag = {
  pending: {
    label: "Invitación pendiente",
    className: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  },
  expired: {
    label: "Invitación expirada",
    className: "bg-gray-100 text-brand-gray ring-1 ring-inset ring-gray-200",
  },
};

const buildColumns = (currentUserEmail?: string): Column<UserRow>[] => [
  {
    key: "name",
    header: "Nombre",
    align: "center",
    cell: (row) => (
      <>
        <span className="font-medium text-brand-ink">
          {row.name} {row.lastName}
        </span>
        {(row.email === currentUserEmail || row.invitationStatus) && (
          <span className="mt-1 flex flex-wrap items-center justify-center gap-1">
            {row.email === currentUserEmail && (
              <span
                className={`${statusTagClass} bg-brand-teal/10 text-brand-teal`}
              >
                Tú
              </span>
            )}
            {row.invitationStatus && (
              <span
                className={`${statusTagClass} ${invitationTag[row.invitationStatus].className}`}
              >
                {invitationTag[row.invitationStatus].label}
              </span>
            )}
          </span>
        )}
        <span className="mt-0.5 block truncate text-xs text-brand-gray sm:hidden">
          {row.email}
        </span>
      </>
    ),
  },
  {
    key: "email",
    header: "Correo electrónico",
    align: "center",
    headerClassName: "hidden sm:table-cell",
    cellClassName: "hidden sm:table-cell",
    cell: (row) => <span>{row.email}</span>,
  },
  {
    key: "phone",
    header: "Teléfono",
    align: "center",
    headerClassName: "hidden md:table-cell",
    cellClassName: "hidden md:table-cell",
    cell: (row) => <span>{row.phone}</span>,
  },
  {
    key: "role",
    header: "Rol",
    align: "center",
    cell: (row) => {
      const display = roleDisplay[row.role];
      return (
        <Badge
          variant={display?.variant ?? "gray"}
          className="whitespace-nowrap"
        >
          {display?.label ?? row.role}
        </Badge>
      );
    },
  },
];

export const UsersTable = ({
  users,
  emptyMessage,
  currentUserEmail,
}: Props) => {
  return (
    <Table
      getRowKey={(row) => row.email}
      rows={users}
      columns={buildColumns(currentUserEmail)}
      empty={emptyMessage}
    />
  );
};
