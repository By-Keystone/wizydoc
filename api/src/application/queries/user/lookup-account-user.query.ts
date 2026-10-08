import z from "zod";

export const lookupAccountUserParamsSchema = z.object({
  resourceId: z.uuid(),
});

export const lookupAccountUserBodySchema = z.object({
  // Los correos se guardan en minúsculas y la invitación también las normaliza.
  email: z.email({ error: "Correo inválido" }).toLowerCase(),
});

export type LookupAccountUserDto = { resourceId: string; email: string };

export type LookedUpAccountUser = {
  name: string;
  lastName: string;
  phone: string;
};
