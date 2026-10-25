"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/common/error-state";
import { useRetry } from "@/hooks/useRetry";

/** Se renderiza dentro del layout de organización → conserva el sidebar. */
export default function OrganizationError({
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

  return <ErrorState onRetry={retry} />;
}
