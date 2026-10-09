-- Prisma no modela índices parciales. El predicado debe coincidir con
-- BLOCKING_APPOINTMENT_STATUSES (domain/entities/appointment/self-service.ts).
CREATE UNIQUE INDEX "appointment_doctor_slot_active_key"
  ON "appointment" ("doctor_profile_id", "scheduled_at")
  WHERE "status" IN ('PENDING', 'CONFIRMED', 'COMPLETED');

-- DropIndex
DROP INDEX "appointment_doctor_profile_id_scheduled_at_key";

-- AlterTable
ALTER TABLE "appointment" ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "reschedule_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "appointment_access_token" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_access_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "appointment_access_token_token_hash_key" ON "appointment_access_token"("token_hash");

-- CreateIndex
CREATE INDEX "appointment_access_token_appointment_id_idx" ON "appointment_access_token"("appointment_id");

-- AddForeignKey
ALTER TABLE "appointment_access_token" ADD CONSTRAINT "appointment_access_token_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
