CREATE TABLE "DocumentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentType_name_key" ON "DocumentType"("name");
CREATE UNIQUE INDEX "DocumentType_name_casefold_key" ON "DocumentType"(lower("name"));
INSERT INTO "DocumentType" ("id", "name") VALUES
('default-201-files', '201 Files'),
('default-resume', 'Resume'),
('default-nbi', 'NBI Clearance'),
('default-police', 'Police Clearance'),
('default-medical', 'Medical Certificate'),
('default-sss', 'SSS Documents'),
('default-philhealth', 'PhilHealth Documents'),
('default-pagibig', 'Pag-ibig Documents'),
('default-psa', 'PSA (Birth Certificate)'),
('default-passport', 'Passport');
