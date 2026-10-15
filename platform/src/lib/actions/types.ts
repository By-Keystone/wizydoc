/**
 * Tipos compartidos para el estado que devuelven las server actions.
 *
 * Todas las actions deberían devolver un `ActionState` para que el frontend
 * pueda consumirlas de forma uniforme (ver el hook `useFormAction`).
 */

/**
 * Errores por campo. Usa la forma que produce `treeifyError(...).properties`
 * de zod v4: `{ [campo]: { errors: string[] } }`.
 */
export type FieldErrors<Fields> = Partial<
  Record<keyof Fields, { errors: string[] } | undefined>
>;

export type ActionState<Fields = Record<string, unknown>> =
  | { status: "idle" }
  | { status: "success"; message?: string }
  | {
      status: "error";
      message: string;
      code?: string;
      fieldErrors?: FieldErrors<Fields>;
    }
  | { status: "auth-expired" };

export type ActionFailure = Exclude<
  ActionState,
  { status: "success" } | { status: "idle" }
>;

export type DataActionState<Data> =
  | { status: "success"; data: Data }
  | ActionFailure;

/** Devuelve el primer error de un campo, o `undefined` si no hay. */
export function fieldError<Fields>(
  errors: FieldErrors<Fields> | undefined,
  field: keyof Fields,
): string | undefined {
  return errors?.[field]?.errors?.[0];
}
