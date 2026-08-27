import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = [
  "/register",
  "/login",
  "/confirm-email",
  "/invite/accept",
];

// Rutas públicas con segmentos dinámicos, que no calzan con match exacto.
const PUBLIC_PATH_PATTERNS = [
  /^\/clinic\/[^/]+\/create-appointment$/,
  // Rewrite de /invite/accept hacia el api (ver next.config.ts): el propio
  // flujo de invitación llama estos endpoints antes de que exista sesión.
  /^\/api\/invitations(\/|$)/,
];

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PATH_PATTERNS.some((pattern) => pattern.test(pathname))
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Chequeo optimista: solo verifica la presencia de la cookie de sesión de
  // Better Auth (sin llamar a la BD). La validación real —sesión válida,
  // onboarding, recurso activo— ocurre en los layouts/páginas.
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
