import { Doc, Audit } from "./types";
const now = new Date();
const date = (days: number) =>
  new Date(now.getTime() - days * 86400000).toISOString();
export const demoDocuments: Doc[] = [
  [
    "Employment contract — Maria Santos",
    "HR-2026-0042",
    "Maria Santos",
    "EMP-0018",
    "Human Resources",
    "IN_REVIEW",
    0,
    "Contract",
  ],
  [
    "September payroll summary",
    "FIN-2026-0086",
    "Rafael Cruz",
    "EMP-0024",
    "Finance",
    "APPROVED",
    0,
    "Payroll",
  ],
  [
    "Equipment purchase request",
    "OPS-2026-0031",
    "Angela Reyes",
    "EMP-0036",
    "Operations",
    "UPLOADED",
    0,
    "Purchase request",
  ],
  [
    "Employee information sheet",
    "HR-2026-0041",
    "Jose Mendoza",
    "EMP-0042",
    "Human Resources",
    "ARCHIVED",
    1,
    "Employee record",
  ],
  [
    "Supplier service agreement",
    "LEG-2026-0019",
    "Isabel Garcia",
    "EMP-0011",
    "Legal",
    "IN_REVIEW",
    1,
    "Agreement",
  ],
  [
    "Annual performance review",
    "HR-2026-0040",
    "Paolo Ramos",
    "EMP-0027",
    "Human Resources",
    "APPROVED",
    2,
    "Performance review",
  ],
  [
    "Office maintenance report",
    "OPS-2026-0030",
    "Carlo Villanueva",
    "EMP-0033",
    "Operations",
    "ARCHIVED",
    3,
    "Report",
  ],
].map((d, i) => ({
  id: `demo-${i}`,
  title: String(d[0]),
  documentNumber: String(d[1]),
  status: d[5] as Doc["status"],
  createdAt: date(Number(d[6])),
  updatedAt: date(Number(d[6])),
  source: "SCANNER",
  mimeType: "application/pdf",
  fileSize: (i + 2) * 184230,
  description: "Sample document for exploring the document workflow.",
  checksum: "",
  ocrText:
    "This is sample OCR text. Imported and scanned documents contain the extracted page text.",
  tags: [String(d[7])],
  metadata: {
    department: String(d[4]),
    documentType: String(d[7]),
    confidentiality: "Internal",
    documentDate: date(Number(d[6])).slice(0, 10),
  },
  versions: [{ id: `v-${i}`, version: 1, createdAt: date(Number(d[6])) }],
}));
export const demoAudits: Audit[] = demoDocuments
  .slice(0, 5)
  .map((d, i) => ({
    id: `audit-${i}`,
    action:
      i === 0
        ? "DOCUMENT_UPLOADED"
        : i === 1
          ? "DOCUMENT_APPROVED"
          : "SCAN_COMPLETED",
    createdAt: d.createdAt,
    actor: { name: "Demo administrator" },
    details: { title: d.title },
  }));
