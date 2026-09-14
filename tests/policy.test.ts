import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canRead,
  canTransition,
  matchesMagic,
  validateFile,
} from "../apps/api/src/policy";
test("only authorized forward workflow transitions are accepted", () => {
  assert.equal(canTransition("ENCODER", "UPLOADED", "IN_REVIEW"), true);
  assert.equal(canTransition("ENCODER", "IN_REVIEW", "APPROVED"), false);
  assert.equal(canTransition("REVIEWER", "IN_REVIEW", "APPROVED"), true);
  assert.equal(canTransition("ADMIN", "UPLOADED", "ARCHIVED"), false);
  assert.equal(canTransition("READ_ONLY", "APPROVED", "ARCHIVED"), false);
  assert.equal(canTransition("ADMIN", "ARCHIVED", "UPLOADED"), false);
});
test("file validation rejects mismatched MIME, disallowed extensions, and oversized files", () => {
  assert.equal(validateFile("a.pdf", "application/pdf", 100, 1000), true);
  assert.equal(validateFile("a.exe", "application/pdf", 100, 1000), false);
  assert.equal(validateFile("a.pdf", "image/jpeg", 100, 1000), false);
  assert.equal(validateFile("a.pdf", "application/pdf", 1001, 1000), false);
  assert.equal(validateFile("a.pdf", "application/pdf", 0, 1000), false);
  assert.equal(validateFile("a.TIFF", "image/tiff", 500, 1000), true);
});
test("magic-byte verification catches disguised content", () => {
  assert.equal(matchesMagic(Buffer.from("%PDF-1.7"), "application/pdf"), true);
  assert.equal(matchesMagic(Buffer.from("<script>"), "application/pdf"), false);
  assert.equal(
    matchesMagic(Uint8Array.from([255, 216, 255]), "image/jpeg"),
    true,
  );
  assert.equal(
    matchesMagic(Uint8Array.from([73, 73, 42, 0]), "image/tiff"),
    true,
  );
});
test("confidential documents are hidden from unrelated encoders and readers", () => {
  const doc = {
    createdBy: "owner",
    metadata: { confidentiality: "Restricted" },
  };
  assert.equal(canRead("READ_ONLY", "other", doc), false);
  assert.equal(canRead("ENCODER", "owner", doc), true);
  assert.equal(canRead("REVIEWER", "other", doc), true);
  assert.equal(canRead("ADMIN", "other", doc), true);
  assert.equal(
    canRead("READ_ONLY", "other", {
      ...doc,
      metadata: { confidentiality: "Internal" },
    }),
    true,
  );
});
