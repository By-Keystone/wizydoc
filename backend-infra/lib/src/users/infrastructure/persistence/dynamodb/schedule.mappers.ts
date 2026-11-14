import type { Schedule } from "../../../domain/schedule.entity";
import { clinicPk } from "./clinic.schema";
import {
  SCHEDULE_ITEM_TYPE,
  type ScheduleDynamoDBSchema,
} from "./schedule.schema";
import { pk } from "./user.schema";

export const fromScheduleToDynamo = ({
  userId,
  clinicId,
  accountId,
  weeklySchedule,
  updatedAt,
}: Schedule): ScheduleDynamoDBSchema => ({
  PK: pk(userId),
  SK: `SCHEDULE#${clinicId}`,
  ItemType: SCHEDULE_ITEM_TYPE,
  UserId: userId,
  ClinicId: clinicId,
  AccountId: accountId,
  WeeklySchedule: weeklySchedule.map(({ dayOfWeek, startTime, endTime }) => ({
    DayOfWeek: dayOfWeek,
    StartTime: startTime,
    EndTime: endTime,
  })),
  UpdatedAt: updatedAt.toISOString(),
  GSI1PK: clinicPk(clinicId),
  GSI1SK: `SCHEDULE#${userId}`,
});
