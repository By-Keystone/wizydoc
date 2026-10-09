import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { getActiveResource } from "@/lib/auth/guards";
import { LoginForm } from "./login-form";

async function getSessionOrNullWhenThrottled() {
  try {
    return await getSession();
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) return null;
    throw error;
  }
}

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

  const session = await getSessionOrNullWhenThrottled();

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
