import "server-only";

import { headers } from "next/headers";
import { ApiError, AuthExpiredError } from "./errors";

const API_URL = process.env.API_URL;

/**
 * Llama al api reenviando la cookie de sesión de Better Auth (el api la valida
 * con `getSession`). Sustituye al antiguo header `Authorization: Bearer`.
 */
export async function doFetch(to: string, init?: RequestInit) {
  const cookie = (await headers()).get("cookie") ?? "";

  const response = await fetch(`${API_URL}${to}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(cookie && { cookie }),
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
