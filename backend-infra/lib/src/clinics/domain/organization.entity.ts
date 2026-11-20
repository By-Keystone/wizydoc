import type { ULID } from "ulid";

export interface Organization {
  id: ULID;
  accountId: ULID;
  name: string;
}
