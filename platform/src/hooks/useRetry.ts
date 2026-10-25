"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";

// `reset()` solo vuelve a pintar el error que ya llegó; `refresh()` pide de nuevo los datos al servidor.
export function useRetry(reset: () => void) {
  const router = useRouter();

  return () => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  };
}
