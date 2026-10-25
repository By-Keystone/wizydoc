"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/common/error-state";
import { useRetry } from "@/hooks/useRetry";

/** Boundary del wizard público de reserva. */
export default function CreateAppointmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const retry = useRetry(reset);

  return (
    <ErrorState
      message="No pudimos cargar la reserva. Vuelve a intentarlo."
      onRetry={retry}
    />
  );
}
