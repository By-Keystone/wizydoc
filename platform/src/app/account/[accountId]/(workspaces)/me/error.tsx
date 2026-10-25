"use client";

import { ErrorState } from "@/components/common/error-state";
import { useRetry } from "@/hooks/useRetry";
import { useEffect } from "react";

// Dentro del grupo `(workspaces)`: el error se ve debajo de la TopNav.
export default function MyProfileError({
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
