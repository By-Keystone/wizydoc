-- AlterTable
ALTER TABLE "clinic" ADD COLUMN     "patient_contact" TEXT;

-- CreateTable
CREATE TABLE "missed_booking" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "missed_booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_clinic_id_created_at_idx" ON "appointment"("clinic_id", "created_at");

-- CreateIndex
CREATE INDEX "missed_booking_account_id_created_at_idx" ON "missed_booking"("account_id", "created_at");

-- AddForeignKey
ALTER TABLE "missed_booking" ADD CONSTRAINT "missed_booking_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missed_booking" ADD CONSTRAINT "missed_booking_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinic"("resource_id") ON DELETE NO ACTION ON UPDATE CASCADE;
