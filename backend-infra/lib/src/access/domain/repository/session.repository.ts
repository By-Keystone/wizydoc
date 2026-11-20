import type { Membership } from "../../../clinics/domain/membership.entity";
import type { User } from "../../../users/domain/user.entity";

export interface UserWithMemberships {
  user: User;
  memberships: Membership[];
}

export interface ISessionRepository {
  findByCognitoSubWithMemberships(
    cognitoSub: string,
  ): Promise<UserWithMemberships | undefined>;
}
