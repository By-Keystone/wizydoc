import { test as base, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

const pendingApiContexts: APIRequestContext[] = [];

export function trackApiContext(context: APIRequestContext): APIRequestContext {
  pendingApiContexts.push(context);
  return context;
}

// Un dispose repetido no falla: no importa si el test también cerró el contexto a mano.
export const test = base.extend<{ closeTrackedApiContexts: void }>({
  closeTrackedApiContexts: [
    async ({}, use) => {
      await use();
      await Promise.all(
        pendingApiContexts.splice(0).map((context) => context.dispose()),
      );
    },
    { auto: true },
  ],
});

export { expect };
