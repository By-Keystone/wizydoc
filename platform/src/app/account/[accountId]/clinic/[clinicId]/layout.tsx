import { Sidebar } from "@/components/common/sidebar";
import { AppProvider } from "@/context/app/app.context";
import { userMembershipsApi } from "@/lib/api/memberships";
import { usersApi } from "@/lib/api/user";
import { ReactNode } from "react";

export default async function ClinicLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ accountId: string; clinicId: string }>;
}) {
  const { clinicId } = await params;

  try {
    const [me, membership] = await Promise.all([
      usersApi.getMe(),
      userMembershipsApi.getMembershipForResource(clinicId),
    ]);

    return (
      <AppProvider membership={membership} user={me}>
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
  } catch (error) {
    console.error(error);

    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold">
            No se pudo cargar la clínica
          </h2>
          {error instanceof Error && <p>{error.message}</p>}
        </div>
      </div>
    );
  }
}
