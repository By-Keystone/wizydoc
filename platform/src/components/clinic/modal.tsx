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
import { CreateClinicForm } from "./create-clinic/form";
import { createClinicAction } from "@/lib/actions/clinic/create-clinic.action";
import { useFormAction } from "@/hooks/useFormAction";

interface Props {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
}

interface ClinicFields extends Record<string, unknown> {
  name: string;
  phone: string;
  address: string;
}

const FORM_ID = "create-clinic-form";

export const CreateClinicModal = ({ isOpen, setIsOpen }: Props) => {
  const { resourceId } = useParams<{ resourceId: string }>();

  const { submit, isPending, fieldErrors } = useFormAction<ClinicFields>(
    (formData) => createClinicAction(resourceId, { status: "idle" }, formData),
    {
      successMessage: "Sede creada",
      onSuccess: () => setIsOpen(false),
    },
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent size="S">
        <DialogHeader>
          <DialogTitle>Nueva sede</DialogTitle>
        </DialogHeader>
        <CreateClinicForm
          formId={FORM_ID}
          action={submit}
          fieldErrors={fieldErrors}
        />
        <DialogFooter>
          <Button form={FORM_ID} type="submit" disabled={isPending}>
            {isPending ? "Creando..." : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
