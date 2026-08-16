import { SelectHTMLAttributes } from "react";
import { Field } from "./field";

interface Option {
  label: string;
  value: string;
}

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  name: string;
  label?: string;
  error?: string;
  options: Option[];
}

export const Select = ({
  name,
  label,
  error,
  options,
  className,
  ...rest
}: Props) => (
  <Field label={label} htmlFor={name} error={error}>
    <select
      id={name}
      name={name}
      aria-invalid={error ? true : undefined}
      className={`rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 ${
        error
          ? "border-red-400 focus:border-red-500 focus:ring-red-100"
          : "border-gray-300 focus:border-brand-teal focus:ring-brand-teal/20"
      } ${className ?? ""}`}
      {...rest}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </Field>
);
