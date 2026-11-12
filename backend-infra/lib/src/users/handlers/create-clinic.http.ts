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
  type CreateClinicUseCase,
  createClinicInputSchema,
} from "../application/create-clinic.usecase";
import { CLINIC_ALREADY_CREATED, CLINIC_FAILED } from "./http-messages";
import { handlePrivateRoute } from "./private-route";

export interface CreateClinicHttpDependencies {
  authorizeRequest: Pick<AuthorizeRequestUseCase, "execute">;
  createClinic: Pick<CreateClinicUseCase, "execute">;
}

export const handleCreateClinic = async (
  event: PrivateApiGatewayEvent,
  { authorizeRequest, createClinic }: CreateClinicHttpDependencies,
): Promise<ApiGatewayResult> => {
  const parsed = createClinicInputSchema.safeParse(parseJsonBody(event.body));
  if (!parsed.success) {
    return messageResponse(
      HTTP_STATUS.BAD_REQUEST,
      parsed.error.issues[0]?.message ?? INVALID_REQUEST,
    );
  }

  return handlePrivateRoute(
    event,
    authorizeRequest,
    async ({ user }) => {
      const result = await createClinic.execute(user, parsed.data);
      if (result.kind === "already-created") {
        return messageResponse(HTTP_STATUS.CONFLICT, CLINIC_ALREADY_CREATED);
      }
      return jsonResponse(HTTP_STATUS.CREATED, {
        organizationId: result.organizationId,
        clinicId: result.clinicId,
        onboardingStep: "SCHEDULE",
      });
    },
    CLINIC_FAILED,
  );
};
