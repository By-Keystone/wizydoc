import { getClient } from "@/infrastructure/postgres/transaction-context";
import z from "zod";

// El parámetro se llama `resourceId` por convención: es el nombre que busca
// `checkResource` en la política. La URL no cambia.
export const getSpecialtiesParamSchema = z.object({
  resourceId: z.string({ error: "Organization ID is required" }),
});

export type GetSpecialtiesDto = { organizationId: string };

export class GetSpecialtiesUseCase {
  async execute(dto: GetSpecialtiesDto) {
    const client = getClient();

    const specialties = await client.specialty.findMany({
      where: { organizationId: dto.organizationId },
    });

    return specialties;
  }
}
