import type { Metadata } from "next";
import { PublicPageShell } from "@/components/common/public-page-shell";

// El token del enlace es la credencial: ni se indexa ni viaja en el Referer.
export const metadata: Metadata = {
  title: "Tu cita",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function AppointmentManageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PublicPageShell>{children}</PublicPageShell>;
}
