import type { ReactNode } from "react";

interface Props {
  titleId: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
}

export function ProfileCard({
  titleId,
  title,
  description,
  action,
  children,
}: Props) {
  return (
    <section
      aria-labelledby={titleId}
      className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 sm:p-5"
    >
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="text-base font-semibold text-brand-teal-dark"
          >
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-[13px] leading-snug text-brand-gray">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
