"use client";

import { X } from "lucide-react";
import { useState } from "react";

interface Props {
  initial: string[];
  disabled?: boolean;
}

/**
 * Etiquetas y no un campo libre: un texto suelto acaba en «penicilina y creo que
 * algún antiinflamatorio», que no se puede consultar ni mostrar como alerta.
 */
export function AllergiesInput({ initial, disabled }: Props) {
  const [allergies, setAllergies] = useState(initial);
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value || allergies.includes(value)) {
      setDraft("");
      return;
    }

    setAllergies([...allergies, value]);
    setDraft("");
  };

  const remove = (allergy: string) =>
    setAllergies(allergies.filter((item) => item !== allergy));

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2 py-1.5">
      {allergies.map((allergy) => (
        <span
          key={allergy}
          className="inline-flex items-center gap-1.5 rounded-full bg-red-50 py-0.5 pl-2.5 pr-1 text-sm font-semibold text-red-700"
        >
          {/* El valor viaja en el form como una entrada repetida por alergia. */}
          <input type="hidden" name="allergies" value={allergy} />
          {allergy}
          {!disabled && (
            <button
              type="button"
              onClick={() => remove(allergy)}
              aria-label={`Quitar ${allergy}`}
              className="grid h-4 w-4 place-items-center rounded-full opacity-70 hover:bg-red-100 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}

      {!disabled && (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            // El Enter añade la etiqueta; sin esto enviaría el formulario.
            event.preventDefault();
            add();
          }}
          onBlur={add}
          placeholder="Escribe y pulsa Enter…"
          className="min-w-40 flex-1 border-0 px-1 py-0.5 text-sm outline-none placeholder:text-brand-gray"
        />
      )}

      {disabled && allergies.length === 0 && (
        <span className="px-1 text-sm text-brand-gray">—</span>
      )}
    </div>
  );
}
