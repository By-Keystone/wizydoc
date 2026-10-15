import { PublicPageShell } from "@/components/common/public-page-shell";

export default function CreateAppointmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PublicPageShell>{children}</PublicPageShell>;
}
