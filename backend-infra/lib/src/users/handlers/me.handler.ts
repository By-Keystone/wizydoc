import { requireEnv } from "../../shared/env";
import type { PrivateApiGatewayEvent } from "../../shared/http/api-gateway";
import { AuthorizeRequestUseCase } from "../application/authorize-request.usecase";
import { GetMeUseCase } from "../application/get-me.usecase";
import { AccountRepository } from "../infrastructure/persistence/dynamodb/account.repository";
import { getClient } from "../infrastructure/persistence/dynamodb/client";
import { ClinicRepository } from "../infrastructure/persistence/dynamodb/clinic.repository";
import { UserRepository } from "../infrastructure/persistence/dynamodb/user.repository";
import { handleMe } from "./me.http";
import { readRoutePolicy } from "./private-route";

const tableName = requireEnv("TABLE_NAME");
const documentClient = getClient();

const dependencies = {
  authorizeRequest: new AuthorizeRequestUseCase(
    new UserRepository(documentClient, tableName),
    new ClinicRepository(documentClient, tableName),
    readRoutePolicy(),
  ),
  getMe: new GetMeUseCase(new AccountRepository(documentClient, tableName)),
};

export const handler = (event: PrivateApiGatewayEvent) =>
  handleMe(event, dependencies);
