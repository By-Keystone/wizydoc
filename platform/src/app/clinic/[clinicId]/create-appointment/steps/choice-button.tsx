import { Check } from "lucide-react";
import { optionClassName } from "@/components/booking/option-styles";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  isChosen: boolean;
  onClick: () => void;
}

export function ChoiceButton({ label, isChosen, onClick }: Props) {
  return (
    <button
      type="button"
      aria-pressed={isChosen}
      onClick={onClick}
      className={cn(
        "flex min-h-12 min-w-0 items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
        optionClassName(isChosen),
      )}
    >
      <span className="min-w-0 break-words">{label}</span>
      {isChosen && <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}
    </button>
  );
}
