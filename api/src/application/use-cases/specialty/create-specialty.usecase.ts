import z from "zod";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { UnprocessableEntity } from "@/application/errors/unprocessable-entity.errors";

export const createSpecialtyBodySchema = z.object({
  name: z.string({ error: "Specialty name is required" }),
});

// El parámetro se llama `resourceId` por convención: es el nombre que busca
// `checkResource` en la política. La URL no cambia.
export const createSpecialtyParamsSchema = z.object({
  resourceId: z.string(),
});

export type CreateSpecialtyDto = z.infer<typeof createSpecialtyBodySchema> & {
  organizationId: string;
};

export class CreateSpecialtyUseCase {
  async execute(dto: CreateSpecialtyDto) {
    try {
      const client = getClient();

      await client.specialty.create({ data: dto });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new UnprocessableEntity("Ya existe esa especialidad");
      }

      throw error;
    }
  }
}
