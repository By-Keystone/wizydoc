import { requireEnv } from "../../shared/env";
import type { PrivateApiGatewayEvent } from "../../shared/http/api-gateway";
import { AuthorizeRequestUseCase } from "../../access/application/authorize-request.usecase";
import { SavePlanUseCase } from "../application/save-plan.usecase";
import { getClient } from "../../shared/persistence/dynamodb/client";
import { ClinicRepository } from "../../clinics/infrastructure/persistence/dynamodb/clinic.repository";
import { OnboardingRepository } from "../../onboarding/infrastructure/persistence/dynamodb/onboarding.repository";
import { SessionRepository } from "../../access/infrastructure/persistence/dynamodb/session.repository";
import { readRoutePolicy } from "../../access/handlers/private-route";
import { handleSavePlan } from "./save-plan.http";

const tableName = requireEnv("TABLE_NAME");
const documentClient = getClient();

const dependencies = {
  authorizeRequest: new AuthorizeRequestUseCase(
    new SessionRepository(documentClient, tableName),
    new ClinicRepository(documentClient, tableName),
    readRoutePolicy(),
  ),
  savePlan: new SavePlanUseCase(
    new OnboardingRepository(documentClient, tableName),
  ),
};

export const handler = (event: PrivateApiGatewayEvent) =>
  handleSavePlan(event, dependencies);
