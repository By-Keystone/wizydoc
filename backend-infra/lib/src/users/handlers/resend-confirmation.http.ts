import {
  type ApiGatewayEvent,
  type ApiGatewayResult,
  acceptedResponse,
  errorName,
  HTTP_STATUS,
  messageResponse,
  parseJsonBody,
  readIpAddress,
} from "../../shared/http/api-gateway";
import { INVALID_REQUEST } from "../../shared/messages";
import type { IEmailSendAttempts } from "../application/ports/email-send-attempts.port";
import {
  type ResendConfirmationUseCase,
  resendConfirmationInputSchema,
} from "../application/resend-confirmation.usecase";
import { SIGN_UP_FAILED, TOO_MANY_ATTEMPTS } from "./http-messages";

export interface ResendConfirmationHttpDependencies {
  emailSendAttempts: IEmailSendAttempts;
  resendConfirmation: Pick<ResendConfirmationUseCase, "execute">;
}

export const handleResendConfirmation = async (
  event: ApiGatewayEvent,
  { emailSendAttempts, resendConfirmation }: ResendConfirmationHttpDependencies,
): Promise<ApiGatewayResult> => {
  const parsed = resendConfirmationInputSchema.safeParse(
    parseJsonBody(event.body),
  );
  if (!parsed.success) {
    return messageResponse(
      HTTP_STATUS.BAD_REQUEST,
      parsed.error.issues[0]?.message ?? INVALID_REQUEST,
    );
  }

  try {
    if (!(await emailSendAttempts.tryRegister(readIpAddress(event)))) {
      return messageResponse(HTTP_STATUS.TOO_MANY_REQUESTS, TOO_MANY_ATTEMPTS);
    }

    await resendConfirmation.execute(parsed.data);
    return acceptedResponse();
  } catch (error) {
    console.error("[resend-confirmation] falló el reenvío:", errorName(error));
    return messageResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, SIGN_UP_FAILED);
  }
};
