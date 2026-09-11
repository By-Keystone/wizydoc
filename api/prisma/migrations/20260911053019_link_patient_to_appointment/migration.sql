/*
  Warnings:

  - You are about to drop the column `patient_email` on the `appointment` table. All the data in the column will be lost.
  - You are about to drop the column `patient_last_name` on the `appointment` table. All the data in the column will be lost.
  - You are about to drop the column `patient_name` on the `appointment` table. All the data in the column will be lost.
  - You are about to drop the column `patient_phone` on the `appointment` table. All the data in the column will be lost.
  - Added the required column `patient_id` to the `appointment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "appointment" DROP COLUMN "patient_email",
DROP COLUMN "patient_last_name",
DROP COLUMN "patient_name",
DROP COLUMN "patient_phone",
ADD COLUMN     "patient_id" UUID NOT NULL;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
