import "server-only";

import { ApiError } from "@/lib/api/errors";
import { headers } from "next/headers";
import z from "zod";

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

async function post(path: string, body: object): Promise<Response> {
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
  return response;
}

const verifyCodeResponseSchema = z.object({ verificationToken: z.string() });

export const signUpApi = {
  requestCode: (email: string) => post("/api/auth/sign-up/code", { email }),
  verifyCode: async (email: string, code: string): Promise<string> => {
    const response = await post("/api/auth/sign-up/code/verify", {
      email,
      code,
    });
    return verifyCodeResponseSchema.parse(await response.json())
      .verificationToken;
  },
};
