import { type ULID, ulid } from "ulid";

export interface Account {
  id: ULID;
  ownerUserId: ULID;
}

export const createAccount = (): Pick<Account, "id"> => ({ id: ulid() });
