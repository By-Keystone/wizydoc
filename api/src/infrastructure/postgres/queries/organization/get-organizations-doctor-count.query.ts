import { IGetOrganizationsDoctorCountQuery } from "@/application/queries/organization/get-organizations-doctor-count.query";
import {
  GetOrganizationsDoctorCountQueryResult,
  GetOrganizationsDoctorCountDto,
} from "../../../../application/queries/organization/get-organizations-doctor-count.query";
import { getClient } from "../../transaction-context";

export class GetOrganizationsDoctorCountQuery implements IGetOrganizationsDoctorCountQuery {
  constructor() {}

  async execute(
    dto: GetOrganizationsDoctorCountDto,
  ): Promise<GetOrganizationsDoctorCountQueryResult> {
    const doctorCount = await getClient().doctorProfile.count({
      where: { clinic: { resource: { parentResourceId: dto.resourceId } } },
    });

    return { doctorCount };
  }
}
