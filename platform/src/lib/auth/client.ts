"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

/**
 * Cliente de Better Auth para componentes de cliente. Sin `baseURL`: usa el
 * mismo origen (window.location) y el rewrite de Next reenvía `/api/auth/*` al api.
 *
 * `inferAdditionalFields` declara los campos extra del usuario para que
 * `signUp`/`signIn`/`getSession` los tipen correctamente.
 */
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: {
        lastName: { type: "string", required: true },
        phone: { type: "string", required: true },
        role: { type: "string", required: false, input: false },
        onboardingCompleted: {
          type: "boolean",
          required: false,
          input: false,
        },
        accountId: { type: "string", required: false, input: false },
      },
    }),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
