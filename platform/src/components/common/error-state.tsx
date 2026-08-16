"use client";

import { AlertTriangle } from "lucide-react";

interface Props {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

/**
 * UI estándar de error, pensada para los `error.tsx` de cada segmento. Como los
 * clientes de `lib/api` lanzan, cualquier fetch fallido en un server component
 * cae aquí en vez de mostrar la pantalla de error cruda de Next.
 */
export function ErrorState({
  title = "Algo salió mal",
  message = "No pudimos cargar esta sección. Vuelve a intentarlo.",
  onRetry,
}: Props) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
        <AlertTriangle className="h-7 w-7 text-red-500" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-brand-teal-dark">{title}</h2>
        <p className="mt-1 max-w-sm text-sm text-brand-gray">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-brand-gray transition hover:bg-gray-50"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
