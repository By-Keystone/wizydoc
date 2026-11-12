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
  type SavePlanUseCase,
  savePlanInputSchema,
} from "../application/save-plan.usecase";
import { PLAN_FAILED } from "./http-messages";
import { handlePrivateRoute } from "./private-route";

export interface SavePlanHttpDependencies {
  authorizeRequest: Pick<AuthorizeRequestUseCase, "execute">;
  savePlan: Pick<SavePlanUseCase, "execute">;
}

export const handleSavePlan = async (
  event: PrivateApiGatewayEvent,
  { authorizeRequest, savePlan }: SavePlanHttpDependencies,
): Promise<ApiGatewayResult> => {
  const parsed = savePlanInputSchema.safeParse(parseJsonBody(event.body));
  if (!parsed.success) {
    return messageResponse(
      HTTP_STATUS.BAD_REQUEST,
      parsed.error.issues[0]?.message ?? INVALID_REQUEST,
    );
  }

  return handlePrivateRoute(
    event,
    authorizeRequest,
    async ({ user }) =>
      jsonResponse(HTTP_STATUS.OK, {
        onboardingStep: await savePlan.execute(user, parsed.data.plan),
      }),
    PLAN_FAILED,
  );
};
