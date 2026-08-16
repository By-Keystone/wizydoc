"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Specialty } from "@/lib/api/specialty/types";
import { createSpecialtyAction } from "@/lib/actions/specialty/create-specialty.action";
import { getOrganizationSpecialtiesAction } from "@/lib/actions/specialty/get-organization-specialties.action";
import { toast } from "@/lib/toast";

interface Props {
  organizationId: string;
  initialSpecialties: Specialty[];
}

export const SpecialtyMultiSelect = ({
  organizationId,
  initialSpecialties,
}: Props) => {
  const router = useRouter();
  const [specialties, setSpecialties] = useState(initialSpecialties);
  const [selected, setSelected] = useState<Specialty[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const filtered = useMemo(
    () =>
      specialties.filter(
        (s) =>
          !selectedIds.has(s.id) &&
          s.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [specialties, selectedIds, query],
  );

  const exactMatch = specialties.some(
    (s) => s.name.toLowerCase() === query.trim().toLowerCase(),
  );

  const select = (specialty: Specialty) => {
    setSelected((prev) => [...prev, specialty]);
    setQuery("");
  };

  const remove = (id: string) => {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  };

  const createAndSelect = () => {
    const name = query.trim();
    if (!name) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("name", name);

      const result = await createSpecialtyAction(
        organizationId,
        { status: "idle" },
        formData,
      );

      if (result.status === "auth-expired") {
        toast.error("Tu sesión ha expirado. Vuelve a iniciar sesión.");
        router.push("/login");
        return;
      }

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      const fresh = await getOrganizationSpecialtiesAction(organizationId);
      setSpecialties(fresh);

      const created = fresh.find(
        (s) => s.name.toLowerCase() === name.toLowerCase(),
      );
      if (created) select(created);
      else setQuery("");
    });
  };

  return (
    <div className="flex flex-col gap-y-1">
      <label htmlFor="specialty-search">Especialidades</label>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full bg-brand-teal/10 px-2.5 py-1 text-xs font-medium text-brand-teal"
            >
              {s.name}
              <button
                type="button"
                onClick={() => remove(s.id)}
                aria-label={`Quitar ${s.name}`}
                className="text-brand-teal hover:text-brand-teal-dark"
              >
                <X className="h-3 w-3" />
              </button>
              <input type="hidden" name="specialtyIds" value={s.id} />
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          id="specialty-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder="Buscar especialidad..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
        />

        {open && (query.trim().length > 0 || filtered.length > 0) && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            <ul className="max-h-48 overflow-y-auto py-1">
              {filtered.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => select(s)}
                    className="w-full px-3 py-2 text-left text-sm text-brand-gray hover:bg-gray-50"
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
            {query.trim().length > 0 && !exactMatch && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={createAndSelect}
                disabled={isPending}
                className="flex w-full items-center gap-1.5 border-t border-gray-100 px-3 py-2 text-left text-sm font-medium text-brand-teal hover:bg-brand-teal/10 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                {isPending ? "Creando..." : `Crear "${query.trim()}"`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
