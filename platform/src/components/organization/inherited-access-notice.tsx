import { Info, ShieldAlert } from "lucide-react";

interface Props {
  role: "ADMIN" | "USER";
  organizationName: string;
}

export const InheritedAccessNotice = ({ role, organizationName }: Props) => {
  if (role === "ADMIN") {
    return (
      <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
        <ShieldAlert
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
          aria-hidden="true"
        />
        <div>
          <p className="font-semibold">Acceso total a {organizationName}</p>
          <p className="mt-0.5">
            Verá y editará las fichas de los pacientes, incluidos sus datos de
            salud, la agenda y el equipo de todas las sedes. También podrá
            invitar a otras personas y crear sedes y organizaciones. Elige este
            rol sólo para quien lo necesite.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5 rounded-lg bg-brand-surface px-3 py-2.5 text-xs text-brand-gray">
      <Info
        className="mt-0.5 h-4 w-4 shrink-0 text-brand-teal"
        aria-hidden="true"
      />
      <div>
        <p className="font-semibold text-brand-ink">Acceso a todas las sedes</p>
        <p className="mt-0.5">
          Verá la agenda del día de cada sede y las fichas de los pacientes,
          incluidos sus datos de salud. Podrá actualizar el contacto de un
          paciente, pero no su información de salud.
        </p>
      </div>
    </div>
  );
};
