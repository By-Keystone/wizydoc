import type { Clinic } from "../../../domain/clinic.entity";
import { accountPk } from "./account.schema";
import {
  CLINIC_ITEM_TYPE,
  type ClinicDynamoDBSchema,
  clinicPk,
  clinicSk,
} from "./clinic.schema";
import { organizationPk } from "./organization.schema";

export const fromClinicToDynamo = ({
  id,
  accountId,
  organizationId,
  name,
  address,
}: Clinic): ClinicDynamoDBSchema => ({
  PK: clinicPk(id),
  SK: clinicSk(),
  ItemType: CLINIC_ITEM_TYPE,
  Id: id,
  AccountId: accountId,
  OrganizationId: organizationId,
  Name: name,
  Address: address,
  GSI1PK: organizationPk(organizationId),
  GSI1SK: clinicPk(id),
  GSI2PK: accountPk(accountId),
  GSI2SK: clinicPk(id),
});
