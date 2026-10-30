import type { InputHTMLAttributes } from "react";
import { Field } from "./field";

interface Props
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "defaultValue"> {
  name: string;
  value?: string;
  label?: string;
  /** Ayuda que se pinta debajo del input y se enlaza con `aria-describedby`. */
  hint?: string;
  /** Mensaje de error de validación para este campo (se pinta debajo del input). */
  error?: string;
}

export const Input = ({
  name,
  value,
  label,
  hint,
  error,
  className,
  "aria-describedby": describedBy,
  ...rest
}: Props) => (
  <Field label={label} htmlFor={name} hint={hint} error={error}>
    <input
      type="text"
      id={name}
      name={name}
      defaultValue={value}
      aria-invalid={error ? true : undefined}
      aria-describedby={
        [
          describedBy,
          hint ? `${name}-hint` : undefined,
          error ? `${name}-error` : undefined,
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
      className={`rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 ${
        error
          ? "border-red-400 focus:border-red-500 focus:ring-red-100"
          : "border-gray-300 focus:border-brand-teal focus:ring-brand-teal/20"
      } ${className ?? ""}`}
      {...rest}
    />
  </Field>
);
