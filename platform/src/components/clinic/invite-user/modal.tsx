"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InviteUserForm } from "./form";
import { inviteOrganizationUserAction } from "@/lib/actions/organization/invite-organization-user.action";
import { inviteUserAction } from "@/lib/actions/user/invite-user.action";
import type { Specialty } from "@/lib/api/specialty/types";
import { useFormAction } from "@/hooks/useFormAction";
import { toast } from "@/lib/toast";

interface Props {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  organizationId: string;
  organizationName: string;
  clinics: { id: string; name: string }[];
  fixedClinicId?: string;
  specialties: Specialty[];
  currentUserEmail?: string;
}

interface InviteUserFields extends Record<string, unknown> {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  specialtyIds: string[];
  clinicIds: string[];
}

const FORM_ID = "invite-user-form";

export const InviteUserModal = ({
  isOpen,
  setIsOpen,
  organizationId,
  organizationName,
  clinics,
  fixedClinicId,
  specialties,
  currentUserEmail,
}: Props) => {
  const [submittedToClinic, setSubmittedToClinic] = useState(false);

  const organizationForm = useFormAction<InviteUserFields>(
    (formData) =>
      inviteOrganizationUserAction(
        organizationId,
        { status: "idle" },
        formData,
      ),
    { onSuccess: () => setIsOpen(false) },
  );

  const clinicForm = useFormAction<InviteUserFields>(
    (formData) =>
      inviteUserAction(organizationId, { status: "idle" }, formData),
    { onSuccess: () => setIsOpen(false) },
  );

  const submit = (
    scope: { clinicIds: string[] | null },
    formData: FormData,
  ) => {
    setSubmittedToClinic(scope.clinicIds !== null);
    if (!scope.clinicIds) {
      organizationForm.submit(formData);
      return;
    }

    if (
      formData.get("role") === "DOCTOR" &&
      formData.getAll("specialtyIds").length === 0
    ) {
      toast.error("Selecciona al menos una especialidad");
      return;
    }
    clinicForm.submit(formData);
  };

  const fixedClinicName = clinics.find(
    (clinic) => clinic.id === fixedClinicId,
  )?.name;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent
        size="S"
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
          <DialogDescription>
            {fixedClinicId
              ? `Dale acceso a ${fixedClinicName}.`
              : `Dale acceso a todas las sedes de ${organizationName} o a las sedes que elijas.`}
          </DialogDescription>
        </DialogHeader>
        <InviteUserForm
          key={isOpen ? "open" : "closed"}
          formId={FORM_ID}
          organizationId={organizationId}
          organizationName={organizationName}
          clinics={clinics}
          fixedClinicId={fixedClinicId}
          specialties={specialties}
          currentUserEmail={currentUserEmail}
          onSubmit={submit}
          fieldErrors={
            submittedToClinic
              ? clinicForm.fieldErrors
              : organizationForm.fieldErrors
          }
          isPending={organizationForm.isPending || clinicForm.isPending}
          onCancel={() => setIsOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
