import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth/me";
import { getActiveResource } from "@/lib/auth/guards";

// El middleware ya manda a /login sin cookie de sesión; esto cubre lo que
// pasa una vez autenticado, ya que "/" no tiene contenido propio en esta app
// (el sitio de marketing vive aparte).
export default async function RootPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!me.onboardingCompleted || !me.accountId) redirect("/onboarding");

  const { resourceId, resourceType } = await getActiveResource();
  if (!resourceId || !resourceType) redirect(`/account/${me.accountId}/select`);

  redirect(
    `/account/${me.accountId}/${resourceType.toLowerCase()}/${resourceId}/dashboard`,
  );
}
