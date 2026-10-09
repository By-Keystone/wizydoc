import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveResource } from "@/lib/auth/guards";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const callback =
    callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : null;

  const session = await getSession();

  // Ya autenticado: no mostrar el formulario, redirigir a donde corresponda.
  if (session) {
    const { accountId } = session.user;

    if (!accountId) redirect("/onboarding");

    if (callback) redirect(callback);

    const { resourceId, resourceType } = await getActiveResource();

    if (resourceId && resourceType) {
      redirect(
        `/account/${accountId}/${resourceType.toLowerCase()}/${resourceId}`,
      );
    }

    redirect(`/account/${accountId}/select`);
  }

  return <LoginForm callbackUrl={callbackUrl} />;
}
