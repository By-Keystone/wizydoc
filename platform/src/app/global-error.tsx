"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/common/error-state";

/**
 * Boundary raíz: captura errores del root layout. Debe renderizar su propio
 * <html>/<body> porque reemplaza al layout global.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // Next no le pasa `reset` a este boundary en desarrollo: se recarga la página.
  const reload = () => window.location.reload();

  return (
    <html lang="es">
      <body>
        <ErrorState
          message="Ocurrió un error inesperado. Vuelve a intentarlo."
          onRetry={reload}
        />
      </body>
    </html>
  );
}
