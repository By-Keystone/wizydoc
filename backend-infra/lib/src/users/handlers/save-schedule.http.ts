import {
  type ApiGatewayResult,
  HTTP_STATUS,
  jsonResponse,
  messageResponse,
  type PrivateApiGatewayEvent,
  parseJsonBody,
} from "../../shared/http/api-gateway";
import { INVALID_REQUEST } from "../../shared/messages";
import type { AuthorizeRequestUseCase } from "../application/authorize-request.usecase";
import {
  type SaveScheduleUseCase,
  saveScheduleInputSchema,
} from "../application/save-schedule.usecase";
import { ONBOARDING_ALREADY_COMPLETED, SCHEDULE_FAILED } from "./http-messages";
import { handlePrivateRoute } from "./private-route";

export interface SaveScheduleHttpDependencies {
  authorizeRequest: Pick<AuthorizeRequestUseCase, "execute">;
  saveSchedule: Pick<SaveScheduleUseCase, "execute">;
}

export const handleSaveSchedule = async (
  event: PrivateApiGatewayEvent,
  { authorizeRequest, saveSchedule }: SaveScheduleHttpDependencies,
): Promise<ApiGatewayResult> => {
  const parsed = saveScheduleInputSchema.safeParse(parseJsonBody(event.body));
  if (!parsed.success) {
    return messageResponse(
      HTTP_STATUS.BAD_REQUEST,
      parsed.error.issues[0]?.message ?? INVALID_REQUEST,
    );
  }

  return handlePrivateRoute(
    event,
    authorizeRequest,
    async ({ user, memberships }) => {
      const result = await saveSchedule.execute(user, memberships, parsed.data);
      if (result.kind === "already-completed") {
        return messageResponse(
          HTTP_STATUS.CONFLICT,
          ONBOARDING_ALREADY_COMPLETED,
        );
      }
      return jsonResponse(HTTP_STATUS.OK, {
        onboardingStep: result.onboardingStep,
      });
    },
    SCHEDULE_FAILED,
  );
};
