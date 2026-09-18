import { readFile } from "node:fs/promises";

import type { PdfExtractResult, PdfType } from "../types.js";
import { getPdfInspector, getPdfOxide } from "../util/wasm-init.js";

const SCANNED_TYPES: ReadonlySet<string> = new Set(["Scanned", "ImageBased"]);

function normalisePdfType(raw: string): PdfType {
  switch (raw) {
    case "TextBased":
    case "Scanned":
    case "ImageBased":
    case "Mixed":
      return raw;
    default:
      return "Unknown";
  }
}

const SCAN_WARNING =
  "PDF is scanned/image-based; no text layer to extract. Run an OCR pass first " +
  "(e.g. via vision_ground) and retry.";

/**
 * Classify a PDF and, when it contains a usable text layer, extract Markdown.
 *
 * Decision tree:
 *   - Scanned / ImageBased  → return `{markdown: null, warning}` (domain signal,
 *     not an error — the model can branch on `pdf_type`).
 *   - Mixed                 → prefer pdf-inspector's own markdown when present
 *     (better table/heading detection than the rust fallback), otherwise fall
 *     back to pdf-oxide-wasm. Always include a `warning` listing the OCR-only
 *     pages so the caller knows the extraction is partial.
 *   - TextBased / Unknown   → use pdf-oxide-wasm; warn on `Unknown` because
 *     `processPdf` couldn't categorise the file confidently.
 */
export async function extractPdf(filePath: string): Promise<PdfExtractResult> {
  const bytes = new Uint8Array(await readFile(filePath));

  const inspector = await getPdfInspector();
  const classification = inspector.processPdf(bytes);
  const pdfType = normalisePdfType(classification.pdfType);

  if (SCANNED_TYPES.has(pdfType)) {
    return {
      markdown: null,
      pdf_type: pdfType,
      warning: SCAN_WARNING,
      page_count: undefined,
    };
  }

  // Mixed: prefer inspector's own markdown (better structure), fall back to pdf-oxide.
  if (pdfType === "Mixed") {
    if (typeof classification.markdown === "string" && classification.markdown.length > 0) {
      const ocrPages = classification.pages_needing_ocr;
      const warning =
        ocrPages && ocrPages.length > 0
          ? `Mixed PDF: pages [${ocrPages.join(", ")}] have no text layer and were skipped.`
          : null;
      return {
        markdown: classification.markdown,
        pdf_type: "Mixed",
        warning,
        page_count: undefined,
      };
    }
    // Fall through to pdf-oxide extraction below; if even that fails, return domain-level null.
  }

  const pdfOxide = await getPdfOxide();
  const doc = new pdfOxide.WasmPdfDocument(bytes);
  try {
    const markdown = doc.toMarkdownAll();
    const pageCount = doc.pageCount();
    return {
      markdown,
      pdf_type: pdfType,
      warning: pdfType === "Unknown" ? "PDF type could not be classified confidently; extraction is best-effort." : null,
      page_count: pageCount,
    };
  } finally {
    doc.free();
  }
}