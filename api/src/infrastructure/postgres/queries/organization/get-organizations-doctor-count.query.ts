import type { IGetOrganizationsDoctorCountQuery } from "@/application/queries/organization/get-organizations-doctor-count.query";
import type {
  GetOrganizationsDoctorCountQueryResult,
  GetOrganizationsDoctorCountDto,
} from "../../../../application/queries/organization/get-organizations-doctor-count.query";
import { getClient } from "../../transaction-context";
import { countedDoctorProfileWhere } from "../doctor-profile/live-doctor-profile";

export class GetOrganizationsDoctorCountQuery
  implements IGetOrganizationsDoctorCountQuery
{
  async execute(
    dto: GetOrganizationsDoctorCountDto,
  ): Promise<GetOrganizationsDoctorCountQueryResult> {
    const doctorCount = await getClient().doctorProfile.count({
      where: countedDoctorProfileWhere({ organizationId: dto.resourceId }),
    });

    return { doctorCount };
  }
}
