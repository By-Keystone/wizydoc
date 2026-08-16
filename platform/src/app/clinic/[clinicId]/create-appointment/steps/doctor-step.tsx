"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ClinicDoctor } from "@/lib/api/doctors/types";

interface Props {
  doctors: ClinicDoctor[];
  onNext: (doctor: ClinicDoctor) => void;
  onBack: () => void;
}

export function DoctorStep({ doctors, onNext, onBack }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected =
    doctors.find((d) => d.doctorProfileId === selectedId) ?? null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-brand-teal-dark">
        Elige un doctor
      </h2>
      <p className="mt-1 text-sm text-brand-gray">
        Doctores disponibles para la especialidad seleccionada.
      </p>

      {doctors.length === 0 ? (
        <p className="mt-6 text-sm text-brand-gray">
          No hay doctores disponibles para esta especialidad.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {doctors.map((doctor) => (
            <button
              key={doctor.doctorProfileId}
              type="button"
              onClick={() => setSelectedId(doctor.doctorProfileId)}
              className={cn(
                "rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
                selectedId === doctor.doctorProfileId
                  ? "border-brand-teal bg-brand-teal/10 text-brand-teal"
                  : "border-gray-200 text-brand-gray hover:bg-gray-50",
              )}
            >
              Dr. {doctor.name} {doctor.lastName}
            </button>
          ))}
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
          Atrás
        </Button>
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
