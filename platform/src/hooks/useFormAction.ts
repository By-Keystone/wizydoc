"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import type { ActionState, FieldErrors } from "@/lib/actions/types";

interface Options {
  /** Mensaje de éxito. Si se omite, se usa el `message` que devuelva la action. */
  successMessage?: string;
  /** Se ejecuta tras un resultado `success` (p. ej. cerrar el modal). */
  onSuccess?: () => void;
  /** Se ejecuta tras un resultado `error`, además de mostrar el toast. */
  onError?: (message: string) => void;
}

/**
 * Estandariza el envío de un formulario contra una server action:
 * ejecuta la action dentro de una transición, muestra el toast correcto según
 * el `status` devuelto y expone los `fieldErrors` para pintarlos junto a cada
 * campo.
 *
 * La action se pasa como una función que sólo recibe el `FormData`; si tu action
 * necesita más argumentos, envuélvela en un closure:
 *
 *   const { submit, isPending, fieldErrors } = useFormAction(
 *     (formData) => createClinicAction(resourceId, { status: "idle" }, formData),
 *     { successMessage: "Clínica creada", onSuccess: () => setIsOpen(false) },
 *   );
 */
export function useFormAction<Fields extends Record<string, unknown>>(
  action: (formData: FormData) => Promise<ActionState<Fields>>,
  options: Options = {},
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Fields>>();

  const submit = (formData: FormData) => {
    startTransition(async () => {
      setFieldErrors(undefined);
      const result = await action(formData);

      switch (result.status) {
        case "success": {
          const message = options.successMessage ?? result.message;
          if (message) toast.success(message);
          options.onSuccess?.();
          break;
        }
        case "error": {
          setFieldErrors(result.fieldErrors);
          toast.error(result.message);
          options.onError?.(result.message);
          break;
        }
        case "auth-expired": {
          toast.error("Tu sesión ha expirado. Vuelve a iniciar sesión.");
          router.push("/login");
          break;
        }
      }
    });
  };

  return { submit, isPending, fieldErrors };
}
