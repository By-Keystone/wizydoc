"use client";

import logo from "@/images/logo.png";
import type { Me } from "@/lib/auth/me";
import Image from "next/image";
import { useParams } from "next/navigation";
import { UserMenu } from "./user-menu";

export const TopNav = ({ user }: { user: Me }) => {
  const { accountId } = useParams<{ accountId: string }>();

  return (
    <div className="flex w-full items-center justify-between gap-x-2 rounded-b-md bg-gray-100 px-4 py-4 shadow-lg">
      {/* Más bajo en el celular: a 40 px de alto el logo ocupa ~165 px y, con
          un nombre largo junto al avatar, la barra desborda a 375 px. */}
      <Image src={logo} alt="WizyDoc" className="h-8 w-auto shrink-0 sm:h-10" />
      <UserMenu
        user={user}
        placement="top"
        profileHref={`/account/${accountId}/me`}
      />
    </div>
  );
};
