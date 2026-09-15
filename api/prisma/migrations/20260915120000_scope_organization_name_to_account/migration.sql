-- La columna `accountId` quedó huérfana al mover la cuenta a `resource`: nunca
-- se rellenó. Se recupera aquí para poder exigir el nombre único por cuenta,
-- que es lo que la migración inicial ya hacía antes de aquel movimiento.
ALTER TABLE "organization" RENAME COLUMN "accountId" TO "account_id";

UPDATE "organization" o
SET "account_id" = r."account_id"
FROM "resource" r
WHERE r."id" = o."resource_id";

ALTER TABLE "organization" ALTER COLUMN "account_id" SET NOT NULL;

-- DropIndex
DROP INDEX "organization_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "organization_account_id_name_key" ON "organization"("account_id", "name");

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
