import type {
  IGetClinicLocationQuery,
  IGetClinicLocationQueryResult,
} from "@/application/queries/clinic/get-clinic-location.query";
import { getClient } from "../../transaction-context";

export class GetClinicLocationQuery implements IGetClinicLocationQuery {
  async execute(
    clinicId: string,
  ): Promise<IGetClinicLocationQueryResult | null> {
    return getClient().clinic.findUnique({
      where: { resourceId: clinicId },
      select: { name: true, address: true },
    });
  }
}
