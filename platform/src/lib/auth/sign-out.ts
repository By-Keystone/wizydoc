"use client";

import type { useRouter } from "next/navigation";
import { authClient } from "./client";

export async function signOutAndClearResource(
  router: ReturnType<typeof useRouter>,
) {
  await authClient.signOut();
  // Cookies de app (no httpOnly): se limpian aquí; la de sesión la borra Better Auth.
  document.cookie = "resource_id=; path=/; max-age=0";
  document.cookie = "resource_type=; path=/; max-age=0";
  router.push("/login");
}
