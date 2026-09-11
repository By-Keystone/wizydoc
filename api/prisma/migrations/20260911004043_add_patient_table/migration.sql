-- CreateTable
CREATE TABLE "patient" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_account_id_document_number_idx" ON "patient"("account_id", "document_number");

-- AddForeignKey
ALTER TABLE "patient" ADD CONSTRAINT "patient_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
