import { SessionRepository } from "../../access/infrastructure/persistence/dynamodb/session.repository";
import { requireEnv } from "../../shared/env";
import type { PrivateApiGatewayEvent } from "../../shared/http/api-gateway";
import { AuthorizeRequestUseCase } from "../../access/application/authorize-request.usecase";
import { GetMeUseCase } from "../application/get-me.usecase";
import { AccountRepository } from "../infrastructure/persistence/dynamodb/account.repository";
import { getClient } from "../infrastructure/persistence/dynamodb/client";
import { ClinicRepository } from "../../clinics/infrastructure/persistence/dynamodb/clinic.repository";
import { handleMe } from "./me.http";
import { readRoutePolicy } from "../../access/handlers/private-route";

const tableName = requireEnv("TABLE_NAME");
const documentClient = getClient();

const dependencies = {
  authorizeRequest: new AuthorizeRequestUseCase(
    new SessionRepository(documentClient, tableName),
    new ClinicRepository(documentClient, tableName),
    readRoutePolicy(),
  ),
  getMe: new GetMeUseCase(new AccountRepository(documentClient, tableName)),
};

export const handler = (event: PrivateApiGatewayEvent) =>
  handleMe(event, dependencies);
