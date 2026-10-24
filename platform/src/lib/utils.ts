import { config } from "@/config";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export enum UserRole {
  ADMIN = "ADMIN",
  USER = "USER",
}

export enum DocumentType {
  DNI = "DNI",
}

export enum MembershipRole {
  ADMIN = "ADMIN",
  DOCTOR = "DOCTOR",
  USER = "USER",
}
export const DOCUMENT_TYPES = Object.values(DocumentType);

export const getSettings = () => {
  const env = process.env.NODE_ENV;

  return config[env];
};

export function formatList(items: string[]): string {
  return new Intl.ListFormat("es", { type: "conjunction" }).format(items);
}
