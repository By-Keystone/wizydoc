"use client";

import { ErrorState } from "@/components/common/error-state";

export default function ManageAppointmentError({
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
