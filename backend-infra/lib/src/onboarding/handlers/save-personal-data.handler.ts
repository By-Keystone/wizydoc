import { AuthorizeRequestUseCase } from "../../access/application/authorize-request.usecase";
import { readRoutePolicy } from "../../access/handlers/private-route";
import { SessionRepository } from "../../access/infrastructure/persistence/dynamodb/session.repository";
import { ClinicRepository } from "../../clinics/infrastructure/persistence/dynamodb/clinic.repository";
import { requireEnv } from "../../shared/env";
import type { PrivateApiGatewayEvent } from "../../shared/http/api-gateway";
import { getClient } from "../../shared/persistence/dynamodb/client";
import { SavePersonalDataUseCase } from "../application/save-personal-data.usecase";
import { OnboardingRepository } from "../infrastructure/persistence/dynamodb/onboarding.repository";
import { handleSavePersonalData } from "./save-personal-data.http";

const tableName = requireEnv("TABLE_NAME");
const documentClient = getClient();

const dependencies = {
  authorizeRequest: new AuthorizeRequestUseCase(
    new SessionRepository(documentClient, tableName),
    new ClinicRepository(documentClient, tableName),
    readRoutePolicy(),
  ),
  savePersonalData: new SavePersonalDataUseCase(
    new OnboardingRepository(documentClient, tableName),
  ),
};

export const handler = (event: PrivateApiGatewayEvent) =>
  handleSavePersonalData(event, dependencies);
