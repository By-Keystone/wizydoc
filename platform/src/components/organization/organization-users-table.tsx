import { Badge } from "@/components/ui/badge";
import type { OrganizationUser } from "@/lib/api/organizations/types";
import { type Column, Table } from "../common/table";
import {
  invitationTag,
  roleDisplay,
  statusTagClass,
} from "../clinic/users-table";

interface Props {
  users: OrganizationUser[];
  emptyMessage: string;
  currentUserEmail?: string;
}

const accessLabel = (access: OrganizationUser["accesses"][number]) => {
  const role = roleDisplay[access.role]?.label ?? access.role;
  return `${access.clinicName ?? "Todas las sedes"} · ${role}`;
};

const buildColumns = (
  currentUserEmail?: string,
): Column<OrganizationUser>[] => [
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
        <span className="mt-0.5 block break-all text-xs text-brand-gray sm:hidden">
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
    key: "accesses",
    header: "Accesos",
    align: "center",
    cell: (row) => (
      <ul
        aria-label={`Accesos de ${row.name} ${row.lastName}`}
        className="flex flex-col items-center gap-1"
      >
        {row.accesses.map((access) => (
          <li key={access.clinicId ?? "organization"}>
            <Badge
              variant={roleDisplay[access.role]?.variant ?? "gray"}
              className="whitespace-normal break-words"
            >
              {accessLabel(access)}
            </Badge>
          </li>
        ))}
      </ul>
    ),
  },
];

export const OrganizationUsersTable = ({
  users,
  emptyMessage,
  currentUserEmail,
}: Props) => (
  <Table
    getRowKey={(row) => row.email}
    rows={users}
    columns={buildColumns(currentUserEmail)}
    empty={emptyMessage}
  />
);
