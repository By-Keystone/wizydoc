import type { ULID } from "ulid";
import type { WeeklyScheduleVO } from "./value-objects/weekly-schedule.vo";

export interface Schedule {
  userId: ULID;
  clinicId: ULID;
  accountId: ULID;
  weeklySchedule: WeeklyScheduleVO;
  updatedAt: Date;
}
