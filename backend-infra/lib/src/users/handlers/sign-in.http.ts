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
  type SignInUseCase,
  signInInputSchema,
} from "../application/sign-in.usecase";
import {
  INVALID_CREDENTIALS,
  SIGN_IN_FAILED,
  TOO_MANY_ATTEMPTS,
} from "./http-messages";

export interface SignInHttpDependencies {
  signInRateLimit: IIpRateLimit;
  signIn: Pick<SignInUseCase, "execute">;
}

export const handleSignIn = async (
  event: ApiGatewayEvent,
  { signInRateLimit, signIn }: SignInHttpDependencies,
): Promise<ApiGatewayResult> => {
  const parsed = signInInputSchema.safeParse(parseJsonBody(event.body));
  if (!parsed.success) {
    return messageResponse(
      HTTP_STATUS.BAD_REQUEST,
      parsed.error.issues[0]?.message ?? INVALID_REQUEST,
    );
  }

  try {
    if (!(await signInRateLimit.tryRegister(readIpAddress(event)))) {
      return messageResponse(HTTP_STATUS.TOO_MANY_REQUESTS, TOO_MANY_ATTEMPTS);
    }

    const outcome = await signIn.execute(parsed.data);
    switch (outcome.kind) {
      case "signed-in":
        return noStoreJsonResponse(outcome.session);
      case "rejected":
        return messageResponse(HTTP_STATUS.UNAUTHORIZED, INVALID_CREDENTIALS);
      case "locked-out":
        return messageResponse(
          HTTP_STATUS.TOO_MANY_REQUESTS,
          TOO_MANY_ATTEMPTS,
        );
    }
  } catch (error) {
    console.error("[sign-in] falló el inicio de sesión:", errorName(error));
    return messageResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, SIGN_IN_FAILED);
  }
};
