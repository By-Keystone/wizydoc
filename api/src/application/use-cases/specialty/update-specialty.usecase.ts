import { NotFound } from "@/application/errors/not-found.error";
import { UnprocessableEntity } from "@/application/errors/unprocessable-entity.errors";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import z from "zod";

export const updateSpecialtyBodySchema = z.object({
  name: z.string().optional(),
});

// El parámetro de la organización se llama `resourceId` por convención: es el
// nombre que busca `checkResource` en la política. La URL no cambia.
export const updateSpecialtyParamsSchema = z.object({
  resourceId: z.string(),
  specialtyId: z.string(),
});

export type UpdateSpecialtyDto = z.infer<typeof updateSpecialtyBodySchema> &
  Pick<z.infer<typeof updateSpecialtyParamsSchema>, "specialtyId"> & {
    organizationId: string;
  };

export class UpdateSpecialtyUseCase {
  constructor() {}

  async execute(dto: UpdateSpecialtyDto) {
    try {
      const client = getClient();

      const { specialtyId: id, organizationId, ...updateData } = dto;

      const { count } = await client.specialty.updateMany({
        where: { id, organizationId },
        data: updateData,
      });

      // Inexistente y de otra organización responden igual: no se revela qué ids existen.
      if (count === 0) throw new NotFound("Especialidad no encontrada");
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
