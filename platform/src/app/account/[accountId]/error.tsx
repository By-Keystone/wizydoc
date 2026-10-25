"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/common/error-state";
import { useRetry } from "@/hooks/useRetry";

/** Boundary del área autenticada (dashboard, clínicas, especialidades, etc.). */
export default function AccountError({
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
