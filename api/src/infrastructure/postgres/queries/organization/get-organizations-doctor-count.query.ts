import type { IGetOrganizationsDoctorCountQuery } from "@/application/queries/organization/get-organizations-doctor-count.query";
import type {
  GetOrganizationsDoctorCountQueryResult,
  GetOrganizationsDoctorCountDto,
} from "../../../../application/queries/organization/get-organizations-doctor-count.query";
import { getClient } from "../../transaction-context";
import { countedDoctorProfileWhere } from "../doctor-profile/counted-doctor-profile";

export class GetOrganizationsDoctorCountQuery
  implements IGetOrganizationsDoctorCountQuery
{
  async execute(
    dto: GetOrganizationsDoctorCountDto,
  ): Promise<GetOrganizationsDoctorCountQueryResult> {
    const client = getClient();
    const clinics = await client.clinic.findMany({
      where: { resource: { parentResourceId: dto.resourceId } },
      select: { resourceId: true },
    });

    const doctorCount = await client.doctorProfile.count({
      where: {
        OR: clinics.map((clinic) =>
          countedDoctorProfileWhere(clinic.resourceId),
        ),
      },
    });

    return { doctorCount };
  }
}
