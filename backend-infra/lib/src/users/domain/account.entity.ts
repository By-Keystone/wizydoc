import type { ULID } from "ulid";
import type { User } from "./user.entity";

export interface Account {
  id: ULID;
  ownerUserId: ULID;
}

export const createAccount = (owner: User): Account => ({
  id: owner.accountId,
  ownerUserId: owner.id,
});
