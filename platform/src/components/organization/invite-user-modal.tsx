"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InviteUserForm } from "@/components/clinic/invite-user/form";
import { InheritedAccessNotice } from "./inherited-access-notice";
import { inviteOrganizationUserAction } from "@/lib/actions/organization/invite-organization-user.action";
import { lookupOrganizationUserByEmailAction } from "@/lib/actions/user/lookup-user-by-email.action";
import { useFormAction } from "@/hooks/useFormAction";

interface Props {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  organizationId: string;
  organizationName: string;
}

interface InviteOrganizationUserFields extends Record<string, unknown> {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
}

const FORM_ID = "invite-organization-user-form";

const ORGANIZATION_ROLE_OPTIONS = [
  { label: "Usuario", value: "USER" },
  { label: "Administrador", value: "ADMIN" },
];

export const InviteOrganizationUserModal = ({
  isOpen,
  setIsOpen,
  organizationId,
  organizationName,
}: Props) => {
  const { submit, isPending, fieldErrors } =
    useFormAction<InviteOrganizationUserFields>(
      (formData) =>
        inviteOrganizationUserAction(
          organizationId,
          { status: "idle" },
          formData,
        ),
      {
        successMessage: "Invitación enviada",
        onSuccess: () => setIsOpen(false),
      },
    );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent size="S">
        <DialogHeader>
          <DialogTitle>Invitar a la organización</DialogTitle>
          <DialogDescription>
            Tendrá acceso a todas las sedes de {organizationName}.
          </DialogDescription>
        </DialogHeader>
        <InviteUserForm
          key={isOpen ? "open" : "closed"}
          formId={FORM_ID}
          action={submit}
          organizationId={organizationId}
          roleOptions={ORGANIZATION_ROLE_OPTIONS}
          lookupUser={(email) =>
            lookupOrganizationUserByEmailAction(organizationId, email)
          }
          roleNotice={(role) => (
            <InheritedAccessNotice
              role={role === "ADMIN" ? "ADMIN" : "USER"}
              organizationName={organizationName}
            />
          )}
          fieldErrors={fieldErrors}
          isPending={isPending}
          onCancel={() => setIsOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
