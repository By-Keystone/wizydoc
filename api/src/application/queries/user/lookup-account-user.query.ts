import z from "zod";

export const lookupAccountUserParamsSchema = z.object({
  resourceId: z.string(),
});

export const lookupAccountUserBodySchema = z.object({
  email: z.email({ error: "Correo inválido" }),
});

export type LookupAccountUserDto = { resourceId: string; email: string };

export type LookedUpAccountUser = {
  name: string;
  lastName: string;
  phone: string;
};
