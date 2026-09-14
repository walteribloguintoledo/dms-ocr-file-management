export type Role = "ADMIN" | "ENCODER" | "REVIEWER" | "READ_ONLY";
export type Status = "UPLOADED" | "IN_REVIEW" | "APPROVED" | "ARCHIVED";
export function canTransition(role: Role, from: Status, to: Status) {
  return (
    (from === "UPLOADED" &&
      to === "IN_REVIEW" &&
      ["ADMIN", "ENCODER"].includes(role)) ||
    (from === "IN_REVIEW" &&
      to === "APPROVED" &&
      ["ADMIN", "REVIEWER"].includes(role)) ||
    (from === "APPROVED" &&
      to === "ARCHIVED" &&
      ["ADMIN", "REVIEWER"].includes(role))
  );
}
export function validateFile(
  name: string,
  mime: string,
  size: number,
  maxBytes: number,
) {
  const ext = name.split(".").pop()?.toLowerCase();
  const types: Record<string, string[]> = {
    pdf: ["application/pdf"],
    jpg: ["image/jpeg"],
    jpeg: ["image/jpeg"],
    tif: ["image/tiff"],
    tiff: ["image/tiff"],
  };
  return (
    !!ext &&
    !!types[ext]?.includes(mime) &&
    Number.isSafeInteger(size) &&
    size > 0 &&
    size <= maxBytes
  );
}
export function matchesMagic(bytes: Uint8Array, mime: string) {
  const b = bytes;
  return mime === "application/pdf"
    ? Buffer.from(b.subarray(0, 5)).toString() === "%PDF-"
    : mime === "image/jpeg"
      ? b[0] === 255 && b[1] === 216 && b[2] === 255
      : mime === "image/tiff"
        ? (b[0] === 73 && b[1] === 73 && b[2] === 42 && b[3] === 0) ||
          (b[0] === 77 && b[1] === 77 && b[2] === 0 && b[3] === 42)
        : false;
}
export function canRead(
  role: Role,
  userId: string,
  doc: { createdBy: string; metadata: unknown },
) {
  const confidential = (doc.metadata as any)?.confidentiality;
  return (
    role === "ADMIN" ||
    role === "REVIEWER" ||
    doc.createdBy === userId ||
    !["Confidential", "Restricted"].includes(confidential)
  );
}
