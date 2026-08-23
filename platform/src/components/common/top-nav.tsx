"use client";

import { LogOut } from "lucide-react";
import Image from "next/image";
import logo from "@/images/logo.png";
import { authClient } from "@/lib/auth/client";
import { useRouter } from "next/navigation";

export const TopNav = () => {
  const router = useRouter();

  const handleSignOut = async () => {
    await authClient.signOut();
    // Cookies de app (no httpOnly) — se limpian aquí; la de sesión la borra BA.
    document.cookie = "resource_id=; path=/; max-age=0";
    document.cookie = "resource_type=; path=/; max-age=0";
    router.push("/login");
  };

  return (
    <div className="flex w-full items-center justify-between gap-x-2 bg-gray-100 px-4 py-4 shadow-lg rounded-b-md">
      <Image src={logo} alt="WizyDoc" className="h-10 w-auto" />
      <button
        type="button"
        onClick={handleSignOut}
        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-brand-gray transition-colors hover:bg-gray-200 hover:text-brand-ink"
      >
        <LogOut className="h-4 w-4 shrink-0" />
        Cerrar sesión
      </button>
    </div>
  );
};
