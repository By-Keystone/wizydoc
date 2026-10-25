"use client";

import {
  type ReactNode,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createSpecialtyAction } from "@/lib/actions/specialty/create-specialty.action";
import { getOrganizationSpecialtiesAction } from "@/lib/actions/specialty/get-organization-specialties.action";
import { toast } from "@/lib/toast";

type Specialty = { id: string; name: string };

interface Props {
  organizationId: string;
  initialSpecialties: Specialty[];
  initialSelected?: Specialty[];
  onChange?: (selected: Specialty[]) => void;
  label?: string;
  allowCreate?: boolean;
  labelClassName?: string;
  listInFlow?: boolean;
  emptyHint?: (canCreate: boolean) => ReactNode;
  onCreate?: (specialty: Specialty) => void;
}

export const SpecialtyMultiSelect = ({
  organizationId,
  initialSpecialties,
  initialSelected = [],
  onChange,
  label = "Especialidades",
  allowCreate = true,
  labelClassName,
  listInFlow = false,
  emptyHint,
  onCreate,
}: Props) => {
  const searchId = useId();
  const router = useRouter();
  const [specialties, setSpecialties] = useState(initialSpecialties);
  const [selected, setSelected] = useState<Specialty[]>(initialSelected);
  // Tras el await de crear, el cierre de `select` vería una selección vieja.
  const selectedRef = useRef(selected);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedIds = useMemo(
    () => new Set(selected.map((s) => s.id)),
    [selected],
  );

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

  const update = (next: Specialty[]) => {
    selectedRef.current = next;
    setSelected(next);
    onChange?.(next);
  };

  const select = (specialty: Specialty) => {
    update([...selectedRef.current, specialty]);
    setQuery("");
    if (listInFlow) setOpen(false);
  };

  const remove = (id: string) => {
    update(selectedRef.current.filter((s) => s.id !== id));
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
      if (created) {
        onCreate?.(created);
        select(created);
      } else setQuery("");
    });
  };

  return (
    <div className="flex flex-col gap-y-1">
      <label htmlFor={searchId} className={labelClassName}>
        {label}
      </label>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full bg-brand-teal/10 px-2.5 py-1 text-xs font-medium text-brand-teal-dark"
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
          id={searchId}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (listInFlow) setOpen(e.target.value.trim().length > 0);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => listInFlow && setOpen(true)}
          // Con la lista en el flujo no tapa nada; cerrarla al perder el foco movería el contenido bajo el clic.
          onBlur={() => {
            if (!listInFlow) setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }}
          placeholder="Buscar especialidad..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
        />

        {open &&
          (filtered.length > 0 || (allowCreate && query.trim().length > 0)) && (
            <div
              className={`${listInFlow ? "" : "absolute z-10 "}mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg`}
            >
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
              {allowCreate && query.trim().length > 0 && !exactMatch && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={createAndSelect}
                  disabled={isPending}
                  className="flex w-full items-center gap-1.5 border-t border-gray-100 px-3 py-2 text-left text-sm font-medium text-brand-teal hover:bg-brand-teal/10 hover:text-brand-teal-dark disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {isPending ? "Creando..." : `Crear "${query.trim()}"`}
                </button>
              )}
            </div>
          )}
      </div>

      {emptyHint && specialties.length === 0 && (
        <p className="mt-1 rounded-lg bg-brand-surface px-3 py-2 text-[12.5px] leading-snug text-brand-gray">
          {emptyHint(allowCreate)}
        </p>
      )}
    </div>
  );
};
