import { InheritedAccessNotice } from "@/components/organization/inherited-access-notice";
import type { LookedUpUser } from "@/lib/actions/user/lookup-user-by-email.action";
import { formatList } from "@/lib/utils";
import { Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

export type AssignmentScope = { clinicIds: string[] | null };

type Role = "ADMIN" | "DOCTOR" | "USER";

export interface Assignment {
  existingRole: Role | null;
  existingSpecialties: { id: string; name: string }[];
  existingClinics: { clinicId: string; role: Role }[];
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
  const chosen = scope.clinicIds ?? [];
  const existingClinics = (person?.clinics ?? [])
    .filter((clinic) => chosen.includes(clinic.clinicId))
    .map(({ clinicId, role }) => ({ clinicId, role }));
  const single =
    chosen.length === 1
      ? person?.clinics.find((clinic) => clinic.clinicId === chosen[0])
      : undefined;

  const existingRole: Role | null = !person
    ? null
    : scope.clinicIds === null
      ? person.organizationRole
      : chosen.length === 1
        ? (single?.role ?? null)
        : null;

  const isSelf =
    !!currentUserEmail &&
    email.trim().toLowerCase() === currentUserEmail.toLowerCase();

  const mode = !person
    ? "new"
    : scope.clinicIds === null
      ? existingRole === null
        ? "assign"
        : "edit"
      : chosen.length > 0 && existingClinics.length === chosen.length
        ? "edit"
        : "assign";

  const changesOrganizationRole =
    scope.clinicIds === null && mode === "edit" && role !== existingRole;

  let blocked: Assignment["blocked"] = null;
  if (existingClinics.some((clinic) => clinic.role === "ADMIN"))
    blocked = "clinic-admin";
  if (changesOrganizationRole) {
    if (isSelf) blocked = "self-role";
    else if (person?.isAccountOwner) blocked = "owner-role";
  }

  return {
    existingRole,
    existingClinics,
    existingSpecialties: single?.role === "DOCTOR" ? single.specialties : [],
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
  clinicNames: string[];
  existingClinicNames: string[];
  clinicNameById: (id: string) => string;
  steppingDown: { name: string; pendingAppointments: number }[];
}

export const AssignmentNotice = ({
  assignment,
  role,
  scope,
  personName,
  organizationName,
  clinicNames,
  existingClinicNames,
  clinicNameById,
  steppingDown,
}: NoticeProps) => {
  if (scope.clinicIds === null) {
    if (assignment.blocked === "self-role")
      return <Amber>No puedes cambiar tu propio rol.</Amber>;
    if (assignment.blocked === "owner-role")
      return <Amber>El rol del dueño de la cuenta no se puede cambiar.</Amber>;

    const stopping = steppingDown.filter((c) => c.pendingAppointments === 0);
    const staying = steppingDown.filter((c) => c.pendingAppointments > 0);

    return (
      <div className="flex flex-col gap-2">
        <InheritedAccessNotice
          role={role === "ADMIN" ? "ADMIN" : "USER"}
          organizationName={organizationName}
        />
        {stopping.length > 0 && (
          <Amber>
            {personName} dejará de atender en{" "}
            {formatList(stopping.map((c) => c.name))}. Sus horarios se guardan
            por si vuelve a atender.
          </Amber>
        )}
        {staying.map((clinic) => (
          <Amber key={clinic.name}>
            En {clinic.name} tiene {clinic.pendingAppointments}{" "}
            {clinic.pendingAppointments === 1
              ? "cita pendiente"
              : "citas pendientes"}
            : seguirá atendiendo ahí. Pásalo a Usuario en esa sede cuando ya no
            tenga citas.
          </Amber>
        ))}
      </div>
    );
  }

  if (clinicNames.length === 0) return null;

  const list = formatList(clinicNames);
  const multiple = clinicNames.length > 1;
  const clinicName = clinicNames[0];
  const wasDoctor =
    assignment.mode === "edit" && assignment.existingRole === "DOCTOR";

  if (assignment.blocked === "clinic-admin") {
    const adminList = formatList(
      assignment.existingClinics
        .filter((clinic) => clinic.role === "ADMIN")
        .map((clinic) => clinicNameById(clinic.clinicId)),
    );
    return (
      <Amber>
        {personName} es administrador directo de {adminList} y su rol no se
        puede cambiar aquí.
      </Amber>
    );
  }

  if (!multiple) {
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
  }

  const existingList = formatList(existingClinicNames);
  const doctorClinicNames = assignment.existingClinics
    .filter((clinic) => clinic.role === "DOCTOR")
    .map((clinic) => clinicNameById(clinic.clinicId));
  const hadDoctor = doctorClinicNames.length > 0;

  let base: ReactNode;
  if (role === "DOCTOR" && assignment.isSelf) {
    base = (
      <Gray>
        Te asignas como médico de {list}. Sigues siendo administrador; configura
        tus horarios en cada sede para aparecer en el link de reserva.
      </Gray>
    );
  } else if (role === "DOCTOR") {
    base = (
      <Gray>
        Atenderá en {list} con las mismas especialidades; después puedes
        cambiarlas sede por sede. Aparece en el link de reserva de cada sede
        cuando tenga horarios ahí.
      </Gray>
    );
  } else {
    base = (
      <Gray>
        Verá la agenda del día de {list} y las fichas de sus pacientes. Podrá
        actualizar el contacto de un paciente, pero no su información de salud.
      </Gray>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {base}
      {assignment.existingClinics.length > 0 && (
        <Amber>
          {role === "USER" && hadDoctor
            ? `${personName} dejará de atender en ${formatList(doctorClinicNames)} y saldrá del link de reserva. Sus citas ya reservadas no cambian.`
            : `${personName} ya tiene acceso a ${existingList}: ahí se reemplazan su rol y sus especialidades.`}
        </Amber>
      )}
    </div>
  );
};
