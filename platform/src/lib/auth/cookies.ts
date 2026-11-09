/**
 * Cookies propias de la aplicación (la sesión la gestiona Better Auth con su
 * propia cookie `better-auth.session_token`).
 */
export const COOKIE_NAMES = {
  resourceId: "resource_id",
  resourceType: "resource_type",
  signUpProgress: "sign_up_progress",
} as const;
