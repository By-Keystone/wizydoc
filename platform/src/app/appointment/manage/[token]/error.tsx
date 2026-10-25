"use client";

import { ErrorState } from "@/components/common/error-state";
import { useRetry } from "@/hooks/useRetry";

export default function AppointmentManageError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const retry = useRetry(reset);

  return (
    <ErrorState
      message="No pudimos cargar tu cita. Vuelve a intentarlo."
      onRetry={retry}
    />
  );
}
