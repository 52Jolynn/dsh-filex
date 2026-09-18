/**
 * Markdown adapters for XHTML (epub) and ODF typed documents (odt/ods/odp/odg).
 *
 * No third-party markdown library is used: each adapter is a small visitor
 * that walks the source tree and emits CommonMark-ish text. Keeping the
 * transformation in-tree prevents the extractor layer from depending on a
 * heavyweight markdown toolchain.
 *
 * The output is deliberately line-oriented: headings, paragraphs, list items,
 * and table rows each end with a blank line so downstream renderers (LLMs,
 * preview panes) can split on `\n\n` without extra massaging.
 *
 * ODF note: `document-schema.js` represents headings and lists as ordinary
 * `ContentParagraph` with `level` (heading) and `listMembership` (list) side
 * fields. We inspect those side fields to render headings and bullet items.
 */

import { parseDocument } from "htmlparser2";
import type { Element, Node } from "domhandler";

// ============================================================================
// XHTML → Markdown (used by epub)
// ============================================================================

export function xhtmlToMarkdown(xhtml: string): string {
  const dom = parseDocument(xhtml, { xmlMode: true, decodeEntities: true });
  const lines: string[] = [];

  for (const node of dom.children) {
    visitXhtml(node, lines, 0);
  }

  return lines
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function visitXhtml(node: Node, out: string[], listDepth: number): void {
  if (isText(node)) {
    const text = node.data;
    if (text && text.trim().length > 0) {
      appendInline(out, text);
    }
    return;
  }
  if (node.type !== "tag") return;
  const el = node as Element;
  const tag = el.name.toLowerCase();

  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Number(tag[1]);
      out.push("");
      const buf: string[] = [];
      for (const child of el.children) visitXhtml(child, buf, listDepth);
      out.push("#".repeat(level) + " " + buf.join("").trim());
      out.push("");
      return;
    }
    case "p": {
      out.push("");
      const buf: string[] = [];
      for (const child of el.children) visitXhtml(child, buf, listDepth);
      const text = buf.join("").trim();
      if (text) out.push(text);
      out.push("");
      return;
    }
    case "br": {
      appendInline(out, "\n");
      return;
    }
    case "strong":
    case "b": {
      const buf: string[] = [];
      for (const child of el.children) visitXhtml(child, buf, listDepth);
      const inner = buf.join("").trim();
      if (inner) appendInline(out, `**${inner}**`);
      return;
    }
    case "em":
    case "i": {
      const buf: string[] = [];
      for (const child of el.children) visitXhtml(child, buf, listDepth);
      const inner = buf.join("").trim();
      if (inner) appendInline(out, `*${inner}*`);
      return;
    }
    case "a": {
      const href = (el.attribs?.href ?? "").trim();
      const buf: string[] = [];
      for (const child of el.children) visitXhtml(child, buf, listDepth);
      const inner = buf.join("").trim();
      if (href && inner) appendInline(out, `[${inner}](${href})`);
      else if (inner) appendInline(out, inner);
      return;
    }
    case "ul":
    case "ol": {
      out.push("");
      let i = 1;
      for (const child of el.children) {
        if (isTagNamed(child, "li")) {
          const prefix = tag === "ol" ? `${i}. ` : "- ";
          const indent = "  ".repeat(listDepth);
          const buf: string[] = [];
          for (const grand of (child as Element).children) {
            visitXhtml(grand, buf, listDepth + 1);
          }
          const joined = buf.join("").trim();
          if (joined) {
            const lines = joined.split("\n");
            out.push(indent + prefix + lines[0]);
            for (const l of lines.slice(1)) out.push(indent + "  " + l);
          }
          i++;
        }
      }
      out.push("");
      return;
    }
    case "table": {
      out.push("");
      renderXhtmlTable(el, out);
      out.push("");
      return;
    }
    case "img":
    case "script":
    case "style":
    case "head":
    case "nav":
    case "title":
      return;
    default: {
      for (const child of el.children) visitXhtml(child, out, listDepth);
    }
  }
}

function renderXhtmlTable(el: Element, out: string[]): void {
  const rows: string[][] = [];
  for (const child of el.children) {
    if (!isTag(child)) continue;
    const tag = (child as Element).name.toLowerCase();
    if (tag === "thead" || tag === "tbody" || tag === "tfoot") {
      for (const sub of (child as Element).children) {
        if (isTagNamed(sub, "tr")) rows.push(extractRowCells(sub as Element));
      }
    } else if (tag === "tr") {
      rows.push(extractRowCells(child as Element));
    }
  }
  if (rows.length === 0) return;
  const colCount = Math.max(...rows.map((r) => r.length));
  for (const row of rows) while (row.length < colCount) row.push("");
  const header = rows[0]!;
  out.push("| " + header.map(escapeCell).join(" | ") + " |");
  out.push("| " + header.map(() => "---").join(" | ") + " |");
  for (const row of rows.slice(1)) {
    out.push("| " + row.map(escapeCell).join(" | ") + " |");
  }
}

