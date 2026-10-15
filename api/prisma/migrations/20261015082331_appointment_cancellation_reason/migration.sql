-- CreateEnum
CREATE TYPE "CancellationReason" AS ENUM ('UNEXPECTED_EVENT', 'CANNOT_MAKE_IT', 'NO_LONGER_NEEDED', 'SEEN_ELSEWHERE', 'BOOKED_BY_MISTAKE');

-- AlterTable
ALTER TABLE "appointment" ADD COLUMN     "cancellation_reason" "CancellationReason";
