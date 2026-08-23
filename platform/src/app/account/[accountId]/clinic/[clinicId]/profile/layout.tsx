import { ReactNode } from "react";
import { SettingsSidebar } from "@/components/clinic/settings/settings-sidebar";

export default function ClinicSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    // Los márgenes negativos cancelan el padding del `<main>` para que el menú
    // de ajustes llegue a los bordes, así que deben seguir su misma escala.
    <div className="-m-4 flex min-h-full flex-col sm:-m-6 md:-m-8 md:flex-row">
      <SettingsSidebar />
      <div className="flex-1 p-4 sm:p-6 md:p-8">{children}</div>
    </div>
  );
}
