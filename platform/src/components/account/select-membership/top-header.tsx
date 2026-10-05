"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { CreateOrganizationModal } from "./create-organization/modal";

interface TopHeaderProps {
  canCreateOrganization: boolean;
}

export function TopHeader({ canCreateOrganization }: TopHeaderProps) {
  const [modalCreateOrganizationOpen, setModalCreateOrganizationOpen] =
    useState<boolean>(false);

  if (!canCreateOrganization) return null;

  return (
    <div className="text-right">
      <Button onClick={() => setModalCreateOrganizationOpen(true)}>
        Crear organización
      </Button>
      <CreateOrganizationModal
        isOpen={modalCreateOrganizationOpen}
        setIsOpen={setModalCreateOrganizationOpen}
      />
    </div>
  );
}
