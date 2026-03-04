-- Migration: add_services_and_multi_cnpj
-- Removes old UnitCNPJ table, updates Invoice.service -> serviceName + serviceId,
-- updates Service model with contractNumber + createdAt,
-- adds Unit.cnpjs (JSON text field)

-- DropForeignKey (UnitCNPJ)
ALTER TABLE "UnitCNPJ" DROP CONSTRAINT IF EXISTS "UnitCNPJ_unitId_fkey";

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

-- DropTable UnitCNPJ
DROP TABLE IF EXISTS "UnitCNPJ";

-- AddForeignKey Invoice -> Service
ALTER TABLE "Invoice" 
  ADD CONSTRAINT "Invoice_serviceId_fkey" 
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
