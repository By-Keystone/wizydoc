import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
  TransactionConflictException,
} from "@aws-sdk/client-dynamodb";

const LOST_RACE_REASONS = [
  "ConditionalCheckFailed",
  "TransactionConflict",
  "None",
];

const isOnlyLostRaceReasons = (reasons: { Code?: string }[]): boolean =>
  reasons.length > 0 &&
  reasons.every(({ Code }) => LOST_RACE_REASONS.includes(Code ?? "None"));

export const isLostRace = (error: unknown): boolean =>
  error instanceof ConditionalCheckFailedException ||
  error instanceof TransactionConflictException ||
  (error instanceof TransactionCanceledException &&
    isOnlyLostRaceReasons(error.CancellationReasons ?? []));
