import type { z } from "zod";
import { errorName } from "../../shared/errors";
import {
  type ApiGatewayEvent,
  type ApiGatewayResult,
  HTTP_STATUS,
  messageResponse,
  noContentResponse,
  noStoreJsonResponse,
  parseJsonBody,
  readHeader,
  readIpAddress,
} from "../../shared/http/api-gateway";
import { INVALID_REQUEST } from "../../shared/messages";
import {
  type ConfirmSignUpInput,
  type ConfirmSignUpUseCase,
  VERIFICATION_EXPIRED,
} from "../application/confirm-sign-up.usecase";
import { CONFIRM_SIGN_UP_FAILED } from "./http-messages";

export interface ConfirmSignUpHttpDependencies {
  inputSchema: z.ZodType<ConfirmSignUpInput>;
  confirmSignUp: Pick<ConfirmSignUpUseCase, "execute">;
}

export const handleConfirmSignUp = async (
  event: ApiGatewayEvent,
  { inputSchema, confirmSignUp }: ConfirmSignUpHttpDependencies,
): Promise<ApiGatewayResult> => {
  const parsed = inputSchema.safeParse(parseJsonBody(event.body));
  if (!parsed.success) {
    return messageResponse(
      HTTP_STATUS.BAD_REQUEST,
      parsed.error.issues[0]?.message ?? INVALID_REQUEST,
    );
  }

  try {
    const outcome = await confirmSignUp.execute({
      input: parsed.data,
      ipAddress: readIpAddress(event),
      userAgent: readHeader(event, "user-agent"),
    });

    switch (outcome.kind) {
      case "created-with-session":
        return noStoreJsonResponse(outcome.session);
      case "created-without-session":
        return noContentResponse();
      case "verification-rejected":
        return messageResponse(HTTP_STATUS.BAD_REQUEST, VERIFICATION_EXPIRED);
    }
  } catch (error) {
    console.error(
      "[confirm-sign-up] falló la creación de la cuenta:",
      errorName(error),
    );
    return messageResponse(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      CONFIRM_SIGN_UP_FAILED,
    );
  }
};
