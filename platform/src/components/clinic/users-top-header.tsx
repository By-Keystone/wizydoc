"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "../ui/button";
import { InviteUserModal } from "./invite-user/modal";
import type { Specialty } from "@/lib/api/specialty/types";

interface Props {
  organizationId: string;
  organizationName: string;
  clinics: { id: string; name: string }[];
  fixedClinicId?: string;
  specialties: Specialty[];
  currentUserEmail?: string;
  subtitle?: string;
}

export const UsersTopHeader = ({ subtitle, ...modalProps }: Props) => {
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-brand-teal-dark">Usuarios</h1>
        {subtitle && <p className="mt-1 text-sm text-brand-gray">{subtitle}</p>}
      </div>
      <Button onClick={() => setInviteModalOpen(true)}>
        <UserPlus className="mr-2 h-4 w-4" />
        Invitar usuario
      </Button>
      <InviteUserModal
        isOpen={inviteModalOpen}
        setIsOpen={setInviteModalOpen}
        {...modalProps}
      />
    </div>
  );
};
