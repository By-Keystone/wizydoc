"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "../ui/button";
import { InviteOrganizationUserModal } from "./invite-user-modal";

interface Props {
  organizationId: string;
  organizationName: string;
}

export const OrganizationUsersTopHeader = ({
  organizationId,
  organizationName,
}: Props) => {
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-brand-teal-dark">Usuarios</h1>
        <p className="mt-1 text-sm text-brand-gray">
          Personas con acceso a todas las sedes de {organizationName}.
        </p>
      </div>
      <Button onClick={() => setInviteModalOpen(true)}>
        <UserPlus className="mr-2 h-4 w-4" />
        Invitar usuario
      </Button>
      <InviteOrganizationUserModal
        isOpen={inviteModalOpen}
        setIsOpen={setInviteModalOpen}
        organizationId={organizationId}
        organizationName={organizationName}
      />
    </div>
  );
};
