"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Specialty } from "../booking-steps";
import { ChoiceButton } from "./choice-button";

interface Props {
  specialties: Specialty[];
  initialSelectedId?: string | null;
  onNext: (specialty: Specialty) => void;
}

export function SpecialtyStep({
  specialties,
  initialSelectedId = null,
  onNext,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId,
  );

  const selected = specialties.find((s) => s.id === selectedId) ?? null;

  return (
    <div>
      <h2
        tabIndex={-1}
        className="text-lg font-semibold text-brand-teal-dark outline-none"
      >
        ¿Qué especialidad necesitas?
      </h2>
      <p className="mt-1 text-sm text-brand-gray">
        Elige la especialidad de tu consulta.
      </p>

      {specialties.length === 0 ? (
        <p className="mt-6 text-sm text-brand-gray">
          Esta clínica todavía no tiene especialidades disponibles.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3">
          {specialties.map((specialty) => (
            <ChoiceButton
              key={specialty.id}
              label={specialty.name}
              isChosen={selectedId === specialty.id}
              onClick={() => setSelectedId(specialty.id)}
            />
          ))}
        </div>
      )}

      <Button
        type="button"
        className="mt-8 w-full"
        disabled={!selected}
        onClick={() => selected && onNext(selected)}
      >
        Siguiente
      </Button>
    </div>
  );
}
