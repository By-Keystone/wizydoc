import { InheritedAccessNotice } from "@/components/organization/inherited-access-notice";
import type { LookedUpUser } from "@/lib/actions/user/lookup-user-by-email.action";
import { Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

export type AssignmentScope = { clinicId: string | null };

type Role = "ADMIN" | "DOCTOR" | "USER";

export interface Assignment {
  existingRole: Role | null;
  existingSpecialties: { id: string; name: string }[];
  isSelf: boolean;
  mode: "new" | "assign" | "edit";
  blocked: null | "self-role" | "owner-role" | "clinic-admin";
}

export function resolveAssignment({
  person,
  email,
  scope,
  role,
  currentUserEmail,
}: {
  person: LookedUpUser | null;
  email: string;
  scope: AssignmentScope;
  role: string;
  currentUserEmail?: string;
}): Assignment {
  const clinicMembership = scope.clinicId
    ? person?.clinics.find((clinic) => clinic.clinicId === scope.clinicId)
    : undefined;

  const existingRole: Role | null = !person
    ? null
    : scope.clinicId
      ? (clinicMembership?.role ?? null)
      : person.organizationRole;

  const isSelf =
    !!currentUserEmail &&
    email.trim().toLowerCase() === currentUserEmail.toLowerCase();

  const mode = !person ? "new" : existingRole === null ? "assign" : "edit";

  const changesOrganizationRole =
    !scope.clinicId && mode === "edit" && role !== existingRole;

  let blocked: Assignment["blocked"] = null;
  if (scope.clinicId && existingRole === "ADMIN") blocked = "clinic-admin";
  if (changesOrganizationRole) {
    if (isSelf) blocked = "self-role";
    else if (person?.isAccountOwner) blocked = "owner-role";
  }

  return {
    existingRole,
    existingSpecialties:
      existingRole === "DOCTOR" ? (clinicMembership?.specialties ?? []) : [],
    isSelf,
    mode,
    blocked,
  };
}

const Gray = ({ children }: { children: ReactNode }) => (
  <div className="flex gap-2.5 rounded-lg bg-brand-surface px-3 py-2.5 text-xs text-brand-gray">
    <Info
      className="mt-0.5 h-4 w-4 shrink-0 text-brand-teal"
      aria-hidden="true"
    />
    <p>{children}</p>
  </div>
);

const Teal = ({ children }: { children: ReactNode }) => (
  <div className="flex gap-2.5 rounded-lg bg-brand-teal/10 px-3 py-2.5 text-xs text-brand-teal">
    <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
    <p>{children}</p>
  </div>
);

const Amber = ({ children }: { children: ReactNode }) => (
  <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
    <ShieldAlert
      className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
      aria-hidden="true"
    />
    <p>{children}</p>
  </div>
);

interface NoticeProps {
  assignment: Assignment;
  role: string;
  scope: AssignmentScope;
  personName: string;
  organizationName: string;
  clinicName: string;
}

export const AssignmentNotice = ({
  assignment,
  role,
  scope,
  personName,
  organizationName,
  clinicName,
}: NoticeProps) => {
  if (!scope.clinicId) {
    if (assignment.blocked === "self-role")
      return <Amber>No puedes cambiar tu propio rol.</Amber>;
    if (assignment.blocked === "owner-role")
      return <Amber>El rol del dueño de la cuenta no se puede cambiar.</Amber>;

    return (
      <InheritedAccessNotice
        role={role === "ADMIN" ? "ADMIN" : "USER"}
        organizationName={organizationName}
      />
    );
  }

  const wasDoctor =
    assignment.mode === "edit" && assignment.existingRole === "DOCTOR";

  if (assignment.blocked === "clinic-admin") {
    return (
      <Amber>
        {personName} es administrador directo de {clinicName} y su rol no se
        puede cambiar aquí.
      </Amber>
    );
  }

  if (role === "DOCTOR") {
    if (assignment.isSelf) {
      return (
        <Gray>
          Te asignas como médico de {clinicName}. Sigues siendo administrador;
          configura tus horarios para aparecer en el link de reserva.
        </Gray>
      );
    }
    if (wasDoctor) {
      return (
        <Teal>
          {personName} ya atiende en {clinicName}. Puedes cambiar sus
          especialidades.
        </Teal>
      );
    }
    return (
      <Gray>
        Atenderá en {clinicName}: verá sus citas y configurará sus horarios.
        Aparece en el link de reserva cuando tenga horarios.
      </Gray>
    );
  }

  if (wasDoctor) {
    return (
      <Amber>
        {personName} dejará de atender en {clinicName} y saldrá del link de
        reserva. Sus citas ya reservadas no cambian.
      </Amber>
    );
  }

  return (
    <Gray>
      Verá la agenda del día de {clinicName} y las fichas de sus pacientes.
      Podrá actualizar el contacto de un paciente, pero no su información de
      salud.
    </Gray>
  );
};
