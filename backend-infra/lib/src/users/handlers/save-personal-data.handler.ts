import { requireEnv } from "../../shared/env";
import type { PrivateApiGatewayEvent } from "../../shared/http/api-gateway";
import { AuthorizeRequestUseCase } from "../application/authorize-request.usecase";
import { SavePersonalDataUseCase } from "../application/save-personal-data.usecase";
import { getClient } from "../infrastructure/persistence/dynamodb/client";
import { ClinicRepository } from "../infrastructure/persistence/dynamodb/clinic.repository";
import { OnboardingRepository } from "../infrastructure/persistence/dynamodb/onboarding.repository";
import { UserRepository } from "../infrastructure/persistence/dynamodb/user.repository";
import { readRoutePolicy } from "./private-route";
import { handleSavePersonalData } from "./save-personal-data.http";

const tableName = requireEnv("TABLE_NAME");
const documentClient = getClient();

const dependencies = {
  authorizeRequest: new AuthorizeRequestUseCase(
    new UserRepository(documentClient, tableName),
    new ClinicRepository(documentClient, tableName),
    readRoutePolicy(),
  ),
  savePersonalData: new SavePersonalDataUseCase(
    new OnboardingRepository(documentClient, tableName),
  ),
};

export const handler = (event: PrivateApiGatewayEvent) =>
  handleSavePersonalData(event, dependencies);
