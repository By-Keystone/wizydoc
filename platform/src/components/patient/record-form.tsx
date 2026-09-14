"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Select } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/app/app.context";
import { useFormAction } from "@/hooks/useFormAction";
import { MembershipRole } from "@/lib/utils";
import {
  updatePatientRecordAction,
  UpdatePatientRecordFields,
} from "@/lib/actions/patient/update-patient-record.action";
import { fieldError } from "@/lib/actions/types";
import { PatientRecord } from "@/lib/api/patients/types";
import { AllergiesInput } from "./allergies-input";
import { EMPTY, formatDocument } from "./format";

interface Props {
  patient: PatientRecord;
}

const SEX_OPTIONS = [
  { value: "", label: "Sin especificar" },
  { value: "Femenino", label: "Femenino" },
  { value: "Masculino", label: "Masculino" },
  { value: "Otro", label: "Otro" },
];

function FieldsetTitle({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-brand-gray">
        {children}
      </span>
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-brand-gray">{label}</span>
      <div className="rounded-lg border border-gray-200 bg-brand-surface px-3 py-2 text-sm text-brand-ink">
        {value || EMPTY}
      </div>
    </div>
  );
}

export function RecordForm({ patient }: Props) {
  const router = useRouter();
  const { membership } = useApp();
  // El api vuelve a comprobarlo, y con más contexto: mira si el usuario tiene
  // alguna membership sanitaria en la cuenta, no solo en esta sede. Ocultar el
  // campo aquí es cosmético.
  const canEditHealthData =
    membership.role === MembershipRole.ADMIN ||
    membership.role === MembershipRole.DOCTOR;

  const [editing, setEditing] = useState(false);
  // Remonta el formulario al cancelar, para que los inputs vuelvan a su valor.
  const [revision, setRevision] = useState(0);

  const { submit, isPending, fieldErrors } =
    useFormAction<UpdatePatientRecordFields>(
      (formData) =>
        updatePatientRecordAction(patient.id, { status: "idle" }, formData),
      {
        successMessage: "Ficha actualizada",
        onSuccess: () => {
          setEditing(false);
          // `revalidateTag` invalida la caché, pero sin esto la cabecera seguiría
          // pintando la alergia y el grupo sanguíneo del render anterior.
          router.refresh();
        },
      },
    );

  const cancel = () => {
    setEditing(false);
    setRevision((current) => current + 1);
  };

  const disabled = !editing;

  return (
    <form
      key={revision}
      action={submit}
      className="flex flex-col gap-5 rounded-xl border border-gray-200 bg-white p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        {editing && (
          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-teal">
            Editando
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {!editing && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(true)}
            >
              Editar ficha
            </Button>
          )}
          {editing && (
            <>
              <Button type="button" variant="outline" onClick={cancel}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Guardando..." : "Guardar cambios"}
              </Button>
            </>
          )}
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <FieldsetTitle>Identificación</FieldsetTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label="Nombre"
            name="name"
            value={patient.name}
            disabled={disabled}
            error={fieldError(fieldErrors, "name")}
          />
          <Input
            label="Apellido"
            name="lastName"
            value={patient.lastName}
            disabled={disabled}
            error={fieldError(fieldErrors, "lastName")}
          />
          {/* El documento identifica al paciente dentro de la cuenta: cambiarlo
              aquí sería fusionarlo con otro o partirlo en dos. */}
          <ReadOnlyField
            label="Documento"
            value={formatDocument(patient.documentType, patient.documentNumber)}
          />
          <Input
            label="Fecha de nacimiento"
            name="birthDate"
            type="date"
            value={patient.birthDate ?? ""}
            disabled={disabled}
            error={fieldError(fieldErrors, "birthDate")}
          />
          <Select
            label="Sexo"
            name="sex"
            options={SEX_OPTIONS}
            defaultValue={patient.sex ?? ""}
            disabled={disabled}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <FieldsetTitle>Contacto</FieldsetTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label="Teléfono"
            name="phone"
            type="tel"
            value={patient.phone}
            disabled={disabled}
            error={fieldError(fieldErrors, "phone")}
          />
          <Input
            label="Email"
            name="email"
            type="email"
            value={patient.email}
            disabled={disabled}
            error={fieldError(fieldErrors, "email")}
          />
          <Input
            label="Contacto de emergencia"
            name="emergencyContact"
            value={patient.emergencyContact ?? ""}
            disabled={disabled}
          />
          <Input
            label="Aseguradora"
            name="insurer"
            value={patient.insurer ?? ""}
            disabled={disabled}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <FieldsetTitle>Datos de salud</FieldsetTitle>

        {canEditHealthData ? (
          <>
            {/* Marca para la action: sin esto los campos de salud no se envían. */}
            <input type="hidden" name="healthEditable" value="1" />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                label="Grupo sanguíneo"
                name="bloodType"
                value={patient.bloodType ?? ""}
                disabled={disabled}
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-brand-gray">
                Alergias
              </span>
              <AllergiesInput
                initial={patient.allergies}
                disabled={disabled}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-brand-gray">
              <input
                type="checkbox"
                name="allergiesReviewed"
                defaultChecked={patient.allergiesReviewedAt !== null}
                disabled={disabled}
                className="h-4 w-4 rounded border-gray-300 accent-brand-teal"
              />
              Sin alergias conocidas — marcar solo si se le ha preguntado al
              paciente
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Antecedentes"
                name="background"
                value={patient.background ?? ""}
                disabled={disabled}
              />
              <Input
                label="Medicación habitual"
                name="medications"
                value={patient.medications ?? ""}
                disabled={disabled}
              />
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ReadOnlyField
                label="Grupo sanguíneo"
                value={patient.bloodType}
              />
              <ReadOnlyField
                label="Alergias"
                value={patient.allergies.join(", ")}
              />
              <ReadOnlyField label="Antecedentes" value={patient.background} />
              <ReadOnlyField
                label="Medicación habitual"
                value={patient.medications}
              />
            </div>
            <p className="text-xs text-brand-gray">
              Los datos de salud solo los edita personal sanitario.
            </p>
          </>
        )}
      </fieldset>

      <p className="text-xs text-brand-gray">
        Hechos estables del paciente, no narrativa clínica. No se sobrescriben
        con lo que el paciente escriba al reservar.
      </p>
    </form>
  );
}
