import { TriangleAlert } from "lucide-react";
import { PatientRecord } from "@/lib/api/patients/types";
import { calculateAge, formatDocument } from "./format";

const initials = (name: string, lastName: string) =>
  `${name.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

const chipClass =
  "rounded-full border border-gray-200 bg-brand-surface px-3 py-1 text-xs text-brand-gray";

/**
 * Una lista de alergias vacía no significa lo mismo según `allergiesReviewedAt`:
 * sin fecha nadie ha preguntado, y decir «sin alergias conocidas» ahí sería
 * afirmar algo que nadie ha comprobado.
 */
function AllergyChip({ patient }: { patient: PatientRecord }) {
  if (patient.allergies.length > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
        <TriangleAlert className="h-3.5 w-3.5" />
        Alergia: {patient.allergies.join(", ")}
      </span>
    );
  }

  if (patient.allergiesReviewedAt) {
    return <span className={chipClass}>Sin alergias conocidas</span>;
  }

  return (
    <span className="rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-brand-gray">
      Alergias sin registrar
    </span>
  );
}

export function PatientHeader({ patient }: { patient: PatientRecord }) {
  const age = calculateAge(patient.birthDate);

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-brand-teal-dark">
        {initials(patient.name, patient.lastName)}
      </div>

      <div>
        <h1 className="text-lg font-bold text-brand-ink">
          {patient.name} {patient.lastName}
        </h1>
        <p className="text-xs text-brand-gray">
          {formatDocument(patient.documentType, patient.documentNumber)} ·{" "}
          {patient.phone} · {patient.email}
        </p>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <AllergyChip patient={patient} />
        {age !== null && <span className={chipClass}>Edad {age}</span>}
        {patient.bloodType && (
          <span className={chipClass}>{patient.bloodType}</span>
        )}
      </div>
    </div>
  );
}
