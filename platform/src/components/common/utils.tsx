import { MembershipRole } from "@/lib/utils";
import {
  Building2Icon,
  LayoutDashboard,
  LucideProps,
  Settings,
  Tags,
} from "lucide-react";
import { ForwardRefExoticComponent, RefAttributes } from "react";

type NavLink = {
  href: string;
  label: string;
  icon: ForwardRefExoticComponent<
    Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>
  >;
  roles?: MembershipRole[];
};

const clinicNavLinks: NavLink[] = [
  {
    href: "dashboard",
    label: "Inicio",
    icon: LayoutDashboard,
  },
  {
    href: "profile",
    label: "Configuración",
    icon: Settings,
    roles: [MembershipRole.DOCTOR, MembershipRole.USER],
  },
];

const orgNavLinks: NavLink[] = [
  // { href: "users", label: "Usuarios", icon: UserRound },
  { href: "clinics", label: "Clínicas", icon: Building2Icon },
  { href: "specialties", label: "Especialidades", icon: Tags },
];

export function getNavLinks({
  role,
  resourceType,
}: {
  role: MembershipRole;
  resourceType: "ORGANIZATION" | "CLINIC";
}): NavLink[] {
  const base = resourceType === "ORGANIZATION" ? orgNavLinks : clinicNavLinks;

  return base.filter((link) =>
    !!link.roles ? link.roles.includes(role) : true,
  );
}
