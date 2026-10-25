import { Sidebar } from "@/components/common/sidebar";
import { AppProvider } from "@/context/app/app.context";
import { getActiveResource } from "@/lib/auth/guards";
import { loadWorkspace } from "@/lib/auth/load-workspace";
import { switchWorkspacePath } from "@/lib/auth/workspace-paths";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ accountId: string }>;
}) {
  const { resourceId, resourceType } = await getActiveResource();
  const { accountId } = await params;

  if (!resourceId || !resourceType) redirect(switchWorkspacePath(accountId));

  const { user, membership } = await loadWorkspace({
    accountId,
    resourceId,
    resourceType: "organization",
  });

  return (
    <AppProvider membership={membership} user={user}>
      {/* En móvil se apila (barra superior sobre el contenido); a partir de
          `md` vuelve a ser sidebar + contenido en fila. `min-h-dvh` en vez de
          `min-h-screen` porque `100vh` incluye la franja que tapa la barra
          del navegador. */}
      <div className="flex min-h-dvh flex-col bg-gray-50 md:flex-row">
        <Sidebar />
        <main className="relative flex-1 p-4 sm:p-6 md:p-8">{children}</main>
      </div>
    </AppProvider>
  );
}
