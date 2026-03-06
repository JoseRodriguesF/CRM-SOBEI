-- Migration: add_services_and_multi_cnpj
-- Removes old UnitCNPJ table, updates Invoice.service -> serviceName + serviceId,
-- updates Service model with contractNumber + createdAt,
-- adds Unit.cnpjs (JSON text field)

-- CreateTable Service
CREATE TABLE IF NOT EXISTS "Service" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL DEFAULT '',
    "unitId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey Service -> Unit
ALTER TABLE "Service" 
  ADD CONSTRAINT "Service_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable Invoice: rename service -> serviceName, add serviceId
ALTER TABLE "Invoice" 
  DROP COLUMN IF EXISTS "service",
  ADD COLUMN IF NOT EXISTS "serviceId" INTEGER,
  ADD COLUMN IF NOT EXISTS "serviceName" TEXT;

-- AlterTable Service: replace contract -> contractNumber, add createdAt
ALTER TABLE "Service" 
  DROP COLUMN IF EXISTS "contract",
  ADD COLUMN IF NOT EXISTS "contractNumber" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable Unit: add cnpjs JSON text field
ALTER TABLE "Unit" 
  ADD COLUMN IF NOT EXISTS "cnpjs" TEXT;

-- AddForeignKey Invoice -> Service
ALTER TABLE "Invoice" 
  ADD CONSTRAINT "Invoice_serviceId_fkey" 
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
