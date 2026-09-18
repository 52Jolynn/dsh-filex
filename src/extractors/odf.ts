import * as path from "node:path";
import { readFile } from "node:fs/promises";
import { parsePackage } from "odf.js";
import {
  readOdt,
  readOdp,
  readOds,
  readOdg,
} from "odf.js";

import type { DocumentTree as OdfDocument } from "document-schema.js";

import type {
  OdfExtractResult,
  OdfFormat,
  OdfMetadata,
} from "../types.js";
import { odfDocumentToMarkdown } from "../util/markdown-adapter.js";
import type { OdfKind } from "../util/markdown-adapter.js";

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
 * The reader returns a `DocumentTree` whose `kind` discriminates the four
 * ODF formats. We hand the tree straight to `odfDocumentToMarkdown`, which
 * walks whichever child collection the kind exposes (sections / sheets /
 * slides / pages) and emits Markdown accordingly.
 */
export async function extractOdf(filePath: string): Promise<OdfExtractResult> {
  const format = odfFormatFromExt(path.extname(filePath));
  const bytes = new Uint8Array(await readFile(filePath));

  const pkg = parsePackage(bytes);
  let tree: OdfDocument;
  switch (format) {
    case "odt":
      tree = readOdt(pkg) as unknown as OdfDocument;
      break;
    case "odp":
      tree = readOdp(pkg) as unknown as OdfDocument;
      break;
    case "ods":
      tree = readOds(pkg) as unknown as OdfDocument;
      break;
    case "odg":
      tree = readOdg(pkg) as unknown as OdfDocument;
      break;
  }

  const markdown = odfDocumentToMarkdown({
    kind: tree.kind as OdfKind,
    sections: (tree as unknown as { sections?: unknown }).sections as never,
    sheets: (tree as unknown as { sheets?: unknown }).sheets as never,
    slides: (tree as unknown as { slides?: unknown }).slides as never,
    pages: (tree as unknown as { pages?: unknown }).pages as never,
  });

  const meta = (tree as unknown as { metadata?: LayoutMetadataLike }).metadata;
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

interface LayoutMetadataLike {
  title?: string;
  creator?: string;
}