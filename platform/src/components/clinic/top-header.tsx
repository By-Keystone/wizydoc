"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { CreateClinicModal } from "./modal";

export const TopHeader = () => {
  const [modalCreateClinicOpen, setModalCreateClinicOpen] =
    useState<boolean>(false);

  return (
    <div className="mb-6 flex justify-between items-center">
      <div>
        <h1 className="text-2xl font-bold text-brand-teal-dark">Sedes</h1>
      </div>
      <Button onClick={() => setModalCreateClinicOpen(true)}>
        Crear sede
      </Button>
      <CreateClinicModal
        isOpen={modalCreateClinicOpen}
        setIsOpen={setModalCreateClinicOpen}
      />
    </div>
  );
};
