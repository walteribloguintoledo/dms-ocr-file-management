export type Status = "UPLOADED" | "IN_REVIEW" | "APPROVED" | "ARCHIVED";
export type Role = "ADMIN" | "ENCODER" | "REVIEWER" | "READ_ONLY";
export type Doc = {
  id: string;
  documentNumber: string;
  title: string;
  description: string;
  categoryId?: string;
  employeeId: string;
  employeeName: string;
  status: Status;
  source: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
  ocrText: string;
  tags: string[];
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  versions?: { id: string; version: number; createdAt: string }[];
  audits?: Audit[];
};
export type Audit = {
  id: string;
  action: string;
  createdAt: string;
  actor?: { name: string };
  details?: unknown;
};
export type Page = {
  id: string;
  url: string;
  width: number;
  height: number;
  rotation: number;
  blank: boolean;
  text: string;
  words?: {
    text: string;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }[];
};
export type Settings = {
  apiUrl: string;
  scanner: string;
  bridgeUrl: string;
  dpi: string;
  color: string;
  duplex: boolean;
  pageSize: string;
  language: string;
  pdfa: boolean;
  removeBlank: boolean;
  autoUpload: boolean;
  retryCount: number;
  tempLocation: string;
  logLevel: string;
  maxFileMb: number;
};
export const defaultSettings: Settings = {
  apiUrl:
    process.env.NEXT_PUBLIC_DMS_API_URL ||
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:4000/api" : ""),
  scanner: "Fujitsu fi-7180",
  bridgeUrl: "https://localhost:17483",
  dpi: "300",
  color: "Color",
  duplex: true,
  pageSize: "A4",
  language: "eng",
  pdfa: false,
  removeBlank: false,
  autoUpload: false,
  retryCount: 3,
  tempLocation: "Managed by scanner bridge",
  logLevel: "Info",
  maxFileMb: 50,
};
