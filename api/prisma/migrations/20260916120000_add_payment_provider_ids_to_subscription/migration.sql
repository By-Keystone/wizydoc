-- AlterTable
ALTER TABLE "subscription"
  ADD COLUMN "payment_provider_customer_id" TEXT,
  ADD COLUMN "payment_provider_card_id" TEXT,
  ADD COLUMN "payment_provider_subscription_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payment_provider_subscription_id_key" ON "subscription"("payment_provider_subscription_id");
