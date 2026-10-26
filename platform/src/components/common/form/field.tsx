import type { ReactNode } from "react";
import { Label } from "./label";

interface Props {
  /** Texto del label (opcional). */
  label?: string;
  /** `id` del control al que apunta el label. */
  htmlFor?: string;
  /** Ayuda que se pinta debajo del control, antes del error. */
  hint?: string;
  /** Mensaje de error de validación; se pinta debajo del control. */
  error?: string;
  children: ReactNode;
}

/**
 * Envoltorio estándar de un campo: label + control + error, con el espaciado
 * consistente. Las primitivas `Input`/`Select` lo usan por dentro, así que un
 * formulario normal no necesita instanciarlo a mano.
 */
export const Field = ({ label, htmlFor, hint, error, children }: Props) => (
  <div className="flex flex-col gap-y-1.5">
    {label && <Label htmlFor={htmlFor}>{label}</Label>}
    {children}
    {hint && (
      <p
        id={htmlFor ? `${htmlFor}-hint` : undefined}
        className="text-xs text-brand-gray"
      >
        {hint}
      </p>
    )}
    {error && (
      <p
        id={htmlFor ? `${htmlFor}-error` : undefined}
        className="text-xs text-red-700"
        role="alert"
      >
        {error}
      </p>
    )}
  </div>
);
