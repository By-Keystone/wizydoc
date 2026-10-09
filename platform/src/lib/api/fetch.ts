import "server-only";

import { headers } from "next/headers";
import { ApiError, AuthExpiredError } from "./errors";
import { visitorHeaders } from "./visitor-headers";

const API_URL = process.env.API_URL;

// Cookie de sesión e IP del visitante: sin la IP, el límite de peticiones del api vería a todos como el servidor de Next.
export async function forwardedHeaders(): Promise<Record<string, string>> {
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";

  return {
    ...(cookie && { cookie }),
    ...visitorHeaders(incoming.get("x-forwarded-for")),
  };
}

/**
 * Llama al api reenviando la cookie de sesión de Better Auth (el api la valida
 * con `getSession`). Sustituye al antiguo header `Authorization: Bearer`.
 */
export async function doFetch(to: string, init?: RequestInit) {
  const response = await fetch(`${API_URL}${to}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(await forwardedHeaders()),
      ...init?.headers,
    },
  });

  if (response.status === 401) throw new AuthExpiredError();

  return response;
}

/**
 * Variante estándar para los clientes de `lib/api`: reenvía la cookie, valida
 * `res.ok` y devuelve el cuerpo ya parseado. Lanza `ApiError` (con el mensaje
 * que devuelva la API) ante cualquier respuesta no-ok. Tolera cuerpos vacíos
 * (p. ej. respuestas 201/204 de mutaciones).
 */
export async function doFetchJson<T = unknown>(
  to: string,
  init?: RequestInit,
): Promise<T> {
  const response = await doFetch(to, init);

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    // El backend a veces devuelve un objeto (p. ej. error de Prisma) en
    // `message`; solo lo usamos si es un string renderizable.
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : "Ha ocurrido un error";
    throw new ApiError(response.status, message);
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
