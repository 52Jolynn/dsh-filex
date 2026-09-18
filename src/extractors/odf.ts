import * as path from "node:path";
import { readFile } from "node:fs/promises";
import { parsePackage } from "odf.js";
import {
  readOdtContent,
  readOdpContent,
  readOdsContent,
  readOdgContent,
} from "odf.js";

import type {
  OdfExtractResult,
  OdfFormat,
  OdfMetadata,
} from "../types.js";
import { odfDocumentToMarkdown } from "../util/markdown-adapter.js";

export class UnsupportedOdfExtension extends Error {
  constructor(public readonly ext: string) {
    super(`unsupported ODF extension: ${ext || "(none)"}`);
    this.name = "UnsupportedOdfExtension";
  }
}

const EXT_TO_FORMAT: Record<string, OdfFormat> = {
  ".odt": "odt",
  ".ods": "ods",
  ".odp": "odp",
  ".odg": "odg",
};

export function odfFormatFromExt(extOrPath: string): OdfFormat {
  const ext = extOrPath.startsWith(".")
    ? extOrPath.toLowerCase()
    : path.extname(extOrPath).toLowerCase();
  const format = EXT_TO_FORMAT[ext];
  if (!format) throw new UnsupportedOdfExtension(ext);
  return format;
}

/**
 * Read an ODF file and convert it to Markdown via `odf.js`.
 *
 * The `*Content` readers return the flat `ContentDocument` level (sections /
 * sheets / slides / pages + metadata) — the shape `odfDocumentToMarkdown`
 * walks. The plain `readOdt`/`readOds`/… variants return the hierarchical
 * `DocumentTree` (`children` groups), which does NOT match the adapter and
 * silently yields empty Markdown.
 */
export async function extractOdf(filePath: string): Promise<OdfExtractResult> {
  const format = odfFormatFromExt(path.extname(filePath));
  const bytes = new Uint8Array(await readFile(filePath));

  const pkg = parsePackage(bytes);
  let doc: ContentDocumentLike;
  switch (format) {
    case "odt":
      doc = readOdtContent(pkg) as unknown as ContentDocumentLike;
      break;
    case "odp":
      doc = readOdpContent(pkg) as unknown as ContentDocumentLike;
      break;
    case "ods":
      doc = readOdsContent(pkg) as unknown as ContentDocumentLike;
      break;
    case "odg":
      doc = readOdgContent(pkg) as unknown as ContentDocumentLike;
      break;
  }

  const markdown = odfDocumentToMarkdown({
    kind: format === "odt" ? "wordprocessing" : format === "ods" ? "spreadsheet" : format === "odp" ? "presentation" : "drawing",
    sections: doc.sections as never,
    sheets: doc.sheets as never,
    slides: doc.slides as never,
    pages: doc.pages as never,
  });

  const meta = doc.metadata;
  const metadata: OdfMetadata | undefined = meta
    ? {
        title: meta.title ?? undefined,
        creator: meta.creator ?? undefined,
      }
    : undefined;

  return {
    markdown,
    format,
    warning: markdown.length === 0 ? "ODF document parsed but produced no extractable text." : null,
    metadata,
  };
}

/** Minimal structural view of odf.js's flat `ContentDocument`. */
interface ContentDocumentLike {
  sections?: unknown[];
  sheets?: unknown[];
  slides?: unknown[];
  pages?: unknown[];
  metadata?: LayoutMetadataLike;
}

interface LayoutMetadataLike {
  title?: string;
  creator?: string;
}