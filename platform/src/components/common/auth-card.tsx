import type { LucideIcon } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

export const TEXT_LINK_CLASS =
  "inline-flex min-h-10 items-center text-sm font-medium text-brand-teal hover:text-brand-teal-dark";

const ICON_TONES = {
  brand: { tile: "bg-brand-teal/10", glyph: "text-brand-teal" },
  danger: { tile: "bg-red-100", glyph: "text-red-500" },
} as const;

interface AuthCardProps {
  title?: string;
  description?: ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof ICON_TONES;
  titleRef?: Ref<HTMLHeadingElement>;
  footer?: ReactNode;
  children?: ReactNode;
}

export function AuthCard({
  title,
  description,
  icon: Icon,
  tone = "brand",
  titleRef,
  footer,
  children,
}: AuthCardProps) {
  const isMessage = Boolean(Icon);
  const iconTone = ICON_TONES[tone];

  return (
    <div
      className={cn(
        "w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl sm:p-8",
        isMessage && "text-center",
      )}
    >
      {Icon && (
        <div
          className={cn(
            "mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl",
            iconTone.tile,
          )}
        >
          <Icon className={cn("h-7 w-7", iconTone.glyph)} />
        </div>
      )}
      {title && (
        <div className={isMessage ? undefined : "mb-8"}>
          <h1
            ref={titleRef}
            tabIndex={-1}
            className="text-2xl font-bold text-brand-teal-dark focus:outline-none"
          >
            {title}
          </h1>
          {description && (
            <p
              className={cn(
                "text-sm text-brand-gray",
                isMessage ? "mt-2" : "mt-1",
              )}
            >
              {description}
            </p>
          )}
        </div>
      )}
      {children}
      {footer && (
        <p className="mt-6 text-center text-sm text-brand-gray">{footer}</p>
      )}
    </div>
  );
}
