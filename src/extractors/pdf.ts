import { readFile } from "node:fs/promises";

import { analyzePdfType } from "pdf-efficient-loader";

import type { PdfExtractResult, PdfType } from "../types.js";
import { getPdfOxide } from "../util/wasm-init.js";

const SCAN_WARNING =
  "PDF is scanned/image-based; no text layer to extract. Run an OCR pass first " +
  "(e.g. via vision_ground) and retry.";

/**
 * Classify a PDF and, when it contains a usable text layer, extract Markdown.
 *
 * Classification uses `pdf-efficient-loader` (pure JS, pdfjs-dist based —
 * replaces @firecrawl/pdf-inspector-wasm, whose wasm glue crashed the Node
 * process with a fatal OOM during exit teardown):
 *   - scan            → `{markdown: null, pdf_type: "Scanned", warning}` (domain
 *     signal, not an error — the model can branch on `pdf_type`).
 *   - text / vector   → extract Markdown via pdf-oxide-wasm. Vector PDFs carry
 *     a real text layer, so they extract fine.
 *
 * Note: the previous inspector also detected per-page "Mixed" documents and
 * reported `pages_needing_ocr`; pdf-efficient-loader only classifies the whole
 * document, so mixed text/scanned PDFs degrade to TextBased and scanned pages
 * are silently skipped by the text extractor.
 */
export async function extractPdf(filePath: string): Promise<PdfExtractResult> {
  const analysis = await analyzePdfType(filePath);
  const pdfType: PdfType = analysis.type === "scan" ? "Scanned" : "TextBased";

  if (pdfType === "Scanned") {
    return {
      markdown: null,
      pdf_type: pdfType,
      warning: SCAN_WARNING,
      page_count: analysis.stats.totalPages,
    };
  }

  const bytes = new Uint8Array(await readFile(filePath));
  const pdfOxide = await getPdfOxide();
  const doc = new pdfOxide.WasmPdfDocument(bytes);
  try {
    const markdown = doc.toMarkdownAll();
    const pageCount = doc.pageCount();
    return {
      markdown,
      pdf_type: pdfType,
      warning: null,
      page_count: pageCount,
    };
  } finally {
    doc.free();
  }
}
