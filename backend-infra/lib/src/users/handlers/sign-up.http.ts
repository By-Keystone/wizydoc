import type { z } from "zod";
import {
  type ApiGatewayEvent,
  type ApiGatewayResult,
  acceptedResponse,
  errorName,
  HTTP_STATUS,
  messageResponse,
  parseJsonBody,
  readHeader,
  readIpAddress,
} from "../../shared/http/api-gateway";
import { INVALID_REQUEST } from "../../shared/messages";
import type { IIpRateLimit } from "../application/ports/ip-rate-limit.port";
import type {
  SignUpInput,
  SignUpUseCase,
} from "../application/sign-up.usecase";
import { SIGN_UP_FAILED, TOO_MANY_ATTEMPTS } from "./http-messages";

export interface SignUpHttpDependencies {
  inputSchema: z.ZodType<SignUpInput>;
  emailSendAttempts: IIpRateLimit;
  signUp: Pick<SignUpUseCase, "execute">;
}

export const handleSignUp = async (
  event: ApiGatewayEvent,
  { inputSchema, emailSendAttempts, signUp }: SignUpHttpDependencies,
): Promise<ApiGatewayResult> => {
  const parsed = inputSchema.safeParse(parseJsonBody(event.body));
  if (!parsed.success) {
    return messageResponse(
      HTTP_STATUS.BAD_REQUEST,
      parsed.error.issues[0]?.message ?? INVALID_REQUEST,
    );
  }

  const ipAddress = readIpAddress(event);

  try {
    if (!(await emailSendAttempts.tryRegister(ipAddress))) {
      return messageResponse(HTTP_STATUS.TOO_MANY_REQUESTS, TOO_MANY_ATTEMPTS);
    }

    await signUp.execute({
      input: parsed.data,
      ipAddress,
      userAgent: readHeader(event, "user-agent"),
    });
    return acceptedResponse();
  } catch (error) {
    console.error("[sign-up] falló el registro:", errorName(error));
    return messageResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, SIGN_UP_FAILED);
  }
};
