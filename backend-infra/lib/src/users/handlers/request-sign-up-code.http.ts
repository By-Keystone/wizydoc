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
import type { IIpRateLimit } from "../application/ports/ip-rate-limit.port";
import {
  type RequestSignUpCodeUseCase,
  requestSignUpCodeInputSchema,
} from "../application/request-sign-up-code.usecase";
import { SIGN_UP_CODE_FAILED, TOO_MANY_ATTEMPTS } from "./http-messages";

export interface RequestSignUpCodeHttpDependencies {
  emailSendAttempts: IIpRateLimit;
  requestSignUpCode: Pick<RequestSignUpCodeUseCase, "execute">;
}

export const handleRequestSignUpCode = async (
  event: ApiGatewayEvent,
  { emailSendAttempts, requestSignUpCode }: RequestSignUpCodeHttpDependencies,
): Promise<ApiGatewayResult> => {
  const parsed = requestSignUpCodeInputSchema.safeParse(
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

    await requestSignUpCode.execute(parsed.data);
    return acceptedResponse();
  } catch (error) {
    console.error(
      "[sign-up-code] falló el pedido del código:",
      errorName(error),
    );
    return messageResponse(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      SIGN_UP_CODE_FAILED,
    );
  }
};
