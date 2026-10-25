"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ClinicDoctor } from "@/lib/api/doctors/types";
import { ChoiceButton } from "./choice-button";

interface Props {
  doctors: ClinicDoctor[];
  specialtyName: string;
  initialSelectedId?: string | null;
  onNext: (doctor: ClinicDoctor) => void;
  onBack?: () => void;
}

export function DoctorStep({
  doctors,
  specialtyName,
  initialSelectedId = null,
  onNext,
  onBack,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId,
  );

  const selected =
    doctors.find((d) => d.doctorProfileId === selectedId) ?? null;

  return (
    <div>
      <h2
        tabIndex={-1}
        className="text-lg font-semibold text-brand-teal-dark outline-none"
      >
        Elige un médico
      </h2>
      <p className="mt-1 break-words text-sm text-brand-gray">
        Médicos disponibles para {specialtyName}.
      </p>

      {doctors.length === 0 ? (
        <p className="mt-6 text-sm text-brand-gray">
          No hay médicos disponibles para esta especialidad.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {doctors.map((doctor) => (
            <ChoiceButton
              key={doctor.doctorProfileId}
              label={doctor.displayName}
              isChosen={selectedId === doctor.doctorProfileId}
              onClick={() => setSelectedId(doctor.doctorProfileId)}
            />
          ))}
        </div>
      )}

      <div className="mt-8 flex gap-3">
        {onBack && (
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onBack}
          >
            Atrás
          </Button>
        )}
        <Button
          type="button"
          className="flex-1"
          disabled={!selected}
          onClick={() => selected && onNext(selected)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
