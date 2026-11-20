import { requireEnv } from "../../shared/env";
import type { PrivateApiGatewayEvent } from "../../shared/http/api-gateway";
import { AuthorizeRequestUseCase } from "../../access/application/authorize-request.usecase";
import { SaveScheduleUseCase } from "../application/save-schedule.usecase";
import { getClient } from "../../shared/persistence/dynamodb/client";
import { ClinicRepository } from "../../clinics/infrastructure/persistence/dynamodb/clinic.repository";
import { OnboardingRepository } from "../../onboarding/infrastructure/persistence/dynamodb/onboarding.repository";
import { SessionRepository } from "../../access/infrastructure/persistence/dynamodb/session.repository";
import { readRoutePolicy } from "../../access/handlers/private-route";
import { handleSaveSchedule } from "./save-schedule.http";

const tableName = requireEnv("TABLE_NAME");
const documentClient = getClient();

const dependencies = {
  authorizeRequest: new AuthorizeRequestUseCase(
    new SessionRepository(documentClient, tableName),
    new ClinicRepository(documentClient, tableName),
    readRoutePolicy(),
  ),
  saveSchedule: new SaveScheduleUseCase(
    new OnboardingRepository(documentClient, tableName),
  ),
};

export const handler = (event: PrivateApiGatewayEvent) =>
  handleSaveSchedule(event, dependencies);
