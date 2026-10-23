-- DropForeignKey
ALTER TABLE "doctor_profile" DROP CONSTRAINT "doctor_profile_user_id_fkey";

-- DropForeignKey
ALTER TABLE "doctor_profile" DROP CONSTRAINT "doctor_profile_resource_id_fkey";

-- DropIndex
DROP INDEX "doctor_profile_resource_id_idx";

-- DropIndex
DROP INDEX "doctor_profile_user_id_resource_id_key";

-- AlterTable
ALTER TABLE "doctor_profile" DROP COLUMN "resource_id",
DROP COLUMN "user_id",
ADD COLUMN     "membership_id" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "user_resource_membership_resource_id_idx" ON "user_resource_membership"("resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_profile_membership_id_key" ON "doctor_profile"("membership_id");

-- AddForeignKey
ALTER TABLE "doctor_profile" ADD CONSTRAINT "doctor_profile_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "user_resource_membership"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
