export const UserRole = {
  ADMIN: "ADMIN",
  USER: "USER",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const MembershipRole = {
  ADMIN: "ADMIN",
  DOCTOR: "DOCTOR",
  USER: "USER",
};

export type MembershipRole =
  (typeof MembershipRole)[keyof typeof MembershipRole];
