"use server";

import { ApiError } from "@/lib/api/errors";
import { doFetchJson } from "@/lib/api/fetch";
import { headers } from "next/headers";

// Las vistas previas y los buscadores que ejecutan JavaScript no son pacientes que quisieron reservar.
const PREVIEW_OR_CRAWLER_USER_AGENT =
  /bot\b|crawler|spider|slurp|facebookexternalhit|whatsapp|preview/i;

export async function recordMissedBookingAction(
  clinicId: string,
): Promise<void> {
  const userAgent = (await headers()).get("user-agent") ?? "";
  if (PREVIEW_OR_CRAWLER_USER_AGENT.test(userAgent)) return;

  try {
    // Con Content-Type JSON, Fastify rechaza un cuerpo vacío.
    await doFetchJson(`/clinic/${clinicId}/missed-bookings`, {
      method: "POST",
      body: "{}",
    });
  } catch (error) {
    // Contar la visita nunca debe romper la página del paciente.
    console.error("[record-missed-booking]", {
      clinicId,
      errName: error instanceof Error ? error.name : "UnknownError",
      status: error instanceof ApiError ? error.status : undefined,
    });
  }
}
