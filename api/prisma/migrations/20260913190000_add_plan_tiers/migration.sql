-- CreateEnum
CREATE TYPE "Plan_new" AS ENUM ('FREE', 'CONSULTORIO', 'CLINICA', 'RED');

-- Las cuentas existentes pasan a CONSULTORIO y no a FREE, aunque FREE sea el
-- plan que nadie pagó: todavía no hay forma de cambiar de plan, así que
-- degradarlas apagaría la ficha del paciente sin que puedan recuperarla.
ALTER TABLE "subscription"
  ALTER COLUMN "plan" TYPE "Plan_new"
  USING 'CONSULTORIO'::"Plan_new";

DROP TYPE "Plan";

ALTER TYPE "Plan_new" RENAME TO "Plan";

-- AlterTable
ALTER TABLE "subscription"
  ADD COLUMN "extra_doctors" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "extra_clinics" INTEGER NOT NULL DEFAULT 0;
