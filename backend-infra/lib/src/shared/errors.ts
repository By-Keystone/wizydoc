export const errorName = (error: unknown): string =>
  error instanceof Error ? error.name : "UnknownError";
