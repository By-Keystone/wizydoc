"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { ErrorState } from "@/components/common/error-state";
import { Label } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import {
  type ListPatientsResult,
  listPatientsAction,
} from "@/lib/actions/patient/list-patients.action";
import {
  type PatientsPage,
  SEARCH_MAX_CHARACTERS,
  SEARCH_MIN_CHARACTERS,
} from "@/lib/api/patients/types";
import type { UserMembership } from "@/lib/api/memberships/types";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { PatientsTable } from "./patients-table";

interface Props {
  resourceId: string;
  patientsPath: string;
  resourceType: UserMembership["resourceType"];
  resourceName: string;
  initialPage: PatientsPage;
}

type Phase = "idle" | "short" | "searching" | "search-error";

const SEARCH_DELAY_MS = 300;
const LOAD_MORE_ERROR = "No pudimos cargar más pacientes. Vuelve a intentarlo.";

const collapseSpaces = (text: string) => text.trim().replace(/\s+/g, " ");
const significantLength = (text: string) => text.replace(/\s/g, "").length;

async function requestPatients(
  input: Parameters<typeof listPatientsAction>[0],
): Promise<ListPatientsResult> {
  try {
    return await listPatientsAction(input);
  } catch {
    return { status: "error", message: "No se pudo completar la petición" };
  }
}

function foundMessage({ patients, hasMore }: PatientsPage) {
  if (hasMore) return `Más de ${patients.length} pacientes encontrados`;

  return patients.length === 1
    ? "1 paciente encontrado"
    : `${patients.length} pacientes encontrados`;
}

