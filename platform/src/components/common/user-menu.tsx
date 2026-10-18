"use client";

import { signOutAndClearResource } from "@/lib/auth/sign-out";
import { cn } from "@/lib/utils";
import { ArrowLeftRight, ChevronDown, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { UserAvatar } from "./user-avatar";

interface Props {
  user: { name: string; lastName: string; email: string };
  profileHref: string;
  placement: "top" | "sidebar";
  subtitle?: string;
  active?: boolean;
  onChangeResource?: () => void;
  onNavigate?: () => void;
}

const getItems = (menu: HTMLElement | null) =>
  Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

const ITEM_CLASS =
  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-brand-ink transition-colors hover:bg-gray-100 focus-visible:bg-gray-100 focus-visible:outline-none";

export function UserMenu({
  user,
  profileHref,
  placement,
  subtitle,
  active,
  onChangeResource,
  onNavigate,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const fullName = `${user.name} ${user.lastName}`;
  const isTop = placement === "top";

  useEffect(() => {
    if (!open) return;
    getItems(menuRef.current)[0]?.focus();

    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

    e.preventDefault();
    const list = getItems(menuRef.current);
    const current = list.indexOf(document.activeElement as HTMLElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    list[(current + step + list.length) % list.length]?.focus();
  };

  const handleSelect = () => {
    setOpen(false);
    onNavigate?.();
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tu cuenta: ${fullName}`}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-full border border-transparent text-sm font-medium text-brand-ink transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isTop
            ? "py-1 pl-1 pr-2.5"
            : "w-full rounded-[10px] p-2 hover:bg-gray-100",
          open && (isTop ? "bg-gray-200" : "bg-gray-100"),
          active && "bg-brand-surface",
        )}
      >
        <UserAvatar name={user.name} lastName={user.lastName} />
        {isTop ? (
          <>
            <span className="max-w-32 truncate sm:hidden">{user.name}</span>
            <span className="hidden max-w-56 truncate sm:inline">
              {fullName}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-[13px] font-semibold">
              {fullName}
            </span>
            {subtitle && (
              <span className="block truncate text-xs font-normal text-brand-gray">
                {subtitle}
              </span>
            )}
          </span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-brand-gray" />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-30 rounded-[10px] border border-gray-200 bg-white p-1.5 shadow-xl",
            isTop
              ? "right-0 top-full mt-1 w-64 max-w-[calc(100vw-2rem)]"
              : "bottom-full left-0 right-0 mb-1.5",
          )}
        >
          <div className="mb-1 border-b border-gray-200 px-2.5 pb-2.5 pt-2">
            <p className="break-words text-sm font-semibold text-brand-ink">
              {fullName}
            </p>
            <p className="break-all text-[12.5px] text-brand-gray">
              {user.email}
            </p>
          </div>
          <div ref={menuRef} role="menu" onKeyDown={handleKeyDown}>
            <Link
              href={profileHref}
              role="menuitem"
              onClick={handleSelect}
              className={ITEM_CLASS}
            >
              <UserRound className="h-4 w-4 shrink-0 text-brand-gray" />
              Mi perfil
            </Link>
            {onChangeResource && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  handleSelect();
                  onChangeResource();
                }}
                className={ITEM_CLASS}
              >
                <ArrowLeftRight className="h-4 w-4 shrink-0 text-brand-gray" />
                Cambiar de sede
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                handleSelect();
                void signOutAndClearResource(router);
              }}
              className={cn(ITEM_CLASS, "text-red-700")}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
