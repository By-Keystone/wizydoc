import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export enum MembershipRole {
  ADMIN = "ADMIN",
  DOCTOR = "DOCTOR",
  USER = "USER",
}

export function formatList(items: string[]): string {
  return new Intl.ListFormat("es", { type: "conjunction" }).format(items);
}
