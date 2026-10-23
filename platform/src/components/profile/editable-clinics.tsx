"use client";

import type {
  MyProfileEditableClinic,
  MyProfileOrganization,
} from "@/lib/api/user/types";
import { useEffect, useRef, useState } from "react";
import {
  EditableClinicSpecialties,
  specialtiesButtonId,
} from "./editable-clinic-specialties";

interface Props {
  clinics: MyProfileEditableClinic[];
  organizations: MyProfileOrganization[];
  accountId: string;
}

type Specialty = { id: string; name: string };

export function EditableClinics({ clinics, organizations, accountId }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [created, setCreated] = useState<Record<string, Specialty[]>>({});
  const pendingFocus = useRef<{
    clinicId: string;
    waitForData: MyProfileEditableClinic[] | null;
  } | null>(null);

  const blocks = clinics.filter((clinic) => clinic.specialties.length > 0);
  const rows = clinics.filter((clinic) => clinic.specialties.length === 0);

  // Al guardar, la sede puede pasar de fila a bloque y su botón se vuelve a
  // montar: el foco se pide una vez y se consume cuando llegan los datos nuevos.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || editingId) return;
    document.getElementById(specialtiesButtonId(pending.clinicId))?.focus();
    if (pending.waitForData !== clinics) pendingFocus.current = null;
  }, [editingId, clinics]);

  const close = (clinicId: string, saved: boolean) => {
    pendingFocus.current = {
      clinicId,
      waitForData: saved ? clinics : null,
    };
    setEditingId(null);
  };

  // Las especialidades creadas en el selector no están en el perfil cacheado.
  const organizationFor = (clinic: MyProfileEditableClinic) => {
    const organization = organizations.find(
      (item) => item.organizationId === clinic.organizationId,
    );
    if (!organization) return undefined;
    const known = new Set(organization.specialties.map((item) => item.id));
    const extra = (created[clinic.organizationId] ?? []).filter(
      (item) => !known.has(item.id),
    );
    return {
      ...organization,
      specialties: [...organization.specialties, ...extra],
    };
  };

  const renderClinic = (
    clinic: MyProfileEditableClinic,
    variant: "block" | "row",
  ) => (
    <EditableClinicSpecialties
      key={clinic.clinicId}
      clinic={clinic}
      organization={organizationFor(clinic)}
      accountId={accountId}
      variant={variant}
      editing={editingId === clinic.clinicId}
      onEdit={() => {
        pendingFocus.current = null;
        setEditingId(clinic.clinicId);
      }}
      onClose={(saved) => close(clinic.clinicId, saved)}
      onCreate={(specialty) =>
        setCreated((previous) => ({
          ...previous,
          [clinic.organizationId]: [
            ...(previous[clinic.organizationId] ?? []),
            specialty,
          ],
        }))
      }
    />
  );

  return (
    <div className="flex flex-col gap-2.5">
      {blocks.map((clinic) => renderClinic(clinic, "block"))}
      {rows.length > 0 && (
        <>
          {blocks.length > 0 && (
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.04em] text-brand-gray">
              Otras sedes que administras
            </p>
          )}
          <div className="divide-y divide-gray-200 rounded-[10px] border border-gray-200">
            {rows.map((clinic) => renderClinic(clinic, "row"))}
          </div>
        </>
      )}
    </div>
  );
}
