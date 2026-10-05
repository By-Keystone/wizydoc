"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useParams } from "next/navigation";
import { SpecialtyBaseForm } from "./base-form";
import { updateSpecialtyAction } from "@/lib/actions/specialty/update-specialty.action";
import type { Specialty } from "@/lib/api/specialty/types";
import { useFormAction } from "@/hooks/useFormAction";

interface Props {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  specialty: Specialty;
}

interface SpecialtyFields extends Record<string, unknown> {
  name: string;
}

const FORM_ID = "edit-specialty-form";

export const EditSpecialtyModal = ({ isOpen, setIsOpen, specialty }: Props) => {
  const { resourceId } = useParams<{ resourceId: string }>();

  const { submit, isPending, fieldErrors } = useFormAction<SpecialtyFields>(
    (formData) =>
      updateSpecialtyAction(
        resourceId,
        specialty.id,
        { status: "idle" },
        formData,
      ),
    {
      successMessage: "Especialidad actualizada",
      onSuccess: () => setIsOpen(false),
    },
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent size="S">
        <DialogHeader>
          <DialogTitle>Editar especialidad</DialogTitle>
        </DialogHeader>
        <SpecialtyBaseForm
          formId={FORM_ID}
          action={submit}
          specialty={specialty}
          fieldErrors={fieldErrors}
        />
        <DialogFooter>
          <Button form={FORM_ID} type="submit" disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
