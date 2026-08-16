"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Specialty } from "@/lib/api/specialty/types";
import { Column, Table } from "../common/table";
import { EditSpecialtyModal } from "./edit-modal";
import { useApp } from "@/context/app/app.context";
import { MembershipRole } from "@/lib/utils";

interface Props {
  specialties: Specialty[];
}

export const SpecialtiesTable = ({ specialties }: Props) => {
  const [editing, setEditing] = useState<Specialty | null>(null);
  const { membership } = useApp();
  const isAdmin = membership.role === MembershipRole.ADMIN;

  const columns: Column<Specialty>[] = [
    {
      key: "name",
      header: "Nombre de la especialidad",
      align: "center",
      cell: (row) => <span>{row.name}</span>,
    },
    ...(isAdmin
      ? [
          {
            key: "actions",
            header: "Acciones",
            align: "center" as const,
            cell: (row: Specialty) => (
              <button
                type="button"
                onClick={() => setEditing(row)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-brand-gray transition hover:bg-gray-50"
              >
                <Pencil className="h-4 w-4" />
                Editar
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Table
        getRowKey={(row) => row.id}
        rows={specialties}
        columns={columns}
        empty="No hay especialidades registradas"
      />
      {editing && (
        <EditSpecialtyModal
          isOpen={!!editing}
          setIsOpen={(open) => !open && setEditing(null)}
          specialty={editing}
        />
      )}
    </>
  );
};
