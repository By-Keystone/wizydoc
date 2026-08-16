"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import logo from "@/images/logo.png";
import { FormEvent, useMemo } from "react";
import { getNavLinks } from "./utils";
import { authClient } from "@/lib/auth/client";
import { useApp } from "@/context/app/app.context";
import { useParams, useRouter } from "next/navigation";

export function Sidebar() {
  const { membership } = useApp();
  const params = useParams<{ accountId: string }>();
  const router = useRouter();

  const { resourceType, resourceId, role } = membership;

  const lowerResourceType = resourceType.toLowerCase();

  const navLinks = useMemo(
    () =>
      getNavLinks({
        role: role,
        resourceType: resourceType,
      }),
    [membership],
  );

  const handleSignOut = async (e: FormEvent) => {
    e.stopPropagation();
    await authClient.signOut();
    // Cookies de app (no httpOnly) — se limpian aquí; la de sesión la borra BA.
    document.cookie = "resource_id=; path=/; max-age=0";
    document.cookie = "resource_type=; path=/; max-age=0";
    router.push("/login");
  };
  return (
    <aside className="hidden md:flex w-60 flex-col border-r border-gray-200 bg-white px-4 py-6">
      <Link
        href={`/account/${params.accountId}/${lowerResourceType}/${resourceId}/dashboard`}
        className="flex items-center gap-2 px-2 mb-8"
      >
        <Image src={logo} alt="WizyDoc" className="h-7 w-auto" />
      </Link>

      <nav className="flex flex-col gap-1 flex-1">
        {navLinks.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={`/account/${params.accountId}/${lowerResourceType}/${resourceId}/${href}`}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-gray hover:bg-gray-100 hover:text-brand-ink transition-colors"
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-gray-100 pt-4">
        <p className="px-3 text-xs text-gray-400 truncate mb-2"></p>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-gray hover:bg-gray-100 hover:text-brand-ink transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
