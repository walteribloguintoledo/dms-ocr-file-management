import https from "node:https";
import {
  readFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
  stat,
} from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { config } from "dotenv";
config({ path: resolve("scanner-bridge/.env") });
const run = promisify(execFile);
const executable = process.env.NAPS2_EXE;
const origins = (process.env.BRIDGE_ALLOWED_ORIGINS || "")
  .split(",")
  .filter(Boolean);
const tempRoot = resolve(
  process.env.BRIDGE_TEMP_DIR || join(tmpdir(), "folio-scanner"),
);
const maxBytes = Number(process.env.BRIDGE_MAX_MB || 100) * 1048576;
if (
  !executable ||
  !process.env.BRIDGE_TLS_CERT ||
  !process.env.BRIDGE_TLS_KEY ||
  !origins.length
)
  throw new Error(
    "Configure NAPS2_EXE, BRIDGE_TLS_CERT, BRIDGE_TLS_KEY and BRIDGE_ALLOWED_ORIGINS in scanner-bridge/.env.",
  );
await stat(executable);
await mkdir(tempRoot, { recursive: true });
let busy = false;
async function command(args) {
  return run(executable, args, {
    windowsHide: true,
    timeout: 180000,
    maxBuffer: 4 * 1048576,
  });
}
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes)
      throw new Error("Request exceeds the configured size limit.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
const server = https.createServer(
  {
    cert: await readFile(process.env.BRIDGE_TLS_CERT),
    key: await readFile(process.env.BRIDGE_TLS_KEY),
  },
  async (req, res) => {
    const origin = req.headers.origin;
    if (!origin || !origins.includes(origin)) {
      send(res, 403, { message: "Origin is not allowed." });
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Output-Format",
    );
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    let dir;
    try {
      if (req.method === "GET" && req.url === "/scanners") {
        const { stdout } = await command([
          "--listdevices",
          "--driver",
          "twain",
        ]);
        send(
          res,
          200,
          stdout
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter((s) => /fi-7180/i.test(s))
            .map((name) => ({ name })),
        );
        return;
      }
      if (req.method !== "POST" || !["/scan", "/convert"].includes(req.url)) {
        send(res, 404, { message: "Not found." });
        return;
      }
      if (busy) {
        send(res, 409, { message: "The scanner bridge is busy." });
        return;
      }
      busy = true;
      dir = await mkdtemp(join(tempRoot, "batch-"));
      if (req.url === "/scan") {
        if (req.headers["content-type"] !== "application/json")
          throw new Error("Expected application/json.");
        const options = JSON.parse((await body(req)).toString());
        if (
          ![150, 200, 300, 600].includes(options.dpi) ||
          !["A4", "Letter", "Legal"].includes(options.pageSize) ||
          !["Color", "Grayscale", "Black and white"].includes(options.color) ||
          typeof options.duplex !== "boolean"
        )
          throw new Error("Invalid scan settings.");
        const output = join(dir, "page.png");
        await command([
          "-o",
          output,
          "--noprofile",
          "--driver",
          "twain",
          "--device",
          "fi-7180",
          "--source",
          options.duplex ? "duplex" : "feeder",
          "--dpi",
          String(options.dpi),
          "--pagesize",
          options.pageSize.toLowerCase(),
          "--bitdepth",
          { Color: "color", Grayscale: "gray", "Black and white": "bw" }[
            options.color
          ],
          "--disableocr",
        ]);
        const files = (await readdir(dir))
          .filter((x) => x.endsWith(".png"))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        if (!files.length) throw new Error("The scanner returned no pages.");
        let total = 0;
        const pages = [];
        for (const file of files) {
          const content = await readFile(join(dir, file));
          total += content.length;
          if (total > maxBytes)
            throw new Error(
              "Scanned batch exceeds the configured size limit. Use a smaller batch.",
            );
          pages.push({
            dataUrl: `data:image/png;base64,${content.toString("base64")}`,
          });
        }
        send(res, 200, { pages });
      } else {
        const format = req.headers["x-output-format"];
        if (!["pdfa", "tiff", "jpg"].includes(format))
          throw new Error("Unsupported output format.");
        const input = await body(req);
        if (input.subarray(0, 5).toString() !== "%PDF-")
          throw new Error("Expected a PDF input.");
        if (
          format === "pdfa" &&
          (!process.env.VERAPDF_JAR || !process.env.JAVA_EXE)
        )
          throw new Error(
            "PDF/A requires JAVA_EXE and VERAPDF_JAR for compliance validation.",
          );
        const inputPath = join(dir, "input.pdf"),
          outputPath = join(
            dir,
            format === "pdfa" ? "output.pdf" : `output.${format}`,
          );
        await writeFile(inputPath, input);
        await command([
          "-i",
          inputPath,
          "-n",
          "0",
          "-o",
          outputPath,
          ...(format === "pdfa"
            ? ["--pdfcompat", "A2-b"]
            : format === "tiff"
              ? ["--tiffcomp", "lzw"]
              : ["--jpegquality", "95"]),
        ]);
        if (format === "pdfa") {
          const { stdout } = await run(
            process.env.JAVA_EXE,
            [
              "-jar",
              process.env.VERAPDF_JAR,
              "--format",
              "xml",
              "--flavour",
              "2b",
              outputPath,
            ],
            { windowsHide: true, timeout: 180000, maxBuffer: 8 * 1048576 },
          );
          if (
            !/isCompliant="true"/.test(stdout) ||
            /isCompliant="false"/.test(stdout)
          )
            throw new Error(
              "PDF/A compliance validation failed. No file was returned.",
            );
        }
        const outputs = (await readdir(dir))
          .filter((n) => n.startsWith("output"))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const files = [];
        for (const name of outputs) {
          const data = await readFile(join(dir, name));
          files.push({
            name,
            mimeType:
              format === "pdfa"
                ? "application/pdf"
                : format === "tiff"
                  ? "image/tiff"
                  : "image/jpeg",
            base64: data.toString("base64"),
            checksum: createHash("sha256").update(data).digest("hex"),
          });
        }
        send(res, 200, { files, pdfaValidated: format === "pdfa" });
      }
    } catch (error) {
      send(res, 400, { message: error.message || "Scanner operation failed." });
    } finally {
      if (dir) {
        const target = resolve(dir);
        if (target.startsWith(tempRoot + sep) && target !== tempRoot)
          await rm(target, { recursive: true, force: true }).catch(() => {});
        busy = false;
      }
    }
  },
);
server.requestTimeout = 240000;
server.listen(17483, "127.0.0.1", () =>
  console.log("Folio scanner bridge listening at https://localhost:17483"),
);
