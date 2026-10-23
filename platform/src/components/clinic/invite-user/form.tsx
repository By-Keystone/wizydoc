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
}

const ALL_CLINICS = "all";

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
  onSubmit: (scope: { clinicId: string | null }, formData: FormData) => void;
  onCancel: () => void;
  fieldErrors?: FieldErrors<InviteUserFields>;
}

function defaultScope(clinics: Props["clinics"], fixedClinicId?: string) {
  if (fixedClinicId) return fixedClinicId;
  if (clinics.length === 1) return clinics[0].id;
  return ALL_CLINICS;
}

function initialRole(person: LookedUpUser | null, scopeValue: string) {
  const options =
    scopeValue === ALL_CLINICS
      ? ORGANIZATION_ROLE_OPTIONS
      : CLINIC_ROLE_OPTIONS;
  const fallback = scopeValue === ALL_CLINICS ? "USER" : "DOCTOR";

  const existing =
    scopeValue === ALL_CLINICS
      ? person?.organizationRole
      : person?.clinics.find((clinic) => clinic.clinicId === scopeValue)?.role;

  return options.some((option) => option.value === existing)
    ? (existing as string)
    : fallback;
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
  const [scopeValue, setScopeValue] = useState(
    defaultScope(clinics, fixedClinicId),
  );
  const [role, setRole] = useState(initialRole(null, scopeValue));
  const [existingUser, setExistingUser] = useState<LookedUpUser | null>(null);
  const [isLookingUp, startLookup] = useTransition();

  const scope = { clinicId: scopeValue === ALL_CLINICS ? null : scopeValue };
  const clinicName =
    clinics.find((clinic) => clinic.id === scope.clinicId)?.name ?? "";
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
      setRole(initialRole(user, scopeValue));
      setStep("details");
    });
  };

  const handleScopeChange = (next: string) => {
    setScopeValue(next);
    setRole(initialRole(existingUser, next));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
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
              className="ml-2 shrink-0 text-xs font-medium text-brand-teal hover:text-brand-teal-dark"
            >
              Cambiar
            </button>
          </div>

          <div
            className={`rounded-lg px-3 py-2 text-xs ${
              existingUser
                ? "bg-brand-teal/10 text-brand-teal"
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
            <Input
              label="Sede"
              name="clinicName"
              value={clinicName}
              readOnly
              aria-describedby={noticeId}
            />
          ) : (
            <Select
              label="Sede"
              name="clinicScope"
              value={scopeValue}
              onChange={(e) => handleScopeChange(e.target.value)}
              options={[
                {
                  label: `Todas las sedes de ${organizationName}`,
                  value: ALL_CLINICS,
                },
                ...clinics.map((clinic) => ({
                  label: clinic.name,
                  value: clinic.id,
                })),
              ]}
              disabled={isPending}
              aria-describedby={noticeId}
            />
          )}

          <Select
            label="Rol"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={
              scope.clinicId ? CLINIC_ROLE_OPTIONS : ORGANIZATION_ROLE_OPTIONS
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
              clinicName={clinicName}
            />
          </div>

          {scope.clinicId && role === "DOCTOR" && (
            <SpecialtyMultiSelect
              key={`${scopeValue}-${role}`}
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
