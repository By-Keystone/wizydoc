-- AlterTable
ALTER TABLE "patient" ADD COLUMN     "allergies" TEXT[],
ADD COLUMN     "allergies_reviewed_at" TIMESTAMP(3),
ADD COLUMN     "background" TEXT,
ADD COLUMN     "blood_type" TEXT,
ADD COLUMN     "emergency_contact" TEXT,
ADD COLUMN     "insurer" TEXT,
ADD COLUMN     "medications" TEXT,
ADD COLUMN     "sex" TEXT,
ADD COLUMN     "updated_by" UUID,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "appointment_patient_id_scheduled_at_idx" ON "appointment"("patient_id", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "patient_account_id_document_type_document_number_key" ON "patient"("account_id", "document_type", "document_number");
