import { z } from "zod";
import {
  MEMBERSHIP_RESOURCE_TYPES,
  MEMBERSHIP_ROLES,
  type Membership,
  type MembershipRole,
} from "../domain/membership.entity";
import type { IClinicRepository } from "../domain/repository/clinic.repository";
import type { IUserRepository } from "../domain/repository/user.repository";
import { ONBOARDING_STEPS, type User } from "../domain/user.entity";

const ROLE_RANK: Record<MembershipRole, number> = {
  ADMIN: 100,
  DOCTOR: 50,
  USER: 10,
};

export const ANY_ONBOARDING_STEP = "ANY";
export const ROUTE_POLICY_VARIABLE = "ROUTE_POLICY";
export const RESOURCE_ID_PARAMETER = "resourceId";

export const requiresMembership = ({
  member,
  roles,
}: {
  member?: boolean;
  roles?: readonly unknown[];
}): boolean => member === true || roles !== undefined;

export const routePolicySchema = z
  .strictObject({
    confirmed: z.boolean().default(true),
    onboardingStep: z
      .enum([...ONBOARDING_STEPS, ANY_ONBOARDING_STEP])
      .or(z.array(z.enum(ONBOARDING_STEPS)).nonempty())
      .default("COMPLETED"),
    member: z.boolean().default(false),
    roles: z.array(z.enum(MEMBERSHIP_ROLES)).nonempty().optional(),
    resourceType: z.enum(MEMBERSHIP_RESOURCE_TYPES).optional(),
  })
  .refine(
    (policy) =>
      requiresMembership(policy) === (policy.resourceType !== undefined),
    { error: "resourceType se declara si y sólo si la ruta exige membership" },
  );

export type RoutePolicy = z.input<typeof routePolicySchema>;
type ResolvedRoutePolicy = z.output<typeof routePolicySchema>;

export interface AuthorizeRequestInput {
  cognitoSub: string;
  resourceId?: string;
}

export interface AuthorizedRequest {
  user: User;
  membership?: Membership;
}

export type AuthorizeRequestResult =
  | ({ kind: "authorized" } & AuthorizedRequest)
  | { kind: "session-expired" }
  | { kind: "email-not-confirmed" }
  | { kind: "wrong-onboarding-step"; onboardingStep: User["onboardingStep"] }
  | { kind: "resource-not-found" }
  | { kind: "role-forbidden" };

export class AuthorizeRequestUseCase {
  private readonly policy: ResolvedRoutePolicy;

  constructor(
    private readonly users: Pick<
      IUserRepository,
      "findByCognitoSubWithMemberships"
    >,
    private readonly clinics: Pick<IClinicRepository, "findOrganizationId">,
    policy: RoutePolicy,
  ) {
    this.policy = routePolicySchema.parse(policy);
  }

  async execute({
    cognitoSub,
    resourceId,
  }: AuthorizeRequestInput): Promise<AuthorizeRequestResult> {
    const needsMembership = requiresMembership(this.policy);
    if (needsMembership && !resourceId) {
      throw new Error("La ruta exige membership y no tiene resourceId");
    }

    const session =
      await this.users.findByCognitoSubWithMemberships(cognitoSub);
    if (!session) return { kind: "session-expired" };

    const { user, memberships } = session;
    if (this.policy.confirmed && !user.confirmed) {
      return { kind: "email-not-confirmed" };
    }
    if (!this.isInAllowedStep(user)) {
      return {
        kind: "wrong-onboarding-step",
        onboardingStep: user.onboardingStep,
      };
    }
    if (!needsMembership || !resourceId) return { kind: "authorized", user };

    const membership = await this.findMembership(memberships, resourceId);
    if (!membership) return { kind: "resource-not-found" };
    if (!this.hasAllowedRole(membership)) return { kind: "role-forbidden" };
    return { kind: "authorized", user, membership };
  }

  private isInAllowedStep({ onboardingStep }: User): boolean {
    const allowed = this.policy.onboardingStep;
    return (
      allowed === ANY_ONBOARDING_STEP ||
      [allowed].flat().includes(onboardingStep)
    );
  }

  private hasAllowedRole({ role }: Membership): boolean {
    return !this.policy.roles || this.policy.roles.includes(role);
  }

  private async findMembership(
    memberships: Membership[],
    resourceId: string,
  ): Promise<Membership | undefined> {
    const direct = memberships.find(
      (membership) =>
        membership.resourceType === this.policy.resourceType &&
        membership.resourceId === resourceId,
    );
    if (this.policy.resourceType !== "CLINIC") return direct;

    const inherited = await this.findInheritedFromOrganization(
      memberships,
      resourceId,
    );
    if (!direct || !inherited) return direct ?? inherited;
    return ROLE_RANK[inherited.role] > ROLE_RANK[direct.role]
      ? inherited
      : direct;
  }

  private async findInheritedFromOrganization(
    memberships: Membership[],
    clinicId: string,
  ): Promise<Membership | undefined> {
    const organizationMemberships = memberships.filter(
      ({ resourceType }) => resourceType === "ORGANIZATION",
    );
    if (organizationMemberships.length === 0) return undefined;

    const organizationId = await this.clinics.findOrganizationId(clinicId);
    const inherited = organizationMemberships.find(
      ({ resourceId }) => resourceId === organizationId,
    );
    return (
      inherited && {
        ...inherited,
        resourceId: clinicId,
        resourceType: "CLINIC",
      }
    );
  }
}
