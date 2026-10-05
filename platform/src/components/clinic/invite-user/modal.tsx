"use client";

import { useParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InviteUserForm } from "./form";
import { inviteUserAction } from "@/lib/actions/user/invite-user.action";
import { Specialty } from "@/lib/api/specialty/types";
import { useFormAction } from "@/hooks/useFormAction";
import { toast } from "@/lib/toast";

interface Props {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  specialties: Specialty[];
}

interface InviteUserFields extends Record<string, unknown> {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  specialtyIds: string[];
}

const FORM_ID = "invite-user-form";

export const InviteUserModal = ({ isOpen, setIsOpen, specialties }: Props) => {
  const { resourceId, clinicId } = useParams<{
    resourceId: string;
    clinicId: string;
  }>();

  const {
    submit: runInvite,
    isPending,
    fieldErrors,
  } = useFormAction<InviteUserFields>(
    (formData) => inviteUserAction(clinicId, { status: "idle" }, formData),
    {
      successMessage: "Invitación enviada",
      onSuccess: () => setIsOpen(false),
    },
  );

  const submit = (formData: FormData) => {
    const role = formData.get("role");
    const specialtyIds = formData.getAll("specialtyIds");
    if (role === "DOCTOR" && specialtyIds.length === 0) {
      toast.error("Selecciona al menos una especialidad");
      return;
    }
    runInvite(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent size="S">
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
        </DialogHeader>
        <InviteUserForm
          key={isOpen ? "open" : "closed"}
          formId={FORM_ID}
          action={submit}
          organizationId={resourceId}
          clinicId={clinicId}
          specialties={specialties}
          fieldErrors={fieldErrors}
          isPending={isPending}
          onCancel={() => setIsOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
