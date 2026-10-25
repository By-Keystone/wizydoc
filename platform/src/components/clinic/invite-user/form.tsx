"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/common/form";
import type { Specialty } from "@/lib/api/specialty/types";
import {
  type LookedUpUser,
  lookupOrganizationUserByEmailAction,
} from "@/lib/actions/user/lookup-user-by-email.action";
import { SpecialtyMultiSelect } from "./specialty-multi-select";
import { AssignmentNotice, resolveAssignment } from "./assignment-notice";
import { fieldError, type FieldErrors } from "@/lib/actions/types";

interface InviteUserFields extends Record<string, unknown> {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  specialtyIds: string[];
  clinicIds: string[];
}

type ScopeMode = "all" | "clinics";

const ROLE_LABEL = {
  ADMIN: "Administrador",
  DOCTOR: "Médico",
  USER: "Usuario",
} as const;

const ORGANIZATION_ROLE_OPTIONS = [
  { label: "Usuario", value: "USER" },
  { label: "Administrador", value: "ADMIN" },
];

const CLINIC_ROLE_OPTIONS = [
  { label: "Médico", value: "DOCTOR" },
  { label: "Usuario", value: "USER" },
];

interface Props {
  formId: string;
  organizationId: string;
  organizationName: string;
  clinics: { id: string; name: string }[];
  fixedClinicId?: string;
  specialties?: Specialty[];
  currentUserEmail?: string;
  isPending: boolean;
  onSubmit: (scope: { clinicIds: string[] | null }, formData: FormData) => void;
  onCancel: () => void;
  fieldErrors?: FieldErrors<InviteUserFields>;
}

function defaultSelection(clinics: Props["clinics"], fixedClinicId?: string) {
  if (fixedClinicId) return [fixedClinicId];
  if (clinics.length === 1) return [clinics[0].id];
  return [];
}

// Misma clave = misma precarga: pasar de 2 a 3 sedes no reinicia lo elegido.
function preloadKey(selected: string[]) {
  return selected.length === 1 ? selected[0] : "multi";
}

function shouldResetPreload(previous: string[], next: string[]) {
  if (previous.length === 0 || next.length === 0) return true;
  if (previous.length === 1 && next.length === 1)
    return previous[0] !== next[0];
  return false;
}

function initialRole(
  person: LookedUpUser | null,
  mode: ScopeMode,
  selected: string[],
) {
  if (mode === "all") {
    const existing = person?.organizationRole;
    return existing === "ADMIN" || existing === "USER" ? existing : "USER";
  }

  const roles = selected.map(
    (id) => person?.clinics.find((clinic) => clinic.clinicId === id)?.role,
  );
  const [first] = roles;
  const common =
    roles.length > 0 && roles.every((r) => r === first) ? first : undefined;
  return common === "DOCTOR" || common === "USER" ? common : "DOCTOR";
}

