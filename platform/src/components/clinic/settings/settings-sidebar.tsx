"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { CalendarClock, type LucideProps } from "lucide-react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import { cn } from "@/lib/utils";
import { useApp } from "@/context/app/app.context";

type SettingsLink = {
  /** Segmento relativo bajo `.../clinic/:clinicId/profile`. */
  segment: string;
  label: string;
  icon: ForwardRefExoticComponent<
    Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>
  >;
  requiresDoctorProfile?: boolean;
};

const settingsLinks: SettingsLink[] = [
  {
    segment: "availability",
    label: "Mi Disponibilidad",
    icon: CalendarClock,
    requiresDoctorProfile: true,
  },
];

export function SettingsSidebar() {
  const pathname = usePathname();
  const { membership } = useApp();
  const params = useParams<{ accountId: string; clinicId: string }>();

  const attends =
    membership.resourceType === "CLINIC" && membership.doctorProfileId !== null;

  const base = `/account/${params.accountId}/clinic/${params.clinicId}/profile`;

  return (
    // En móvil es una fila de pestañas sobre el contenido: los 224px fijos de
    // `w-56` dejarían el panel sin ancho utilizable en una pantalla pequeña.
    <aside className="w-full shrink-0 border-b border-gray-200 bg-white px-3 py-4 md:w-56 md:border-b-0 md:border-r md:py-6">
      <p className="mb-3 hidden px-3 text-xs font-semibold uppercase tracking-wide text-brand-gray md:block">
        Configuración
      </p>
      <nav className="flex gap-1 overflow-x-auto md:flex-col">
        {settingsLinks.map(
          ({ segment, label, icon: Icon, requiresDoctorProfile }) => {
            const href = `${base}/${segment}`;
            const isActive = pathname === href;
            const shouldRender = !requiresDoctorProfile || attends;
            return (
              shouldRender && (
                <Link
                  key={label}
                  href={href}
                  className={cn(
                    "flex shrink-0 items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-brand-teal/10 font-medium text-brand-teal"
                      : "text-brand-gray hover:bg-gray-100 hover:text-brand-ink",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              )
            );
          },
        )}
      </nav>
    </aside>
  );
}
