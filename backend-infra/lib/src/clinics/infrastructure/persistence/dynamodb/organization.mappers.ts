import type { Organization } from "../../../domain/organization.entity";
import { accountPk } from "../../../../accounts/infrastructure/persistence/dynamodb/account.schema";
import {
  ORGANIZATION_ITEM_TYPE,
  type OrganizationDynamoDBSchema,
  organizationPk,
  organizationSk,
} from "./organization.schema";

export const fromOrganizationToDynamo = ({
  id,
  accountId,
  name,
}: Organization): OrganizationDynamoDBSchema => ({
  PK: organizationPk(id),
  SK: organizationSk(),
  ItemType: ORGANIZATION_ITEM_TYPE,
  Id: id,
  AccountId: accountId,
  Name: name,
  GSI1PK: accountPk(accountId),
  GSI1SK: organizationPk(id),
});
