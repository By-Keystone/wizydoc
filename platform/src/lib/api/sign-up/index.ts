import "server-only";

import { ApiError } from "@/lib/api/errors";
import { headers } from "next/headers";

const FORWARDED_HEADERS = ["x-real-ip", "user-agent"];

async function forwardedHeaders(): Promise<Record<string, string>> {
  const incoming = await headers();
  const forwarded: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const headerValue = incoming.get(name);
    if (headerValue) forwarded[name] = headerValue;
  }
  return forwarded;
}

async function post(path: string, body: object): Promise<void> {
  const response = await fetch(`${process.env.BACKEND_API_URL}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.BACKEND_API_KEY ?? "",
      ...(await forwardedHeaders()),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = typeof payload?.message === "string" ? payload.message : "";
    throw new ApiError(response.status, message);
  }
}

export const signUpApi = {
  requestCode: (email: string) => post("/api/auth/sign-up/code", { email }),
};
