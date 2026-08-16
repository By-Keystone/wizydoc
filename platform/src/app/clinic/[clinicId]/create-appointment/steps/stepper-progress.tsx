import { cn } from "@/lib/utils";

interface Props {
  currentStep: number;
  totalSteps: number;
}

export function StepperProgress({ currentStep, totalSteps }: Props) {
  return (
    <div className="mb-6 flex items-center gap-2">
      {Array.from({ length: totalSteps }, (_, index) => {
        const step = index + 1;
        const isActive = step <= currentStep;

        return (
          <div
            key={step}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              isActive ? "bg-brand-teal" : "bg-gray-200",
            )}
          />
        );
      })}
    </div>
  );
}
