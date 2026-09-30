ALTER TABLE "DocumentType" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Category" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
INSERT INTO "Category" ("id","name")
SELECT gen_random_uuid()::text, name FROM (VALUES ('Human Resources'),('Executive'),('Technical Department'),('Software Department'),('Sales Department'),('Finance'),('Operations'),('Legal')) AS defaults(name)
WHERE NOT EXISTS (SELECT 1 FROM "Category" c WHERE lower(c.name)=lower(defaults.name));
