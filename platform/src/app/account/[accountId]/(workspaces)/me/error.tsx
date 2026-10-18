"use client";

import { ErrorState } from "@/components/common/error-state";
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

  return <ErrorState onRetry={reset} />;
}
