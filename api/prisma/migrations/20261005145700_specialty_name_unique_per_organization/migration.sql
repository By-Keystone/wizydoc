-- DropIndex
DROP INDEX "specialty_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "specialty_organization_id_name_key" ON "specialty"("organization_id", "name");
