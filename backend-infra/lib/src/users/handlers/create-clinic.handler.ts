import { requireEnv } from "../../shared/env";
import type { PrivateApiGatewayEvent } from "../../shared/http/api-gateway";
import { AuthorizeRequestUseCase } from "../application/authorize-request.usecase";
import { CreateClinicUseCase } from "../application/create-clinic.usecase";
import { getClient } from "../infrastructure/persistence/dynamodb/client";
import { ClinicRepository } from "../infrastructure/persistence/dynamodb/clinic.repository";
import { OnboardingRepository } from "../infrastructure/persistence/dynamodb/onboarding.repository";
import { UserRepository } from "../infrastructure/persistence/dynamodb/user.repository";
import { readRoutePolicy } from "./private-route";
import { handleCreateClinic } from "./create-clinic.http";

const tableName = requireEnv("TABLE_NAME");
const documentClient = getClient();

const dependencies = {
  authorizeRequest: new AuthorizeRequestUseCase(
    new UserRepository(documentClient, tableName),
    new ClinicRepository(documentClient, tableName),
    readRoutePolicy(),
  ),
  createClinic: new CreateClinicUseCase(
    new OnboardingRepository(documentClient, tableName),
  ),
};

export const handler = (event: PrivateApiGatewayEvent) =>
  handleCreateClinic(event, dependencies);
