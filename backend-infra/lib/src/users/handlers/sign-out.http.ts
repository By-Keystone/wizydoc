import { errorName } from "../../shared/errors";
import {
  type ApiGatewayEvent,
  type ApiGatewayResult,
  HTTP_STATUS,
  messageResponse,
  noContentResponse,
  parseJsonBody,
} from "../../shared/http/api-gateway";
import { INVALID_REQUEST } from "../../shared/messages";
import {
  type SignOutUseCase,
  signOutInputSchema,
} from "../application/sign-out.usecase";
import { SIGN_OUT_FAILED } from "./http-messages";

export interface SignOutHttpDependencies {
  signOut: Pick<SignOutUseCase, "execute">;
}

export const handleSignOut = async (
  event: ApiGatewayEvent,
  { signOut }: SignOutHttpDependencies,
): Promise<ApiGatewayResult> => {
  const parsed = signOutInputSchema.safeParse(parseJsonBody(event.body));
  if (!parsed.success) {
    return messageResponse(HTTP_STATUS.BAD_REQUEST, INVALID_REQUEST);
  }

  try {
    await signOut.execute(parsed.data);
    return noContentResponse();
  } catch (error) {
    console.error("[sign-out] falló el cierre de sesión:", errorName(error));
    return messageResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, SIGN_OUT_FAILED);
  }
};
