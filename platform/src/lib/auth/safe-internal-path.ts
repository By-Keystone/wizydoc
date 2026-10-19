// Solo rutas internas: el navegador trata "/\evil.com" como "//evil.com", así que
// se rechaza la barra invertida y se comprueba que el origen no cambie.
const PLACEHOLDER_ORIGIN = "http://internal.invalid";

export function safeInternalPath(path?: string | null): string | null {
  if (!path?.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return null;
  }

  try {
    return new URL(path, PLACEHOLDER_ORIGIN).origin === PLACEHOLDER_ORIGIN
      ? path
      : null;
  } catch {
    return null;
  }
}
