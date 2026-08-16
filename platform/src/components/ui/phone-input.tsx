"use client";

import { useRef, useState } from "react";
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

interface PhoneInputProps {
  name: string;
  id?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  defaultCountryCode?: string;
  className?: string;
}

export function PhoneInput({
  name,
  id,
  required,
  placeholder = "999 888 777",
  defaultValue = "",
  defaultCountryCode = "+52",
  className,
}: PhoneInputProps) {
  const [countryCode, setCountryCode] = useState(defaultCountryCode);
  const [number, setNumber] = useState(defaultValue);
  const hiddenRef = useRef<HTMLInputElement>(null);

  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode);

  const updateHiddenValue = (code: string, num: string) => {
    if (hiddenRef.current) {
      hiddenRef.current.value = num ? `${code}${num.replace(/\s/g, "")}` : "";
    }
  };

  return (
    <div className={cn("flex", className)}>
      <input type="hidden" ref={hiddenRef} name={name} />
      <select
        value={countryCode}
        onChange={(e) => {
          setCountryCode(e.target.value);
          updateHiddenValue(e.target.value, number);
        }}
        className="rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 px-2 py-2 text-sm outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
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
        value={number}
        required={required}
        placeholder={placeholder}
        onChange={(e) => {
          setNumber(e.target.value);
          updateHiddenValue(countryCode, e.target.value);
        }}
        className="flex-1 rounded-r-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
      />
    </div>
  );
}
