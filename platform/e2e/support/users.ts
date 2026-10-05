import { randomUUID } from "node:crypto";
import type { APIRequestContext, APIResponse } from "@playwright/test";
import { API_BASE_URL, PLATFORM_BASE_URL } from "./env";
import { getTestPrisma } from "./db";

export const E2E_PASSWORD = "Clave-Segura-2026";

const SESSION_COOKIE_NAME = "better-auth.session_token";

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${randomUUID().slice(0, 8)}@e2e.wizydoc.test`;
}

export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}-${randomUUID().slice(0, 8)}`;
}

interface SignUpParams {
  email: string;
  name?: string;
  lastName?: string;
  phone?: string;
  password?: string;
}

async function throwIfNotOk(response: APIResponse, action: string) {
  if (!response.ok()) {
    throw new Error(`${action} falló (${response.status()}): ${await response.text()}`);
  }
}

export async function signUp(
  request: APIRequestContext,
  { email, name = "Ana", lastName = "García", phone = "+51999888777", password = E2E_PASSWORD }: SignUpParams,
) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: PLATFORM_BASE_URL },
    data: { name, lastName, phone, email, password },
  });

  await throwIfNotOk(response, "signUp");

  return response;
}

export async function authPost(
  context: APIRequestContext,
  path: string,
  body: Record<string, unknown>,
  baseUrl: string = API_BASE_URL,
) {
  return context.post(`${baseUrl}${path}`, {
    headers: { Origin: PLATFORM_BASE_URL },
    data: body,
  });
}

export async function signUpRaw(
  context: APIRequestContext,
  body: Record<string, unknown>,
  baseUrl: string = API_BASE_URL,
) {
  return authPost(context, "/api/auth/sign-up/email", body, baseUrl);
}

export async function confirmEmail(email: string): Promise<void> {
  const testPrisma = await getTestPrisma();
  await testPrisma.user.update({ where: { email }, data: { confirmed: true } });
}

export async function signIn(
  request: APIRequestContext,
  email: string,
  password: string = E2E_PASSWORD,
) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-in/email`, {
    headers: { Origin: PLATFORM_BASE_URL },
    data: { email, password },
  });

  await throwIfNotOk(response, "signIn");

  const { cookies } = await request.storageState();
  const hasSessionCookie = cookies.some((cookie) => cookie.name === SESSION_COOKIE_NAME);
  if (!hasSessionCookie) {
    throw new Error(
      `signIn no dejó la cookie "${SESSION_COOKIE_NAME}" en el contexto de la petición`,
    );
  }

  return response;
}

export interface CreateConfirmedUserOptions {
  emailPrefix?: string;
  name?: string;
  lastName?: string;
  phone?: string;
}

export async function createConfirmedUser(
  request: APIRequestContext,
  {
    emailPrefix = "usuario",
    name = "Ana",
    lastName = "García",
    phone = "+51999888777",
  }: CreateConfirmedUserOptions = {},
): Promise<{ email: string; userId: string; name: string; lastName: string; phone: string }> {
  const email = uniqueEmail(emailPrefix);

  await signUp(request, { email, name, lastName, phone });
  await confirmEmail(email);
  await signIn(request, email);

  const response = await request.get(`${API_BASE_URL}/user/me`, {
    headers: { Origin: PLATFORM_BASE_URL },
  });
  await throwIfNotOk(response, "GET /user/me");

  const me = (await response.json()) as { id: string };

  return { email, userId: me.id, name, lastName, phone };
}
