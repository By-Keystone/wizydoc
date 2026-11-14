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
  type SavePersonalDataUseCase,
  savePersonalDataInputSchema,
} from "../application/save-personal-data.usecase";
import { PERSONAL_DATA_FAILED } from "./http-messages";
import { handlePrivateRoute } from "./private-route";

export interface SavePersonalDataHttpDependencies {
  authorizeRequest: Pick<AuthorizeRequestUseCase, "execute">;
  savePersonalData: Pick<SavePersonalDataUseCase, "execute">;
}

export const handleSavePersonalData = async (
  event: PrivateApiGatewayEvent,
  { authorizeRequest, savePersonalData }: SavePersonalDataHttpDependencies,
): Promise<ApiGatewayResult> => {
  const parsed = savePersonalDataInputSchema.safeParse(
    parseJsonBody(event.body),
  );
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
        onboardingStep: await savePersonalData.execute(user, parsed.data),
      }),
    PERSONAL_DATA_FAILED,
  );
};