function extractRowCells(tr: Element): string[] {
  const cells: string[] = [];
  for (const child of tr.children) {
    if (!isTagNamed(child, "td") && !isTagNamed(child, "th")) continue;
    const buf: string[] = [];
    for (const grand of (child as Element).children) {
      visitXhtml(grand, buf, 0);
    }
    cells.push(buf.join("").replace(/\s+/g, " ").trim());
  }
  return cells;
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function appendInline(out: string[], fragment: string): void {
  if (out.length === 0) {
    out.push(fragment);
    return;
  }
  const last = out[out.length - 1]!;
  if (/^#+\s*$/.test(last)) {
    out[out.length - 1] = last + fragment;
    return;
  }
  out[out.length - 1] = last + fragment;
}

function isText(node: Node): node is Node & { data: string } {
  // domhandler exposes `data` on DataNode (Text/Comment/CDATA); on the abstract
  // Node it's missing from the type. Cast through `unknown` so we can read the
  // text without TypeScript blocking us.
  return (
    node.type === "text" &&
    typeof (node as unknown as { data?: unknown }).data === "string"
  );
}

function isTag(node: Node): node is Element {
  return node.type === "tag";
}

function isTagNamed(node: Node, name: string): boolean {
  return isTag(node) && (node as Element).name.toLowerCase() === name;
}

// ============================================================================
// ODF typed document → Markdown (used by extractors/odf.ts)
// ============================================================================

import type {
  ContentBlock,
  ContentDocument,
  ContentDrawPage,
  ContentParagraph,
  ContentRun,
  ContentSection,
  ContentShape,
  ContentSheet,
  ContentSlide,
  ContentTable,
  ContentTableCell,
  ContentTableRow,
  ContentVector,
} from "document-schema.js";

export type OdfKind = "wordprocessing" | "spreadsheet" | "presentation" | "drawing";

/** Shape covering all four document kinds after a quick duck-typed discrimination. */
export interface OdfLikeDocument {
  kind: OdfKind;
  sections?: ContentSection[];
  sheets?: ContentSheet[];
  slides?: ContentSlide[];
  pages?: ContentDrawPage[];
}

export function odfDocumentToMarkdown(doc: OdfLikeDocument): string {
  switch (doc.kind) {
    case "wordprocessing":
      return doc.sections ? wordprocessingToMarkdown(doc.sections) : "";
    case "spreadsheet":
      return doc.sheets ? spreadsheetToMarkdown(doc.sheets) : "";
    case "presentation":
      return doc.slides ? presentationToMarkdown(doc.slides) : "";
    case "drawing":
      return doc.pages ? drawingToMarkdown(doc.pages) : "";
  }
}

function wordprocessingToMarkdown(sections: ContentSection[]): string {
  const out: string[] = [];
  for (const section of sections) {
    for (const block of section.blocks ?? []) {
      emitBlock(block, out, 0);
    }
  }
  return collapseBlankLines(out.join("\n"));
}

function spreadsheetToMarkdown(sheets: ContentSheet[]): string {
  const out: string[] = [];
  for (const sheet of sheets) {
    out.push(`## ${sheet.name ?? "Sheet"}`);
    out.push("");
    emitSheetTable(sheet, out);
    out.push("");
  }
  return collapseBlankLines(out.join("\n"));
}

function presentationToMarkdown(slides: ContentSlide[]): string {
  const out: string[] = [];
  for (const [i, slide] of slides.entries()) {
    out.push(`## Slide ${i + 1}`);
    out.push("");
    for (const shape of slide.shapes ?? []) {
      const text = collectShapeText(shape);
      if (text) out.push(`- ${text}`);
    }
    out.push("");
  }
  return collapseBlankLines(out.join("\n"));
}

function drawingToMarkdown(pages: ContentDrawPage[]): string {
  const out: string[] = [];
  for (const [i, page] of pages.entries()) {
    out.push(`## Page ${i + 1}`);
    out.push("");
    for (const shape of page.shapes ?? []) {
      const text = collectShapeText(shape);
      if (text) out.push(`- ${text}`);
    }
    for (const vec of page.vectors ?? []) {
      const text = collectVectorText(vec);
      if (text) out.push(`- ${text}`);
    }
    out.push("");
  }
  return collapseBlankLines(out.join("\n"));
}

function emitBlock(block: ContentBlock, out: string[], depth: number): void {
  switch (block.kind) {
    case "paragraph": {
      emitParagraph(block as ContentParagraph, out, depth);
      return;
    }
    case "table": {
      out.push("");
      emitTable(block as ContentTable, out);
      out.push("");
      return;
    }
    case "image": {
      out.push("");
      const alt = (block as unknown as { alt?: string }).alt;
      out.push(`*[image: ${alt ?? "embedded image"}]*`);
      out.push("");
      return;
    }
    case "pageBreak": {
      out.push("");
      out.push("---");
      out.push("");
      return;
    }
    case "constructStart":
    case "constructEnd":
    case "embeddedObject":
      // These don't render as standalone Markdown.
      return;
  }
}

function emitParagraph(para: ContentParagraph, out: string[], _depth: number): void {
  const text = collectParagraphText(para);
  if (!text) return;

  const headingLevel = (para as unknown as { level?: number }).level;
  const listMembership = (para as unknown as { listMembership?: { level?: number; format?: string } })
    .listMembership;

  if (typeof headingLevel === "number" && headingLevel > 0) {
    const lvl = clampHeading(headingLevel);
    out.push("");
    out.push("#".repeat(lvl) + " " + text);
    out.push("");
    return;
  }

  if (listMembership) {
    const indent = "  ".repeat(Math.max(0, (listMembership.level ?? 1) - 1));
    const prefix = listMembership.format === "decimal" ? "1. " : "- ";
    out.push(indent + prefix + text);
    return;
  }

  out.push("");
  out.push(text);
  out.push("");
}

function emitTable(table: ContentTable, out: string[]): void {
  const rows = table.rows ?? [];
  if (rows.length === 0) return;
  const cells = rows.map((r: ContentTableRow) =>
    (r.cells ?? []).map(cellText),
  );
  const colCount = Math.max(...cells.map((r) => r.length));
  for (const row of cells) while (row.length < colCount) row.push("");
  const header = cells[0]!;
  out.push("| " + header.map(escapeCell).join(" | ") + " |");
  out.push("| " + header.map(() => "---").join(" | ") + " |");
  for (const row of cells.slice(1)) {
    out.push("| " + row.map(escapeCell).join(" | ") + " |");
  }
}

function emitSheetTable(sheet: ContentSheet, out: string[]): void {
  const rawCells = sheet.cells ?? [];
  if (rawCells.length === 0) {
    out.push("*(empty sheet)*");
    return;
  }

  // Find bounding rows and columns.
  const rows = new Map<number, Map<number, string>>();
  let maxRow = 0;
  let maxCol = 0;
  for (const cell of rawCells) {
    const r = cell.row;
    const c = cell.column;
    if (typeof r !== "number" || typeof c !== "number") continue;
    if (!rows.has(r)) rows.set(r, new Map());
    rows.get(r)!.set(c, cellValueText(cell));
    if (r > maxRow) maxRow = r;
    if (c > maxCol) maxCol = c;
  }
  if (maxRow === 0 && maxCol === 0) {
    out.push("*(empty sheet)*");
    return;
  }

  const matrix: string[][] = [];
  for (let r = 1; r <= maxRow; r++) {
    const row: string[] = [];
    for (let c = 1; c <= maxCol; c++) {
      row.push(rows.get(r)?.get(c) ?? "");
    }
    matrix.push(row);
  }

  const header = matrix[0]!;
  out.push("| " + header.map(escapeCell).join(" | ") + " |");
  out.push("| " + header.map(() => "---").join(" | ") + " |");
  for (const row of matrix.slice(1)) {
    out.push("| " + row.map(escapeCell).join(" | ") + " |");
  }
}

function cellText(cell: ContentTableCell): string {
  return (cell.blocks ?? [])
    .map((b) => {
      if (b.kind === "paragraph") return collectParagraphText(b as ContentParagraph);
      return "";
    })
    .join(" ")
    .trim();
}

interface CellValueLike {
  value?: { kind?: string; value?: unknown; text?: string };
  formatted?: string;
}

function cellValueText(cell: CellValueLike): string {
  if (typeof cell.formatted === "string" && cell.formatted.length > 0) return cell.formatted;
  const v = cell.value;
  if (!v) return "";
  if (typeof v.text === "string") return v.text;
  if (typeof v.value === "number" || typeof v.value === "boolean") return String(v.value);
  if (typeof v.value === "string") return v.value;
  return "";
}

function collectParagraphText(para: ContentParagraph): string {
  return (para.runs ?? [])
    .map((run: ContentRun) => run.text ?? "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function collectShapeText(shape: ContentShape): string {
  const out: string[] = [];
  for (const block of shape.blocks ?? []) {
    if (block.kind === "paragraph") {
      out.push(collectParagraphText(block as ContentParagraph));
    } else if (block.kind === "table") {
      const buf: string[] = [];
      emitTable(block as ContentTable, buf);
      out.push(buf.join("\n"));
    }
  }
  return out.filter((s) => s.length > 0).join("\n").trim();
}

function collectVectorText(_vec: ContentVector): string {
  // Vectors carry geometric path data — no readable text.
  return "";
}

function clampHeading(level: number): number {
  if (level < 1) return 1;
  if (level > 6) return 6;
  return level;
}

function collapseBlankLines(s: string): string {
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

export type { ContentDocument };