export const InviteUserForm = ({
  formId,
  organizationId,
  organizationName,
  clinics,
  fixedClinicId,
  specialties = [],
  currentUserEmail,
  isPending,
  onSubmit,
  onCancel,
  fieldErrors,
}: Props) => {
  const noticeId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<"email" | "details">("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [selectedClinicIds, setSelectedClinicIds] = useState(
    defaultSelection(clinics, fixedClinicId),
  );
  const [scopeMode, setScopeMode] = useState<ScopeMode>(
    selectedClinicIds.length > 0 ? "clinics" : "all",
  );
  const [role, setRole] = useState<string>(
    initialRole(null, scopeMode, selectedClinicIds),
  );
  // La precarga (y con ella las especialidades elegidas) sólo se reinicia cuando cambia de verdad; pasar de 1 a 2 sedes la conserva.
  const [preloadAnchor, setPreloadAnchor] = useState(
    preloadKey(selectedClinicIds),
  );
  const [clinicsError, setClinicsError] = useState<string | null>(null);
  const clinicsErrorId = `${formId}-clinics-error`;
  const [existingUser, setExistingUser] = useState<LookedUpUser | null>(null);
  const [isLookingUp, startLookup] = useTransition();

  const scope = {
    clinicIds: scopeMode === "all" ? null : selectedClinicIds,
  };
  const nameOf = (id: string) =>
    clinics.find((clinic) => clinic.id === id)?.name ?? "";
  const clinicNames = (scope.clinicIds ?? []).map(nameOf);
  const existingClinicNames = (existingUser?.clinics ?? [])
    .filter((clinic) => scope.clinicIds?.includes(clinic.clinicId))
    .map((clinic) => nameOf(clinic.clinicId));
  // Bajar de Administrador a Usuario: sus sedes como Médico se cierran salvo las que tienen citas pendientes.
  const steppingDown =
    scopeMode === "all" &&
    existingUser?.organizationRole === "ADMIN" &&
    role === "USER"
      ? existingUser.clinics
          .filter((clinic) => clinic.role === "DOCTOR")
          .map((clinic) => ({
            name: nameOf(clinic.clinicId),
            pendingAppointments: clinic.pendingAppointments,
          }))
      : [];
  const groupError =
    clinicsError ?? fieldError(fieldErrors, "clinicIds") ?? null;
  const assignment = resolveAssignment({
    person: existingUser,
    email,
    scope,
    role,
    currentUserEmail,
  });

  // Paso 1 → 2: verifica el correo (con feedback visible) y precarga datos.
  const handleContinue = () => {
    const value = (
      (new FormData(formRef.current!).get("email") as string) ?? ""
    ).trim();

    if (!value?.includes("@")) {
      setEmailError("Ingresa un correo electrónico válido");
      return;
    }

    setEmailError(null);
    setEmail(value);
    startLookup(async () => {
      const user = await lookupOrganizationUserByEmailAction(
        organizationId,
        value,
      );
      setExistingUser(user);
      setRole(initialRole(user, scopeMode, selectedClinicIds));
      setStep("details");
    });
  };

  const handleModeChange = (next: ScopeMode) => {
    setScopeMode(next);
    setClinicsError(null);
    setRole(initialRole(existingUser, next, selectedClinicIds));
    setPreloadAnchor(preloadKey(selectedClinicIds));
  };

  const handleToggleClinic = (id: string, checked: boolean) => {
    const next = checked
      ? [...selectedClinicIds, id]
      : selectedClinicIds.filter((current) => current !== id);
    setSelectedClinicIds(next);
    setClinicsError(null);
    if (shouldResetPreload(selectedClinicIds, next)) {
      setRole(initialRole(existingUser, scopeMode, next));
      setPreloadAnchor(preloadKey(next));
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (scopeMode === "clinics" && selectedClinicIds.length === 0) {
      setClinicsError("Elige al menos una sede");
      formRef.current
        ?.querySelector<HTMLInputElement>('input[name="clinicIds"]')
        ?.focus();
      return;
    }
    onSubmit(scope, new FormData(e.currentTarget));
  };

  const readOnlyHint = existingUser ? `${formId}-readonly-hint` : undefined;
  const personKey = existingUser ? email : "new";
  const submitLabel =
    assignment.mode === "new"
      ? "Enviar invitación"
      : assignment.mode === "assign"
        ? "Asignar"
        : "Guardar cambios";

  return (
    <form
      ref={formRef}
      id={formId}
      onSubmit={handleSubmit}
      className="flex flex-col gap-y-3"
    >
      {step === "email" ? (
        <>
          <Input
            label="Correo electrónico"
            name="email"
            type="email"
            value={email}
            placeholder="usuario@correo.com"
            autoFocus
            error={emailError ?? undefined}
          />
          <p className="text-xs text-brand-gray">
            Verificaremos si ya tiene una cuenta para precargar sus datos.
          </p>

          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLookingUp}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleContinue}
              disabled={isLookingUp}
            >
              {isLookingUp ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                "Continuar"
              )}
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* El correo ya no se edita aquí; viaja en un hidden dentro del form. */}
          <input type="hidden" name="email" value={email} />
          <div className="flex items-center justify-between rounded-lg bg-brand-surface px-3 py-2 text-sm">
            <span className="truncate text-brand-gray">{email}</span>
            <button
              type="button"
              onClick={() => setStep("email")}
              className="ml-2 shrink-0 text-xs font-medium text-brand-teal-dark hover:underline"
            >
              Cambiar
            </button>
          </div>

          <div
            className={`rounded-lg px-3 py-2 text-xs ${
              existingUser
                ? "bg-brand-teal/10 text-brand-teal-dark"
                : "bg-brand-surface text-brand-gray"
            }`}
          >
            {existingUser
              ? "Ya tiene una cuenta — precargamos sus datos."
              : "Usuario nuevo — completa sus datos."}
          </div>

          {existingUser && (
            <p id={readOnlyHint} className="text-xs text-brand-gray">
              Sus datos los actualiza esa persona en Mi perfil.
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <Input
              key={`name-${personKey}`}
              label="Nombre"
              name="name"
              value={existingUser?.name}
              readOnly={!!existingUser}
              aria-describedby={readOnlyHint}
              error={fieldError(fieldErrors, "name")}
              disabled={isPending}
            />
            <Input
              key={`lastName-${personKey}`}
              label="Apellido"
              name="lastName"
              value={existingUser?.lastName}
              readOnly={!!existingUser}
              aria-describedby={readOnlyHint}
              error={fieldError(fieldErrors, "lastName")}
              disabled={isPending}
            />
          </div>

          <Input
            key={`phone-${personKey}`}
            label="Teléfono"
            name="phone"
            value={existingUser?.phone}
            readOnly={!!existingUser}
            aria-describedby={readOnlyHint}
            error={fieldError(fieldErrors, "phone")}
            disabled={isPending}
          />

          {fixedClinicId ? (
            <>
              <Input
                label="Sede"
                name="clinicName"
                value={nameOf(fixedClinicId)}
                readOnly
                aria-describedby={noticeId}
              />
              <input type="hidden" name="clinicIds" value={fixedClinicId} />
            </>
          ) : (
            <fieldset
              aria-describedby={noticeId}
              className="flex flex-col gap-2"
            >
              <legend className="mb-1.5 text-sm font-medium text-brand-gray">
                Acceso
              </legend>
              <label className="flex items-center gap-2 text-sm text-brand-ink">
                <input
                  type="radio"
                  name="scopeMode"
                  value="all"
                  checked={scopeMode === "all"}
                  onChange={() => handleModeChange("all")}
                  disabled={isPending}
                  className="h-4 w-4 accent-brand-teal"
                />
                Todas las sedes de {organizationName}
              </label>
              {clinics.length > 0 && (
                <label className="flex items-center gap-2 text-sm text-brand-ink">
                  <input
                    type="radio"
                    name="scopeMode"
                    value="clinics"
                    checked={scopeMode === "clinics"}
                    onChange={() => handleModeChange("clinics")}
                    disabled={isPending}
                    className="h-4 w-4 accent-brand-teal"
                  />
                  Sedes específicas
                </label>
              )}
              {scopeMode === "clinics" && (
                <fieldset
                  aria-describedby={groupError ? clinicsErrorId : undefined}
                  className="m-0 flex max-h-48 min-w-0 flex-col gap-2 overflow-y-auto rounded-lg border border-gray-200 p-3"
                >
                  <legend className="sr-only">Sedes</legend>
                  {clinics.map((clinic) => {
                    const existing = existingUser?.clinics.find(
                      (item) => item.clinicId === clinic.id,
                    );
                    return (
                      <label
                        key={clinic.id}
                        className="flex items-center gap-2 text-sm text-brand-ink"
                      >
                        <input
                          type="checkbox"
                          name="clinicIds"
                          value={clinic.id}
                          checked={selectedClinicIds.includes(clinic.id)}
                          onChange={(e) =>
                            handleToggleClinic(clinic.id, e.target.checked)
                          }
                          disabled={isPending}
                          className="h-4 w-4 rounded border-gray-300 accent-brand-teal"
                        />
                        <span>
                          {clinic.name}
                          {existing && (
                            <span className="text-xs text-brand-gray">
                              {" "}
                              · {ROLE_LABEL[existing.role]}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              )}
              {groupError && (
                <p
                  id={clinicsErrorId}
                  role="alert"
                  className="text-xs text-red-600"
                >
                  {groupError}
                </p>
              )}
            </fieldset>
          )}

          <Select
            label="Rol"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={
              scope.clinicIds ? CLINIC_ROLE_OPTIONS : ORGANIZATION_ROLE_OPTIONS
            }
            disabled={isPending}
            aria-describedby={noticeId}
          />

          <div id={noticeId} aria-live="polite">
            <AssignmentNotice
              assignment={assignment}
              role={role}
              scope={scope}
              personName={
                existingUser
                  ? `${existingUser.name} ${existingUser.lastName}`
                  : "Esta persona"
              }
              organizationName={organizationName}
              clinicNames={clinicNames}
              existingClinicNames={existingClinicNames}
              clinicNameById={nameOf}
              steppingDown={steppingDown}
            />
          </div>

          {scope.clinicIds && role === "DOCTOR" && (
            <SpecialtyMultiSelect
              key={`${role}-${preloadAnchor}`}
              organizationId={organizationId}
              initialSpecialties={specialties}
              initialSelected={assignment.existingSpecialties}
            />
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("email")}
              disabled={isPending}
            >
              Atrás
            </Button>
            <Button
              type="submit"
              disabled={isPending || assignment.blocked !== null}
            >
              {isPending ? "Guardando..." : submitLabel}
            </Button>
          </div>
        </>
      )}
    </form>
  );
};
