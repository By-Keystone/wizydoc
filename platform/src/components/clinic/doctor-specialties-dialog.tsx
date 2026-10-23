"use client";

import { SpecialtyMultiSelect } from "@/components/clinic/invite-user/specialty-multi-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useFormAction } from "@/hooks/useFormAction";
import { updateDoctorSpecialtiesAction } from "@/lib/actions/doctor-profile/update-doctor-specialties.action";
import type { Specialty } from "@/lib/api/specialty/types";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface Props {
  organizationId: string;
  organizationName: string;
  clinicId: string;
  clinicName: string;
  doctor: {
    doctorProfileId: string;
    name: string;
    lastName: string;
    specialties: { id: string; name: string }[];
  };
  organizationSpecialties: Specialty[];
}

export const DoctorSpecialtiesDialog = (props: Props) => {
  const [open, setOpen] = useState(false);
  const { doctor } = props;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1 px-2.5 text-[12.5px] font-medium"
          aria-label={`Editar especialidades de ${doctor.name} ${doctor.lastName}`}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Editar especialidades
        </Button>
      </DialogTrigger>
      <DialogContent
        size="S"
        className="max-h-[90dvh] overflow-y-auto"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement)
            .querySelector<HTMLInputElement>('input[type="text"]')
            ?.focus();
        }}
      >
        <DoctorSpecialtiesForm {...props} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
};

const DoctorSpecialtiesForm = ({
  organizationId,
  organizationName,
  clinicId,
  clinicName,
  doctor,
  organizationSpecialties,
  onClose,
}: Props & { onClose: () => void }) => {
  const router = useRouter();
  const [selectedCount, setSelectedCount] = useState(doctor.specialties.length);
  const removedDoctor = useRef(false);

  const { submit, isPending } = useFormAction(
    async (formData) => {
      const result = await updateDoctorSpecialtiesAction(
        organizationId,
        clinicId,
        doctor.doctorProfileId,
        { status: "idle" },
        formData,
      );
      // El api no manda `code` en los 404: sólo el texto distingue un médico quitado.
      removedDoctor.current =
        result.status === "error" && result.message === "Médico no encontrado";
      return result;
    },
    {
      successMessage: `Guardamos las especialidades de ${doctor.name}.`,
      onSuccess: onClose,
      // El diálogo sigue abierto con el mensaje; la tabla de fondo se actualiza.
      onError: () => {
        if (removedDoctor.current) router.refresh();
      },
    },
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(new FormData(event.currentTarget));
      }}
      onKeyDown={(event) => {
        // Enter en el buscador no debe guardar a medias.
        if (
          event.key === "Enter" &&
          event.target instanceof HTMLInputElement &&
          event.target.type === "text"
        ) {
          event.preventDefault();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>
          Especialidades de {doctor.name} {doctor.lastName}
        </DialogTitle>
        <DialogDescription>
          En {clinicName}. Son las que el paciente elige al reservar con este
          médico.
        </DialogDescription>
      </DialogHeader>

      <SpecialtyMultiSelect
        organizationId={organizationId}
        initialSpecialties={organizationSpecialties}
        initialSelected={doctor.specialties}
        onChange={(selected) => setSelectedCount(selected.length)}
        labelClassName="text-sm font-medium text-brand-ink"
        listInFlow
        emptyHint={(canCreate) =>
          `${organizationName} todavía no tiene especialidades. ${
            canCreate
              ? "Escribe la que atiendes y elige «Crear»."
              : "Las crea un administrador de la organización."
          }`
        }
      />

      <div aria-live="polite">
        {selectedCount === 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-800 ring-1 ring-inset ring-amber-200">
            Sin especialidades, {doctor.name} deja de aparecer en el link de
            reserva de {clinicName}. Sus citas ya reservadas no cambian.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 sm:flex-none"
          onClick={onClose}
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
};
