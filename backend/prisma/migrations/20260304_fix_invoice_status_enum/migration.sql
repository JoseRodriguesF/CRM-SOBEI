-- Fix InvoiceStatus enum to match Prisma schema (PAGA, ABERTA)

-- Create new enum type with correct values
CREATE TYPE "InvoiceStatus_new" AS ENUM ('PAGA', 'ABERTA');

-- Cast existing invoice status column to text, then to new enum
ALTER TABLE "Invoice" 
  ALTER COLUMN "status" TYPE TEXT;

-- Map old status values to new ones
UPDATE "Invoice" SET "status" = 'ABERTA' WHERE "status" IN ('PENDENTE', 'ATRASADA', 'ABERTA');

-- Cast back to the new enum type
ALTER TABLE "Invoice" 
  ALTER COLUMN "status" TYPE "InvoiceStatus_new" USING "status"::"InvoiceStatus_new";

-- Drop old enum type
DROP TYPE "InvoiceStatus";

-- Rename new enum to original name
ALTER TYPE "InvoiceStatus_new" RENAME TO "InvoiceStatus";
