import { Page } from "./types";
import {
  PDFDocument,
  StandardFonts,
  TextRenderingMode,
  pushGraphicsState,
  popGraphicsState,
  setTextRenderingMode,
} from "pdf-lib";
export async function imagePage(url: string): Promise<Page> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 100;
  canvas.height = 100;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 100, 100);
  ctx.drawImage(img, 0, 0, 100, 100);
  const pixels = ctx.getImageData(0, 0, 100, 100).data;
  let dark = 0;
  for (let i = 0; i < pixels.length; i += 4)
    if ((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3 < 235) dark++;
  return {
    id: crypto.randomUUID(),
    url,
    width: img.naturalWidth,
    height: img.naturalHeight,
    rotation: 0,
    blank: dark / 10000 < 0.002,
    text: "",
  };
}
export async function importPages(file: File): Promise<Page[]> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const loading = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const pdf = await loading.promise;
    const pages: Page[] = [];
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.8 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({
          canvas,
          canvasContext: canvas.getContext("2d")!,
          viewport,
        }).promise;
        pages.push(await imagePage(canvas.toDataURL("image/jpeg", 0.94)));
      }
    } finally {
      await loading.destroy();
    }
    return pages;
  }
  if (/\.tiff?$/i.test(file.name)) {
    const UTIF = await import("utif");
    const buffer = await file.arrayBuffer();
    const ifds = UTIF.decode(buffer);
    return Promise.all(
      ifds.map(async (ifd: any) => {
        UTIF.decodeImage(buffer, ifd);
        const rgba = UTIF.toRGBA8(ifd);
        const canvas = document.createElement("canvas");
        canvas.width = ifd.width;
        canvas.height = ifd.height;
        canvas
          .getContext("2d")!
          .putImageData(
            new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height),
            0,
            0,
          );
        return imagePage(canvas.toDataURL("image/png"));
      }),
    );
  }
  const url = URL.createObjectURL(file);
  try {
    const page = await imagePage(url);
    const canvas = document.createElement("canvas");
    canvas.width = page.width;
    canvas.height = page.height;
    const img = new Image();
    img.src = url;
    await img.decode();
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    return [{ ...page, url: canvas.toDataURL("image/png") }];
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function rasterize(
  page: Page,
  crop?: { x: number; y: number; width: number; height: number },
): Promise<Page> {
  const img = new Image();
  img.src = page.url;
  await img.decode();
  const canvas = document.createElement("canvas");
  const sideways = page.rotation % 180 !== 0;
  canvas.width = sideways ? page.height : page.width;
  canvas.height = sideways ? page.width : page.height;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((page.rotation * Math.PI) / 180);
  ctx.drawImage(img, -page.width / 2, -page.height / 2);
  if (crop) {
    const target = document.createElement("canvas");
    target.width = (canvas.width * crop.width) / 100;
    target.height = (canvas.height * crop.height) / 100;
    target
      .getContext("2d")!
      .drawImage(
        canvas,
        (canvas.width * crop.x) / 100,
        (canvas.height * crop.y) / 100,
        target.width,
        target.height,
        0,
        0,
        target.width,
        target.height,
      );
    return imagePage(target.toDataURL("image/png"));
  }
  return { ...(await imagePage(canvas.toDataURL("image/png"))), id: page.id };
}
export async function generatePdf(pages: Page[], size: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const dimensions: Record<string, [number, number]> = {
    A4: [595.28, 841.89],
    Letter: [612, 792],
    Legal: [612, 1008],
  };
  for (const original of pages) {
    const p = original.rotation ? await rasterize(original) : original;
    const page = pdf.addPage(dimensions[size] || dimensions.A4);
    const image = p.url.startsWith("data:image/jpeg")
      ? await pdf.embedJpg(p.url)
      : await pdf.embedPng(p.url);
    const scale = Math.min(
      page.getWidth() / p.width,
      page.getHeight() / p.height,
    );
    const w = p.width * scale,
      h = p.height * scale,
      x = (page.getWidth() - w) / 2,
      y = (page.getHeight() - h) / 2;
    page.drawImage(image, { x, y, width: w, height: h });
    if (original.text) {
      page.pushOperators(
        pushGraphicsState(),
        setTextRenderingMode(TextRenderingMode.Invisible),
      );
      const words = original.words || [];
      if (words.length && !original.rotation) {
        for (const word of words) {
          const text = word.text.replace(/[^\x20-\x7e]/g, "");
          if (text)
            page.drawText(text, {
              x: x + word.bbox.x0 * scale,
              y: y + h - word.bbox.y1 * scale,
              size: Math.max(1, (word.bbox.y1 - word.bbox.y0) * scale * 0.85),
              font,
            });
        }
      } else {
        const lines =
          original.text.replace(/[^\x20-\x7e\n]/g, "").match(/.{1,90}/g) || [];
        lines
          .slice(0, 100)
          .forEach((line, i) =>
            page.drawText(line, {
              x: 20,
              y: page.getHeight() - 25 - i * 7,
              size: 6,
              font,
            }),
          );
      }
      page.pushOperators(popGraphicsState());
    }
  }
  pdf.setProducer("Folio DMS");
  pdf.setCreationDate(new Date());
  const bytes = await pdf.save();
  const buffer = new Uint8Array(bytes).buffer;
  const checksum = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  return {
    blob: new Blob([buffer], { type: "application/pdf" }),
    checksum,
    ocrText: pages
      .map((p, i) => `--- Page ${i + 1} ---\n${p.text}`)
      .join("\n\n"),
  };
}
