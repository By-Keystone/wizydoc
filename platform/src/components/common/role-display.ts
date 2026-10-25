import type { BadgeProps } from "@/components/ui/badge";

export const roleDisplay: Record<
  string,
  { label: string; variant: BadgeProps["variant"] }
> = {
  ADMIN: { label: "Administrador", variant: "teal" },
  DOCTOR: { label: "Médico", variant: "teal" },
  USER: { label: "Usuario", variant: "gray" },
};

export const roleLabel = (role: string) => roleDisplay[role]?.label ?? role;
