import { cn } from "@/lib/utils";

export const focusRingClassName =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function optionClassName(isChosen: boolean) {
  return cn(
    focusRingClassName,
    isChosen
      ? "border-brand-teal-dark bg-brand-teal-dark text-white"
      : "border-gray-200 bg-white text-brand-ink hover:bg-gray-50",
  );
}

export const unavailableOptionClassName =
  "cursor-not-allowed border-transparent text-gray-400";
