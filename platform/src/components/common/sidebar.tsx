"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import logo from "@/images/logo.png";
import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState } from "react";
import { getNavLinks } from "./utils";
import { UserMenu } from "./user-menu";
import { useApp } from "@/context/app/app.context";
import { cn } from "@/lib/utils";
import { useParams, usePathname, useRouter } from "next/navigation";

export function Sidebar() {
  const { membership, user } = useApp();
  const params = useParams<{ accountId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const handleChangeResource = () => {
    router.push(`/account/${params.accountId}/select`);
    document.cookie = "resource_id=; path=/; max-age=0";
    document.cookie = "resource_type=; path=/; max-age=0";
  };

  const basePath = `/account/${params.accountId}/${lowerResourceType}/${resourceId}`;
  const dashboardHref = `${basePath}/dashboard`;
  const profileHref = `${basePath}/me`;

  // El drawer cierra al navegar; la sidebar de escritorio no tiene que cerrar
  // nada, así que el handler es opcional.
  const renderNavLinks = (onNavigate?: () => void) =>
    navLinks.map(({ href, label, icon: Icon }) => {
      const isActive = pathname.startsWith(`${basePath}/${href}`);

      return (
        <Link
          key={href}
          href={`${basePath}/${href}`}
          onClick={onNavigate}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            isActive
              ? "bg-brand-surface font-semibold text-brand-teal-dark"
              : "text-brand-gray hover:bg-gray-100 hover:text-brand-ink",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </Link>
      );
    });

  const renderUserMenu = (onNavigate?: () => void) => (
    <UserMenu
      user={user}
      placement="sidebar"
      subtitle={membership.resourceName}
      profileHref={profileHref}
      active={pathname === profileHref}
      onChangeResource={handleChangeResource}
      onNavigate={onNavigate}
    />
  );

  return (
    <>
      {/* Barra superior: sustituye al aside por debajo de `md`. */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 md:hidden">
        <Link href={dashboardHref} className="flex items-center gap-2">
          <Image src={logo} alt="WizyDoc" className="h-6 w-auto" />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-brand-gray hover:bg-gray-100"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 md:hidden" />

          {/*
            Dos decisiones para que se vean todas las opciones sin scroll:

            - `h-dvh` en lugar de `inset-y-0`. El borde inferior del viewport en
              móvil cae por debajo de la barra del navegador, así que anclar ahí
              deja fuera de la vista lo último del panel.
            - El contenido se apila arriba: ningún hijo lleva `flex-1`, de modo
              que nada se estira hasta el fondo. `overflow-y-auto` queda sólo
              como red de seguridad si algún día el menú crece mucho.
          */}
          <Dialog.Content
            aria-describedby={undefined}
            onEscapeKeyDown={(e) => {
              // Con el menú del avatar abierto, Escape cierra solo ese menú.
              if ((e.target as HTMLElement).closest('[role="menu"]'))
                e.preventDefault();
            }}
            className="fixed left-0 top-0 z-50 flex h-dvh w-72 max-w-[80%] flex-col gap-6 overflow-y-auto bg-white px-4 py-6 shadow-xl focus:outline-none md:hidden"
          >
            <Dialog.Title className="sr-only">Menú de navegación</Dialog.Title>

            <div className="flex items-center justify-between">
              <Link
                href={dashboardHref}
                className="flex items-center gap-2"
                onClick={() => setMobileOpen(false)}
              >
                <Image src={logo} alt="WizyDoc" className="h-7 w-auto" />
              </Link>
              <Dialog.Close
                className="rounded-lg p-1.5 text-brand-gray hover:bg-gray-100"
                aria-label="Cerrar menú"
              >
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>

            <nav className="flex flex-col gap-1">
              {renderNavLinks(() => setMobileOpen(false))}
            </nav>

            {/* `mt-auto` lo empuja al pie del panel. Es seguro porque el panel
                mide `h-dvh`: su fondo es el borde visible de la pantalla, no el
                del viewport, que quedaría tapado por la barra del navegador. */}
            <div className="mt-auto border-t border-gray-100 pt-4">
              {renderUserMenu(() => setMobileOpen(false))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Sidebar fija en escritorio */}
      <aside className="hidden w-60 flex-col border-r border-gray-200 bg-white px-4 py-6 md:flex">
        <Link
          href={dashboardHref}
          className="mb-8 flex items-center gap-2 px-2"
        >
          <Image src={logo} alt="WizyDoc" className="h-7 w-auto" />
        </Link>

        <nav className="flex flex-1 flex-col gap-1">{renderNavLinks()}</nav>

        <div className="border-t border-gray-100 pt-4">{renderUserMenu()}</div>
      </aside>
    </>
  );
}
