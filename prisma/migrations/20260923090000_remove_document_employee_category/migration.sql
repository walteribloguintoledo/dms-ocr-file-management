ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_categoryId_fkey";
DROP INDEX IF EXISTS "Document_employeeId_idx";
DROP INDEX IF EXISTS "Document_categoryId_idx";
ALTER TABLE "Document" DROP COLUMN "categoryId", DROP COLUMN "employeeId", DROP COLUMN "employeeName";
UPDATE "Document" SET "metadata" = "metadata" - 'categoryId' - 'employeeId' - 'employeeName' - 'EmployeeName'
WHERE "metadata" ?| ARRAY['categoryId','employeeId','employeeName','EmployeeName'];
