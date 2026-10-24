import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { ClinicUser } from "@/lib/api/clinic/types";
import type { Specialty } from "@/lib/api/specialty/types";
import { type Column, Table } from "../common/table";
import { DoctorSpecialtiesDialog } from "./doctor-specialties-dialog";

type UserRow = ClinicUser & {
  invitationStatus?: "pending" | "expired" | null;
  doctorProfileId?: string | null;
  specialties?: { id: string; name: string }[];
};

export interface SpecialtyEditing {
  organizationId: string;
  organizationName: string;
  clinicId: string;
  clinicName: string;
  organizationSpecialties: Specialty[];
}

interface Props {
  users: UserRow[];
  emptyMessage: string;
  currentUserEmail?: string;
  specialtyEditing?: SpecialtyEditing;
}

export const roleDisplay: Record<
  string,
  { label: string; variant: BadgeProps["variant"] }
> = {
  ADMIN: { label: "Administrador", variant: "teal" },
  DOCTOR: { label: "Médico", variant: "blue" },
  USER: { label: "Usuario", variant: "gray" },
};

export const statusTagClass =
  "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold";

export const invitationTag = {
  pending: {
    label: "Invitación pendiente",
    className: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  },
  expired: {
    label: "Invitación expirada",
    className: "bg-gray-100 text-brand-gray ring-1 ring-inset ring-gray-200",
  },
};

const SpecialtiesCell = ({
  row,
  editing,
  align,
}: {
  row: UserRow;
  editing: SpecialtyEditing;
  align: "start" | "center";
}) => {
  if (row.role !== "DOCTOR") {
    return (
      <span role="img" aria-label="No aplica">
        —
      </span>
    );
  }

  const specialties = row.specialties ?? [];

  return (
    <div
      className={`flex flex-col gap-1.5 ${align === "center" ? "items-center" : "items-start"}`}
    >
      {specialties.length > 0 ? (
        <ul
          className={`flex flex-wrap gap-1 ${align === "center" ? "justify-center" : "justify-start"}`}
        >
          {specialties.map((specialty) => (
            <li
              key={specialty.id}
              className="rounded-full bg-brand-teal/10 px-2.5 py-0.5 text-xs font-medium text-brand-teal"
            >
              {specialty.name}
            </li>
          ))}
        </ul>
      ) : (
        <span
          className={`${statusTagClass} bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200`}
        >
          Sin especialidades
        </span>
      )}
      {/* También en la fila propia: el ADMIN que es médico de la sede puede
          editar sus especialidades aquí o en «Mi perfil» (22 de octubre de 2026). */}
      {row.doctorProfileId && (
        <DoctorSpecialtiesDialog
          organizationId={editing.organizationId}
          organizationName={editing.organizationName}
          clinicId={editing.clinicId}
          clinicName={editing.clinicName}
          organizationSpecialties={editing.organizationSpecialties}
          doctor={{
            doctorProfileId: row.doctorProfileId,
            name: row.name,
            lastName: row.lastName,
            specialties,
          }}
        />
      )}
    </div>
  );
};

const buildColumns = (
  currentUserEmail?: string,
  editing?: SpecialtyEditing,
): Column<UserRow>[] => {
  const columns: Column<UserRow>[] = [
    {
      key: "name",
      header: "Nombre",
      align: "center",
      cellClassName: editing ? "text-left sm:text-center" : undefined,
      cell: (row) => (
        <>
          <span className="font-medium text-brand-ink">
            {row.name} {row.lastName}
          </span>
          {(row.email === currentUserEmail || row.invitationStatus) && (
            <span
              className={`mt-1 flex flex-wrap items-center gap-1 ${editing ? "justify-start sm:justify-center" : "justify-center"}`}
            >
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
          {editing && row.role === "DOCTOR" && (
            <div className="mt-2 sm:hidden">
              <SpecialtiesCell row={row} editing={editing} align="start" />
            </div>
          )}
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

  if (editing) {
    columns.push({
      key: "specialties",
      header: "Especialidades",
      align: "center",
      headerClassName: "hidden sm:table-cell",
      cellClassName: "hidden sm:table-cell",
      cell: (row) => (
        <SpecialtiesCell row={row} editing={editing} align="center" />
      ),
    });
  }

  return columns;
};

export const UsersTable = ({
  users,
  emptyMessage,
  currentUserEmail,
  specialtyEditing,
}: Props) => {
  return (
    <Table
      getRowKey={(row) => row.email}
      rows={users}
      columns={buildColumns(currentUserEmail, specialtyEditing)}
      empty={emptyMessage}
    />
  );
};