export function PatientsBrowser({
  resourceId,
  patientsPath,
  resourceType,
  resourceName,
  initialPage,
}: Props) {
  const router = useRouter();
  const searchId = useId();
  const statusId = useId();

  const [term, setTerm] = useState("");
  const [page, setPage] = useState(initialPage);
  const [searchedTerm, setSearchedTerm] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [rowToFocus, setRowToFocus] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const latestRequest = useRef(0);
  const isLoadingMoreRef = useRef(false);

  const hasPatients = initialPage.patients.length > 0;
  const isOrganization = resourceType === "ORGANIZATION";

  useEffect(() => {
    if (rowToFocus === null) return;

    const rows = resultsRef.current?.querySelectorAll("tbody tr");
    rows?.[rowToFocus]?.querySelector("a")?.focus();
    setRowToFocus(null);
  }, [rowToFocus]);

  useEffect(() => () => clearTimeout(debounceTimer.current), []);

  const discardPendingRequests = () => {
    clearTimeout(debounceTimer.current);
    latestRequest.current += 1;
    isLoadingMoreRef.current = false;
    setIsLoadingMore(false);
  };

  const leaveWhenSessionOrPlanIsLost = (response: ListPatientsResult) => {
    if (response.status === "auth-expired") {
      toast.error("Tu sesión ha expirado. Vuelve a iniciar sesión.");
      router.push("/login");
      return true;
    }

    if (response.status === "plan-required") {
      router.refresh();
      return true;
    }

    return false;
  };

  const showFirstPage = (nextPhase: Phase) => {
    setPage(initialPage);
    setSearchedTerm(null);
    setPhase(nextPhase);
    setAnnouncement("");
  };

  const runSearch = async (search: string) => {
    discardPendingRequests();
    const request = latestRequest.current;
    setPhase("searching");
    setAnnouncement("");

    const searchResponse = await requestPatients({ resourceId, search });

    if (request !== latestRequest.current) return;

    if (searchResponse.status === "success") {
      setPage(searchResponse.data);
      setSearchedTerm(search);
      setPhase("idle");
      return;
    }

    if (leaveWhenSessionOrPlanIsLost(searchResponse)) {
      setPhase("idle");
      return;
    }

    setSearchedTerm(search);
    setPhase("search-error");
  };

  const changeTerm = (nextTerm: string) => {
    setTerm(nextTerm);
    discardPendingRequests();

    const search = collapseSpaces(nextTerm);
    const length = significantLength(search);

    if (length < SEARCH_MIN_CHARACTERS) {
      showFirstPage(length === 0 ? "idle" : "short");
      return;
    }

    debounceTimer.current = setTimeout(
      () => runSearch(search),
      SEARCH_DELAY_MS,
    );
  };

  const clearSearch = () => {
    changeTerm("");
    inputRef.current?.focus();
  };

  const searchNow = (event: FormEvent) => {
    event.preventDefault();

    const search = collapseSpaces(term);

    if (significantLength(search) >= SEARCH_MIN_CHARACTERS) runSearch(search);
  };

  const retrySearch = () => {
    if (searchedTerm !== null) runSearch(searchedTerm);
  };

  const seeMore = async () => {
    const isSearchPending = phase === "searching";

    if (isLoadingMoreRef.current || isSearchPending || page.nextFrom === null) {
      return;
    }

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    const request = latestRequest.current;

    const nextPageResponse = await requestPatients({
      resourceId,
      search: searchedTerm ?? undefined,
      from: page.nextFrom,
    });

    if (request !== latestRequest.current) return;

    isLoadingMoreRef.current = false;
    setIsLoadingMore(false);

    if (nextPageResponse.status === "success") {
      const patients = [...page.patients, ...nextPageResponse.data.patients];

      setRowToFocus(page.patients.length);
      setPage({ ...nextPageResponse.data, patients });
      if (searchedTerm === null) {
        setAnnouncement(`Se muestran ${patients.length} pacientes`);
      }
      return;
    }

    if (!leaveWhenSessionOrPlanIsLost(nextPageResponse)) {
      toast.error(LOAD_MORE_ERROR);
    }
  };

  const statusLine = () => {
    if (phase === "short") {
      return `Escribe al menos ${SEARCH_MIN_CHARACTERS} letras o números.`;
    }
    if (phase === "searching") return "Buscando…";
    if (phase === "search-error") return null;

    if (searchedTerm !== null) {
      return page.patients.length === 0 ? (
        <span className="sr-only">Ningún paciente encontrado</span>
      ) : (
        foundMessage(page)
      );
    }

    return announcement ? (
      <span className="sr-only">{announcement}</span>
    ) : null;
  };

  const emptyMessage =
    searchedTerm === null ? (
      <>
        <p className="font-medium text-brand-ink">Todavía no hay pacientes.</p>
        <p className="mt-1">
          Aparecen aquí cuando reservan su primera cita{" "}
          {isOrganization ? "en cualquiera de tus sedes" : `en ${resourceName}`}
          .
        </p>
      </>
    ) : (
      <>
        <p className="font-medium text-brand-ink">
          No encontramos pacientes que coincidan.
        </p>
        <p className="mt-1">
          Revisa cómo está escrito o busca por DNI o teléfono.
        </p>
        {!isOrganization && (
          <p className="mt-1">
            Aquí solo aparecen quienes tienen alguna cita en {resourceName}.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clearSearch}
          className="mt-4 min-h-10 sm:min-h-0"
        >
          Limpiar búsqueda
        </Button>
      </>
    );

  const isSearching = phase === "searching";

  return (
    <>
      {hasPatients && (
        // biome-ignore lint/a11y/useSemanticElements: el elemento <search> no se reconoce en iOS anterior a 17
        <form role="search" onSubmit={searchNow} className="mb-4" noValidate>
          <Label htmlFor={searchId} className="sr-only">
            Buscar paciente
          </Label>
          <div className="relative w-full sm:max-w-md">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray"
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
            <input
              ref={inputRef}
              id={searchId}
              type="search"
              value={term}
              onChange={(event) => changeTerm(event.target.value)}
              autoComplete="off"
              enterKeyHint="search"
              maxLength={SEARCH_MAX_CHARACTERS}
              placeholder="Busca por nombre, DNI o teléfono"
              aria-describedby={statusId}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-10 text-base text-brand-ink outline-none transition placeholder:text-gray-400 focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20 sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
            />
            {term.length > 0 && (
              <span className="absolute right-1 top-1/2 -translate-y-1/2">
                <button
                  type="button"
                  aria-label="Limpiar búsqueda"
                  onClick={clearSearch}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-brand-gray hover:bg-gray-100 hover:text-brand-ink"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
          <p
            id={statusId}
            role="status"
            className="mt-2 min-h-5 text-sm text-brand-gray"
          >
            {statusLine()}
          </p>
        </form>
      )}

      {phase === "search-error" ? (
        <ErrorState
          title="No pudimos buscar"
          message="Revisa tu conexión y vuelve a intentarlo."
          onRetry={retrySearch}
        />
      ) : (
        <div
          ref={resultsRef}
          aria-busy={isSearching ? true : undefined}
          className={cn("transition-opacity", isSearching && "opacity-60")}
        >
          <PatientsTable
            patients={page.patients}
            patientsPath={patientsPath}
            empty={emptyMessage}
          />
          {page.hasMore && (
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                disabled={isLoadingMore || isSearching}
                onClick={seeMore}
                className="w-full sm:w-auto"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Cargando…
                  </>
                ) : searchedTerm === null ? (
                  "Ver más pacientes"
                ) : (
                  "Ver más resultados"
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
