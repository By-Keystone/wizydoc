import type { ULID } from "ulid";

export const SCHEDULE_ITEM_TYPE = "SCHEDULE";

export interface ScheduleDynamoDBSchema {
  PK: `USER#${string}`;
  SK: `SCHEDULE#${string}`;
  ItemType: typeof SCHEDULE_ITEM_TYPE;
  UserId: ULID;
  ClinicId: ULID;
  AccountId: ULID;
  WeeklySchedule: { DayOfWeek: number; StartTime: string; EndTime: string }[];
  UpdatedAt: string;
  GSI1PK: `CLINIC#${string}`;
  GSI1SK: `SCHEDULE#${string}`;
}
