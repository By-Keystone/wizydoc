"use client";

import { Field } from "./field";
import { useState } from "react";

interface Props {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  placeholder?: string;
  error?: string;
}

export function PasswordInput({
  id,
  name,
  label,
  autoComplete,
  placeholder,
  error,
}: Props) {
  const [visible, setVisible] = useState(false);
  const action = visible ? "Ocultar" : "Mostrar";

  return (
    <Field label={label} htmlFor={id} error={error}>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`w-full rounded-lg border py-2 pl-3 pr-20 text-sm outline-none transition focus:ring-2 ${
            error
              ? "border-red-400 focus:border-red-500 focus:ring-red-100"
              : "border-gray-300 focus:border-brand-teal focus:ring-brand-teal/20"
          }`}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={`${action} ${label.toLowerCase()}`}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-xs font-semibold text-brand-teal"
        >
          {action}
        </button>
      </div>
    </Field>
  );
}
