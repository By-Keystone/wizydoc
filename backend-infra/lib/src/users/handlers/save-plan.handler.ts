import { requireEnv } from "../../shared/env";
import type { PrivateApiGatewayEvent } from "../../shared/http/api-gateway";
import { AuthorizeRequestUseCase } from "../application/authorize-request.usecase";
import { SavePlanUseCase } from "../application/save-plan.usecase";
import { getClient } from "../infrastructure/persistence/dynamodb/client";
import { ClinicRepository } from "../infrastructure/persistence/dynamodb/clinic.repository";
import { OnboardingRepository } from "../infrastructure/persistence/dynamodb/onboarding.repository";
import { UserRepository } from "../infrastructure/persistence/dynamodb/user.repository";
import { readRoutePolicy } from "./private-route";
import { handleSavePlan } from "./save-plan.http";

const tableName = requireEnv("TABLE_NAME");
const documentClient = getClient();

const dependencies = {
  authorizeRequest: new AuthorizeRequestUseCase(
    new UserRepository(documentClient, tableName),
    new ClinicRepository(documentClient, tableName),
    readRoutePolicy(),
  ),
  savePlan: new SavePlanUseCase(
    new OnboardingRepository(documentClient, tableName),
  ),
};

export const handler = (event: PrivateApiGatewayEvent) =>
  handleSavePlan(event, dependencies);
