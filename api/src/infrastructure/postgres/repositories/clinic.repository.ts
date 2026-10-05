import type { Clinic } from "@/domain/entities/clinic/entity";
import type {
  CreateClinicData,
  IClinicRepository,
} from "@/domain/repositories/clinic.repository";
import { getClient, inTransaction } from "../transaction-context";
import { toDomain } from "../../mappers/clinic/mapper";
import { UnprocessableEntity } from "@/application/errors/unprocessable-entity.errors";
import { ResourceType } from "@prisma/client";

export class ClinicRepository implements IClinicRepository {
  async save(data: CreateClinicData): Promise<Clinic> {
    const clinic = await inTransaction(async () => {
      const parentResource = await getClient().resource.findFirstOrThrow({
        where: { id: data.organizationId },
      });

      if (parentResource.type !== ResourceType.ORGANIZATION)
        throw new UnprocessableEntity(
          "Parent resource must be an organization",
        );

      // La organización llega en el cuerpo de la petición, así que hay que
      // comprobar que sea de la misma cuenta: sin esto se podría colgar una
      // clínica de la organización de otra cuenta.
      if (parentResource.accountId !== data.accountId)
        throw new UnprocessableEntity(
          "Parent organization does not belong to this account",
        );

      const resource = await getClient().resource.create({
        data: {
          type: "CLINIC",
          accountId: data.accountId,
          createdBy: data.createdBy,
          parentResourceId: data.organizationId,
        },
      });

      return getClient().clinic.create({
        data: {
          name: data.name,
          resourceId: resource.id,
          address: data.address,
          phone: data.phone,
        },
      });
    });

    return toDomain(clinic);
  }

  async update(id: string, data: Partial<Clinic>): Promise<Clinic> {
    const { resourceId: _resourceId, ...rest } = data;
    const clinic = await getClient().clinic.update({
      where: { resourceId: id },
      data: rest,
    });
    return toDomain(clinic);
  }

  // El aislamiento entre cuentas es por columna, no por schema: sin este filtro
  // la consulta devuelve las clínicas de todas las cuentas.
  async get(accountId: string): Promise<Clinic[]> {
    const clinics = await getClient().clinic.findMany({
      where: { resource: { accountId } },
    });
    return clinics.map((clinic) => toDomain(clinic));
  }
}
