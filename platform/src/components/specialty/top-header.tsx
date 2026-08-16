"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { CreateSpecialtyModal } from "./create-modal";
import { useApp } from "@/context/app/app.context";
import { MembershipRole } from "@/lib/utils";

export const TopHeader = () => {
  const [modalCreateSpecialtyOpen, setModalCreateSpecialtyOpen] =
    useState<boolean>(false);
  const { membership } = useApp();
  const isAdmin = membership.role === MembershipRole.ADMIN;

  return (
    <div className="mb-6 flex justify-between items-center">
      <div>
        <h1 className="text-2xl font-bold text-brand-teal-dark">Especialidades</h1>
      </div>
      {isAdmin && (
        <>
          <Button onClick={() => setModalCreateSpecialtyOpen(true)}>
            Crear especialidad
          </Button>
          <CreateSpecialtyModal
            isOpen={modalCreateSpecialtyOpen}
            setIsOpen={setModalCreateSpecialtyOpen}
          />
        </>
      )}
    </div>
  );
};
