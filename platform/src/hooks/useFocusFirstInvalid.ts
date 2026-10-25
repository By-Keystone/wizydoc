"use client";

import { type RefObject, useEffect } from "react";

// `errors` debe ser un objeto nuevo en cada envío: con un string, repetir el mismo error no mueve el foco.
export function useFocusFirstInvalid(
  formRef: RefObject<HTMLFormElement>,
  errors: object | undefined,
) {
  useEffect(() => {
    if (!errors) return;
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [errors, formRef]);
}
