import type { ULID } from "ulid";

export interface Account {
  id: ULID;
  ownerUserId: ULID;
}
