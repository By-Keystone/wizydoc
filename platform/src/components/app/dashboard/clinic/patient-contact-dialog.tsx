"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Input } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useFormAction } from "@/hooks/useFormAction";
import {
  type UpdatePatientContactFields,
  updatePatientContactAction,
} from "@/lib/actions/clinic/update-patient-contact.action";
import { fieldError } from "@/lib/actions/types";
import { formatPatientContact } from "@/lib/patient-contact";

interface Props {
  clinicId: string;
  patientContact: string | null;
  trigger: ReactNode;
}

const FORM_ID = "patient-contact-form";
const FIELD_NAME = "patientContact";

export function PatientContactDialog({
  clinicId,
  patientContact,
  trigger,
}: Props) {
  const savedValue = patientContact ? formatPatientContact(patientContact) : "";
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(savedValue);
  const formRef = useRef<HTMLFormElement>(null);

  const { submit, isPending, fieldErrors } =
    useFormAction<UpdatePatientContactFields>(
      (formData) =>
        updatePatientContactAction(clinicId, { status: "idle" }, formData),
      { onSuccess: () => setIsOpen(false) },
    );

  // React vacía el formulario al terminar la acción: sin esto, un número inválido desaparecería junto a su error.
  const submitKeepingDraft = (formData: FormData) => {
    setDraft(String(formData.get(FIELD_NAME) ?? ""));
    submit(formData);
  };

  const handleOpenChange = (open: boolean) => {
    if (open) setDraft(savedValue);
    setIsOpen(open);
  };

  const error = fieldError(fieldErrors, FIELD_NAME);

  useEffect(() => {
    if (!fieldErrors?.[FIELD_NAME]) return;
    const field = formRef.current?.elements.namedItem(FIELD_NAME);
    if (field instanceof HTMLInputElement) field.focus();
  }, [fieldErrors]);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="S">
        <DialogHeader className="pr-8">
          <DialogTitle>Número para tus pacientes</DialogTitle>
          <DialogDescription>
            Lo verán tus pacientes cuando tu link no esté recibiendo reservas.
          </DialogDescription>
        </DialogHeader>
        <form id={FORM_ID} ref={formRef} action={submitKeepingDraft} noValidate>
          <Input
            label="WhatsApp o teléfono para pacientes"
            name={FIELD_NAME}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="987 654 321"
            value={draft}
            hint="Un celular de 9 dígitos o un fijo con su código, como (01) 234 5678. Si es un celular, tus pacientes también podrán escribirte por WhatsApp."
            error={error}
          />
        </form>
        <DialogFooter className="items-center justify-between sm:justify-between">
          {patientContact ? (
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => submit(new FormData())}
            >
              Quitar número
            </Button>
          ) : (
            <span />
          )}
          <Button form={FORM_ID} type="submit" disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
