"use client";

import { ErrorState } from "@/components/common/error-state";

export default function AppointmentManageError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      message="No pudimos cargar tu cita. Vuelve a intentarlo."
      onRetry={reset}
    />
  );
}
