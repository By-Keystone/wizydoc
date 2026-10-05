import type {
  GetOrganizationClinicsDto,
  GetOrganizationClinicsQueryResult,
  IGetOrganizationClinicsQuery,
} from "@/application/queries/organization/get-organization-clinics.query";
import { getClient } from "../../transaction-context";

export class GetOrganizationClinicsQuery
  implements IGetOrganizationClinicsQuery
{
  async execute(
    dto: GetOrganizationClinicsDto,
  ): Promise<GetOrganizationClinicsQueryResult[]> {
    const clinics = await getClient().clinic.findMany({
      where: { resource: { parentResourceId: dto.resourceId } },
      include: { resource: { include: { createdByUser: true } } },
    });

    return clinics.map((clinic) => ({
      id: clinic.resourceId,
      address: clinic.address ?? undefined,
      phone: clinic.phone ?? undefined,
      createdBy: {
        name: clinic.resource.createdByUser.name,
        lastName: clinic.resource.createdByUser.lastName,
        email: clinic.resource.createdByUser.email,
      },
      name: clinic.name,
    }));
  }
}
