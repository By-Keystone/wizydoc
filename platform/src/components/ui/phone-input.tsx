"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const COUNTRY_CODES = [
  { code: "+52", country: "MX", flag: "🇲🇽" },
  { code: "+1", country: "US", flag: "🇺🇸" },
  { code: "+51", country: "PE", flag: "🇵🇪" },
  { code: "+57", country: "CO", flag: "🇨🇴" },
  { code: "+56", country: "CL", flag: "🇨🇱" },
  { code: "+54", country: "AR", flag: "🇦🇷" },
  { code: "+34", country: "ES", flag: "🇪🇸" },
  { code: "+55", country: "BR", flag: "🇧🇷" },
  { code: "+593", country: "EC", flag: "🇪🇨" },
  { code: "+591", country: "BO", flag: "🇧🇴" },
  { code: "+595", country: "PY", flag: "🇵🇾" },
  { code: "+598", country: "UY", flag: "🇺🇾" },
  { code: "+58", country: "VE", flag: "🇻🇪" },
  { code: "+506", country: "CR", flag: "🇨🇷" },
  { code: "+503", country: "SV", flag: "🇸🇻" },
  { code: "+502", country: "GT", flag: "🇬🇹" },
  { code: "+504", country: "HN", flag: "🇭🇳" },
  { code: "+507", country: "PA", flag: "🇵🇦" },
] as const;

const compose = (code: string, number: string) => {
  const compact = number.replace(/\s/g, "");
  if (!compact) return "";
  // Un número que ya trae su código (+44…) no se vuelve a prefijar.
  return compact.startsWith("+") ? compact : `${code}${compact}`;
};

export function splitPhone(phone: string, fallbackCode: string) {
  const compact = phone.replace(/\s/g, "");
  const known = COUNTRY_CODES.filter((c) => compact.startsWith(c.code)).sort(
    (a, b) => b.code.length - a.code.length,
  )[0];

  if (!known) return { countryCode: fallbackCode, number: phone };

  return {
    countryCode: known.code as string,
    number: compact.slice(known.code.length),
  };
}

interface PhoneInputProps {
  name: string;
  id?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  defaultValue?: string;
  defaultCountryCode?: string;
  className?: string;
  disabled?: boolean;
  invalid?: boolean;
  "aria-describedby"?: string;
}

const FIELD_CLASSES =
  "border text-sm outline-none transition focus:ring-2 disabled:bg-gray-50 disabled:text-brand-ink";

export function PhoneInput({
  name,
  id,
  required,
  placeholder = "999 888 777",
  autoComplete,
  defaultValue = "",
  defaultCountryCode = "+52",
  className,
  disabled,
  invalid,
  "aria-describedby": describedBy,
}: PhoneInputProps) {
  const [countryCode, setCountryCode] = useState(defaultCountryCode);
  const [number, setNumber] = useState(defaultValue);

  const borderClasses = invalid
    ? "border-red-400 focus:border-red-500 focus:ring-red-100"
    : "border-gray-300 focus:border-brand-teal focus:ring-brand-teal/20";

  return (
    <div className={cn("flex", className)}>
      <input
        type="hidden"
        name={name}
        value={compose(countryCode, number)}
        readOnly
      />
      <select
        value={countryCode}
        aria-label="Código de país"
        disabled={disabled}
        onChange={(e) => setCountryCode(e.target.value)}
        className={cn(
          FIELD_CLASSES,
          borderClasses,
          "rounded-l-lg border-r-0 bg-gray-50 px-2 py-2",
        )}
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c.country} value={c.code}>
            {c.flag} {c.code}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        autoComplete={autoComplete}
        value={number}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => setNumber(e.target.value)}
        className={cn(
          FIELD_CLASSES,
          borderClasses,
          "min-w-0 flex-1 rounded-r-lg px-3 py-2",
        )}
      />
    </div>
  );
}
