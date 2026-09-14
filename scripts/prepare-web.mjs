import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(resolve(root, "apps/web/public"), { recursive: true });
const worker = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs", {
  paths: [resolve(root, "apps/web")],
});
await copyFile(worker, resolve(root, "apps/web/public/pdf.worker.min.mjs"));
