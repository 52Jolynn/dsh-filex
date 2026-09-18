import * as path from "node:path";
import { readFile } from "node:fs/promises";

import type { OfficeFormat, OfficeExtractResult } from "../types.js";
import { getOfficeWasm } from "../util/wasm-init.js";

export class UnsupportedOfficeExtension extends Error {
  constructor(public readonly ext: string) {
    super(`unsupported office extension: ${ext || "(none)"}`);
    this.name = "UnsupportedOfficeExtension";
  }
}

const EXT_TO_FORMAT: Record<string, OfficeFormat> = {
  ".docx": "docx",
  ".xlsx": "xlsx",
  ".pptx": "pptx",
  ".doc": "doc",
  ".xls": "xls",
  ".ppt": "ppt",
};

export function officeFormatFromExt(extOrPath: string): OfficeFormat {
  const ext = extOrPath.startsWith(".") ? extOrPath.toLowerCase() : path.extname(extOrPath).toLowerCase();
  const format = EXT_TO_FORMAT[ext];
  if (!format) throw new UnsupportedOfficeExtension(ext);
  return format;
}

/**
 * Read an Office document from disk and return its Markdown.
 *
 * Uses office-oxide-wasm under the hood. The WASM document is freed in a
 * `try/finally` even when `toMarkdown` throws — leaks here would pin memory
 * for the lifetime of the host process.
 */
export async function extractOffice(
  filePath: string,
): Promise<OfficeExtractResult> {
  const formatRequested = officeFormatFromExt(path.extname(filePath));
  const bytes = new Uint8Array(await readFile(filePath));

  const { WasmDocument } = await getOfficeWasm();
  const doc = new WasmDocument(bytes, formatRequested);
  try {
    const formatDetected = doc.formatName() as OfficeFormat;
    const markdown = doc.toMarkdown();
    return {
      markdown,
      format: formatDetected,
      format_requested: formatRequested,
      warning: null,
    };
  } finally {
    doc.free();
  }
}