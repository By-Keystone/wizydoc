"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * Toaster global de la aplicación. Se monta una sola vez en el root layout.
 * Centraliza posición y estilo para que todos los toasts sean consistentes.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "rounded-lg text-sm",
        },
      }}
    />
  );
}
