"use client";

import { SpecialtyMultiSelect } from "@/components/clinic/invite-user/specialty-multi-select";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/hooks/useFormAction";
import { updateMySpecialtiesAction } from "@/lib/actions/doctor-profile/update-my-specialties.action";
import type {
  MyProfileEditableClinic,
  MyProfileOrganization,
} from "@/lib/api/user/types";
import { useEffect, useRef } from "react";
import { ClinicAvailabilityLink } from "./clinic-availability-link";

export const specialtiesButtonId = (clinicId: string) =>
  `specialties-button-${clinicId}`;

interface Props {
  clinic: MyProfileEditableClinic;
  organization: MyProfileOrganization | undefined;
  accountId: string;
  variant: "block" | "row";
  editing: boolean;
  onEdit: () => void;
  onClose: (saved: boolean) => void;
  onCreate: (specialty: { id: string; name: string }) => void;
}

export function EditableClinicSpecialties({
  clinic,
  organization,
  accountId,
  variant,
  editing,
  onEdit,
  onClose,
  onCreate,
}: Props) {
  if (editing) {
    return (
      <SpecialtiesEditor
        clinic={clinic}
        organization={organization}
        onClose={onClose}
        onCreate={onCreate}
      />
    );
  }

  if (variant === "row") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-3">
        <div className="min-w-0">
          <b className="block break-words text-[14.5px]">{clinic.clinicName}</b>
          <span className="block break-words text-[12.5px] text-brand-gray">
            {clinic.organizationName} · Sin especialidades
          </span>
        </div>
        <Button
          id={specialtiesButtonId(clinic.clinicId)}
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          aria-label={`Asignar especialidades en ${clinic.clinicName}`}
          onClick={onEdit}
        >
          Asignar especialidades
        </Button>
        <div className="w-full">
          <ClinicAvailabilityLink
            accountId={accountId}
            clinicId={clinic.clinicId}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-[10px] border border-gray-200 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <b className="block break-words text-[14.5px]">{clinic.clinicName}</b>
          <span className="block break-words text-[12.5px] text-brand-gray">
            {clinic.organizationName}
          </span>
        </div>
        <Button
          id={specialtiesButtonId(clinic.clinicId)}
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          aria-label={`Editar especialidades de ${clinic.clinicName}`}
          onClick={onEdit}
        >
          Editar
        </Button>
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {clinic.specialties.map((specialty) => (
          <li
            key={specialty.id}
            className="rounded-full border border-brand-teal/20 bg-brand-surface px-3 py-1 text-[13px] text-brand-teal-dark"
          >
            {specialty.name}
          </li>
        ))}
      </ul>
      {!clinic.hasSchedule && (
        <p className="mt-2.5 text-[13px] leading-snug text-brand-gray">
          Sin horarios en esta sede, todavía no apareces en el link de reserva.
        </p>
      )}
      <div className="mt-3">
        <ClinicAvailabilityLink
          accountId={accountId}
          clinicId={clinic.clinicId}
        />
      </div>
    </div>
  );
}

interface EditorProps {
  clinic: MyProfileEditableClinic;
  organization: MyProfileOrganization | undefined;
  onClose: (saved: boolean) => void;
  onCreate: (specialty: { id: string; name: string }) => void;
}

function SpecialtiesEditor({
  clinic,
  organization,
  onClose,
  onCreate,
}: EditorProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const staleRole = useRef(false);

  const { submit, isPending } = useFormAction(
    async (formData) => {
      const result = await updateMySpecialtiesAction(
        clinic.organizationId,
        clinic.clinicId,
        clinic.doctorProfileId,
        { status: "idle" },
        formData,
      );
      staleRole.current =
        result.status === "error" &&
        (result.code === "FORBIDDEN" ||
          result.message === "Sede no encontrada");
      return result;
    },
    {
      onSuccess: () => onClose(true),
      // Si perdió el rol o la sede con la página abierta, seguir editando no tiene sentido.
      onError: () => {
        if (staleRole.current) onClose(false);
      },
    },
  );

  useEffect(() => {
    formRef.current
      ?.querySelector<HTMLInputElement>('input[type="text"]')
      ?.focus();
  }, []);

  const orgSpecialties = organization?.specialties ?? [];
  const canCreate = organization?.canCreateSpecialties ?? false;

  return (
    <form
      ref={formRef}
      className="min-w-0 rounded-[10px] border border-brand-teal/20 p-3.5 shadow-[0_0_0_3px_rgba(12,126,117,0.08)]"
      onSubmit={(event) => {
        event.preventDefault();
        submit(new FormData(event.currentTarget));
      }}
    >
      <b className="block break-words text-[14.5px]">{clinic.clinicName}</b>
      <span className="mb-3 block break-words text-[12.5px] text-brand-gray">
        {clinic.organizationName}
      </span>

      <SpecialtyMultiSelect
        organizationId={clinic.organizationId}
        initialSpecialties={orgSpecialties}
        initialSelected={clinic.specialties}
        label={`Especialidades en ${clinic.clinicName}`}
        allowCreate={canCreate}
        labelClassName="text-sm"
        listInFlow
        onCreate={onCreate}
        emptyHint={(canCreateHere) =>
          `${clinic.organizationName} todavía no tiene especialidades. ${
            canCreateHere
              ? "Escribe la que atiendes y elige «Crear»."
              : "Las crea un administrador de la organización."
          }`
        }
      />

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 sm:flex-none"
          onClick={() => onClose(false)}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          className="flex-1 sm:flex-none"
          disabled={isPending}
        >
          {isPending ? "Guardando…" : "Guardar especialidades"}
        </Button>
      </div>
    </form>
  );
}
