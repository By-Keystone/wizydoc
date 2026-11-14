import {
  type ApiGatewayResult,
  noStoreJsonResponse,
  type PrivateApiGatewayEvent,
} from "../../shared/http/api-gateway";
import type { AuthorizeRequestUseCase } from "../application/authorize-request.usecase";
import type { GetMeUseCase } from "../application/get-me.usecase";
import { handlePrivateRoute } from "./private-route";

export interface MeHttpDependencies {
  authorizeRequest: Pick<AuthorizeRequestUseCase, "execute">;
  getMe: Pick<GetMeUseCase, "execute">;
}

export const handleMe = (
  event: PrivateApiGatewayEvent,
  { authorizeRequest, getMe }: MeHttpDependencies,
): Promise<ApiGatewayResult> =>
  handlePrivateRoute(event, authorizeRequest, async ({ user }) => {
    const { isAccountOwner } = await getMe.execute(user);
    return noStoreJsonResponse({
      id: user.id,
      email: user.email,
      givenName: null,
      familyName: null,
      phone: null,
      treatment: null,
      accountId: user.accountId,
      isAccountOwner,
      onboardingStep: user.onboardingStep,
    });
  });
