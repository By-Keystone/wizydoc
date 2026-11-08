import { errorName } from "../../shared/errors";
import {
  type ApiGatewayEvent,
  type ApiGatewayResult,
  HTTP_STATUS,
  messageResponse,
  noStoreJsonResponse,
  parseJsonBody,
  readIpAddress,
} from "../../shared/http/api-gateway";
import { INVALID_REQUEST } from "../../shared/messages";
import type { IIpRateLimit } from "../application/ports/ip-rate-limit.port";
import {
  INVALID_SIGN_UP_CODE,
  type VerifySignUpCodeUseCase,
  verifySignUpCodeInputSchema,
} from "../application/verify-sign-up-code.usecase";
import {
  SIGN_UP_CODE_VERIFICATION_FAILED,
  TOO_MANY_ATTEMPTS,
} from "./http-messages";

export interface VerifySignUpCodeHttpDependencies {
  verificationRateLimit: IIpRateLimit;
  verifySignUpCode: Pick<VerifySignUpCodeUseCase, "execute">;
}

export const handleVerifySignUpCode = async (
  event: ApiGatewayEvent,
  { verificationRateLimit, verifySignUpCode }: VerifySignUpCodeHttpDependencies,
): Promise<ApiGatewayResult> => {
  const parsed = verifySignUpCodeInputSchema.safeParse(
    parseJsonBody(event.body),
  );
  if (!parsed.success) {
    return messageResponse(
      HTTP_STATUS.BAD_REQUEST,
      parsed.error.issues[0]?.message ?? INVALID_REQUEST,
    );
  }

  try {
    if (!(await verificationRateLimit.tryRegister(readIpAddress(event)))) {
      return messageResponse(HTTP_STATUS.TOO_MANY_REQUESTS, TOO_MANY_ATTEMPTS);
    }

    const verificationToken = await verifySignUpCode.execute(parsed.data);
    return verificationToken
      ? noStoreJsonResponse({ verificationToken })
      : messageResponse(HTTP_STATUS.BAD_REQUEST, INVALID_SIGN_UP_CODE);
  } catch (error) {
    console.error(
      "[verify-sign-up-code] falló la verificación:",
      errorName(error),
    );
    return messageResponse(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      SIGN_UP_CODE_VERIFICATION_FAILED,
    );
  }
};
