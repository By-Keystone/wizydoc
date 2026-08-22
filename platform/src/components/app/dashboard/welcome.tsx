"use client";

import { useApp } from "@/context/app/app.context";

export function Welcome() {
  const { user, membership } = useApp();

  const name =
    !!user.name && !!user.lastName
      ? `${user.name} ${user.lastName}`
      : user.email;

  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold text-brand-teal-dark">Hola {name} 👋</h1>
      <p className="mt-1 text-sm text-brand-gray">
        Bienvenido a tu panel de {membership.resourceName}
      </p>
    </div>
  );
}
