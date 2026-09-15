import { Organization } from "@/domain/entities/organization/entity";
import {
  CreateOrganizationData,
  IOrganizationRepository,
} from "@/domain/repositories/organization.repository";
import { BadRequest } from "@/application/errors/bad-request.errors";
import { UnknownError } from "@/application/errors/unknown";
import { getClient, inTransaction } from "../transaction-context";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { toDomain } from "../../mappers/organization/mapper";

export class OrganizationRepository implements IOrganizationRepository {
  async findByCreatedBy(createdBy: string): Promise<boolean> {
    try {
      await getClient().resource.findFirstOrThrow({
        where: { createdBy, type: "ORGANIZATION" },
      });
      return true;
    } catch {
      return false;
    }
  }

  async save(data: CreateOrganizationData): Promise<Organization> {
    console.log({ data });

    try {
      const organization = await inTransaction(async () => {
        const resource = await getClient().resource.create({
          data: {
            type: "ORGANIZATION",
            createdBy: data.userId,
            accountId: data.accountId,
          },
        });

        const created = await getClient().organization.create({
          data: {
            name: data.name,
            account: { connect: { id: data.accountId } },
            resource: { connect: { id: resource.id } },
          },
        });

        await getClient().userResourceMembership.create({
          data: {
            userId: data.userId,
            resourceId: resource.id,
            accountId: data.accountId,
            createdBy: data.userId,
            role: "ADMIN",
          },
        });

        return created;
      });

      return toDomain(organization);
    } catch (error) {
      console.error(error);
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new BadRequest("Ya tienes una organización con ese nombre");
        }
        throw new UnknownError("Database error while creating organization");
      }
      throw new UnknownError("Unexpected error while creating organization");
    }
  }
}
