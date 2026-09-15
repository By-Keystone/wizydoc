-- Las cuotas de plan filtran por cuenta, y ninguna de las dos tablas tenía
-- índice por `account_id`: Postgres no lo crea solo para las claves foráneas.

-- CreateIndex
CREATE INDEX "resource_account_id_type_idx" ON "resource"("account_id", "type");

-- CreateIndex
CREATE INDEX "user_resource_membership_account_id_role_idx" ON "user_resource_membership"("account_id", "role");
