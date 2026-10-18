-- CreateEnum
CREATE TYPE "DoctorTreatment" AS ENUM ('DR', 'DRA');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "treatment" "DoctorTreatment";
