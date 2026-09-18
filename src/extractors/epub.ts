import * as path from "node:path";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { parseDocument } from "htmlparser2";

import type { EpubExtractResult, EpubMetadata } from "../types.js";
import { xhtmlToMarkdown } from "../util/markdown-adapter.js";

export class EpubEncrypted extends Error {
  constructor() {
    super("EPUB is encrypted (DRM/LCP) and is not supported by this tool.");
    this.name = "EpubEncrypted";
  }
}

export class EpubStructureError extends Error {
  constructor(message: string) {
    super(`EPUB structure error: ${message}`);
    this.name = "EpubStructureError";
  }
}

interface EpubInternal {
  opfPath: string;
  manifest: Map<string, string>; // id -> href
  spine: string[];                 // idref order
  toc: { label: string; href: string }[]; // flat list (depth-agnostic)
  tocId: string | undefined;        // id of NCX or nav doc in manifest
  metadata: EpubMetadata;
}

/** Loosely-typed DOM node shape used across all epub XML parsers in this file. */
interface XmlElement {
  type: string;
  name: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: XmlElement[];
}

async function readZipEntry(zip: JSZip, entryPath: string): Promise<string> {
  const entry = zip.file(entryPath);
  if (!entry) {
    throw new EpubStructureError(`missing zip entry: ${entryPath}`);
  }
  return entry.async("string");
}

function parseContainerXml(zip: JSZip): Promise<string> {
  return readZipEntry(zip, "META-INF/container.xml").then((xml) => {
    const dom = parseDocument(xml, { xmlMode: true });
    for (const node of dom.children) {
      const tag = asElement(node);
      if (!tag) continue;
      const rootfiles = tag.children ?? [];
      for (const child of rootfiles) {
        const rf = asElement(child);
        if (!rf || rf.name.toLowerCase() !== "rootfiles") continue;
        for (const leaf of rf.children ?? []) {
          const fileEl = asElement(leaf);
          if (!fileEl || fileEl.name.toLowerCase() !== "rootfile") continue;
          const fullPath = fileEl.attribs?.["full-path"];
          if (fullPath) return fullPath;
        }
      }
    }
    throw new EpubStructureError("META-INF/container.xml has no <rootfile full-path>");
  });
}

function parseContentOpf(xml: string): EpubInternal {
  const dom = parseDocument(xml, { xmlMode: true });
  const manifest = new Map<string, string>();
  let tocId: string | undefined;
  const spine: string[] = [];
  const metadata: EpubMetadata = {
    title: undefined,
    creator: undefined,
    language: undefined,
  };

  // OPF sections live under the <package> root element (standard EPUB 2/3);
  // some non-standard files place them directly at the document root. Handle
  // both shapes by flattening one level.
  const sections: XmlElement[] = [];
  for (const node of dom.children) {
    const tag = asElement(node);
    if (!tag) continue;
    if (tag.name.toLowerCase() === "package") {
      for (const child of tag.children ?? []) {
        const el = asElement(child);
        if (el) sections.push(el);
      }
    } else {
      sections.push(tag);
    }
  }

  for (const tag of sections) {
    const tagName = tag.name.toLowerCase();
    const children = tag.children ?? [];

    if (tagName === "manifest") {
      for (const item of children) {
        const it = asElement(item);
        if (!it || it.name.toLowerCase() !== "item") continue;
        const id = it.attribs?.["id"];
        const href = it.attribs?.["href"];
        const properties = it.attribs?.["properties"] ?? "";
        if (id && href) manifest.set(id, href);
        if (properties.includes("nav")) tocId = id;
      }
    } else if (tagName === "spine") {
      tocId = tag.attribs?.["toc"] ?? tocId;
      for (const itemref of children) {
        const ir = asElement(itemref);
        if (!ir || ir.name.toLowerCase() !== "itemref") continue;
        const idref = ir.attribs?.["idref"];
        if (idref) spine.push(idref);
      }
    } else if (tagName === "metadata") {
      for (const m of children) {
        const me = asElement(m);
        if (!me) continue;
        const name = me.name.toLowerCase();
        const text = collectElementText(me);
        if (name === "dc:title" || name === "title") metadata.title = text;
        else if (name === "dc:creator" || name === "creator") metadata.creator = text;
        else if (name === "dc:language" || name === "language") metadata.language = text;
      }
    }
  }

  return {
    opfPath: "",
    manifest,
    spine,
    toc: [],
    tocId,
    metadata,
  };
}

function parseTocNcx(xml: string): { label: string; href: string }[] {
  const dom = parseDocument(xml, { xmlMode: true });
  const entries: { label: string; href: string }[] = [];

  function walk(node: XmlElement): void {
    if (node.type === "tag" && node.name.toLowerCase() === "navpoint") {
      const label = findChildText(node, "navlabel") ?? findChildText(node, "text") ?? "(untitled)";
      const href = findFirstContentSrc(node);
      entries.push({ label: label.trim(), href });
    }
    for (const c of node.children ?? []) walk(c);
  }

  for (const c of dom.children) walk(c as XmlElement);
  return entries;
}

function findChildText(node: XmlElement, tag: string): string | undefined {
  if (node.type === "tag" && node.name.toLowerCase() === tag) {
    return collectElementText(node);
  }
  for (const c of node.children ?? []) {
    const found = findChildText(c, tag);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findFirstContentSrc(node: XmlElement): string {
  if (node.type === "tag" && node.name.toLowerCase() === "content") {
    return node.attribs?.["src"] ?? "";
  }
  for (const c of node.children ?? []) {
    const found = findFirstContentSrc(c);
    if (found) return found;
  }
  return "";
}

function collectElementText(node: XmlElement): string {
  if (node.type === "text" && typeof node.data === "string") return node.data;
  return (node.children ?? []).map(collectElementText).join("");
}

function asElement(n: unknown): XmlElement | undefined {
  if (!n || typeof n !== "object") return undefined;
  const node = n as { type?: string; name?: string };
  if (node.type !== "tag" || typeof node.name !== "string") return undefined;
  return n as XmlElement;
}

/**
 * Read an EPUB file and return its chapters as Markdown, in spine order.
 *
 * Detection of encryption is a best-effort check on `META-INF/encryption.xml`
 * presence — real DRM detection would need the full rights.xml interpretation,
 * which we don't ship. Any encrypted file raises `EpubEncrypted`.
 */
export async function extractEpub(filePath: string): Promise<EpubExtractResult> {
  const bytes = new Uint8Array(await readFile(filePath));
  const zip = await JSZip.loadAsync(bytes);

  // Refuse encrypted books early.
  if (zip.file("META-INF/encryption.xml")) {
    throw new EpubEncrypted();
  }

  const opfPath = await parseContainerXml(zip);
  const opfXml = await readZipEntry(zip, opfPath);
  const internal = parseContentOpf(opfXml);
  internal.opfPath = opfPath;

  const opfDir = path.posix.dirname(opfPath);

  // Resolve TOC: prefer NCX (EPUB 2) referenced from <spine toc>; else nav.xhtml
  // referenced from manifest `nav` property.
  let toc: { label: string; href: string }[] = [];
  if (internal.tocId !== undefined && internal.manifest.has(internal.tocId)) {
    const ncxHref = internal.manifest.get(internal.tocId)!;
    const ncxPath = path.posix.join(opfDir, ncxHref);
    try {
      const ncxXml = await readZipEntry(zip, ncxPath);
      toc = parseTocNcx(ncxXml);
    } catch {
      // Fall through to nav.xhtml below.
    }
  }
  if (toc.length === 0) {
    for (const [id, href] of internal.manifest.entries()) {
      if (id.startsWith("nav") || /nav(\.xhtml)?$/i.test(href)) {
        try {
          const navXml = await readZipEntry(zip, path.posix.join(opfDir, href));
          toc = parseNavXhtml(navXml);
          if (toc.length > 0) break;
        } catch {
          // ignore and keep trying
        }
      }
    }
  }

  // Walk the spine and convert each chapter.
  const chapters: { title: string; markdown: string }[] = [];
  for (const idref of internal.spine) {
    const href = internal.manifest.get(idref);
    if (!href) continue;
    const chapterPath = path.posix.join(opfDir, href);
    let xhtml: string;
    try {
      xhtml = await readZipEntry(zip, chapterPath);
    } catch {
      continue;
    }
    const title = deriveChapterTitle(href, xhtml);
    chapters.push({ title, markdown: xhtmlToMarkdown(xhtml) });
  }

  return {
    markdown: renderEpubMarkdown(internal.metadata, toc, chapters),
    format: "epub",
    warning: null,
    chapter_count: chapters.length,
    metadata: internal.metadata,
  };
}

function parseNavXhtml(xml: string): { label: string; href: string }[] {
  const dom = parseDocument(xml, { xmlMode: true });
  const entries: { label: string; href: string }[] = [];

  function walk(node: XmlElement): void {
    if (node.type === "tag" && node.name.toLowerCase() === "a") {
      const href = node.attribs?.["href"] ?? "";
      const label = collectElementText(node).trim();
      entries.push({ label: label || "(untitled)", href });
      return;
    }
    for (const c of node.children ?? []) walk(c);
  }

  let navRoot: XmlElement | undefined;
  for (const c of dom.children) {
    const html = asElement(c);
    if (!html || html.name.toLowerCase() !== "html") continue;
    for (const c2 of html.children ?? []) {
      const body = asElement(c2);
      if (!body) continue;
      const tagName = body.name.toLowerCase();
      if (tagName !== "body" && tagName !== "nav") continue;
      const containerChildren = tagName === "body" ? body.children ?? [] : [body];
      for (const c3 of containerChildren) {
        const nav = asElement(c3);
        if (!nav || nav.name.toLowerCase() !== "nav") continue;
        navRoot = nav;
        if (nav.attribs?.["epub:type"] === "toc") {
          walk(nav);
          return entries;
        }
      }
    }
  }
  if (navRoot) walk(navRoot);
  return entries;
}

function deriveChapterTitle(href: string, xhtml: string): string {
  const dom = parseDocument(xhtml, { xmlMode: true });
  for (const node of dom.children) {
    const html = asElement(node);
    if (!html || html.name.toLowerCase() !== "html") continue;
    for (const c of html.children ?? []) {
      const head = asElement(c);
      if (!head || head.name.toLowerCase() !== "head") continue;
      for (const cc of head.children ?? []) {
        const title = asElement(cc);
        if (!title || title.name.toLowerCase() !== "title") continue;
        const text = collectElementText(title).trim();
        if (text) return text;
      }
    }
  }
  return path.basename(href, path.extname(href));
}

function renderEpubMarkdown(
  metadata: EpubMetadata,
  toc: { label: string; href: string }[],
  chapters: { title: string; markdown: string }[],
): string {
  const out: string[] = [];
  if (metadata.title) {
    out.push(`# ${metadata.title}`);
    out.push("");
  }
  if (toc.length > 0) {
    out.push("## Table of Contents");
    out.push("");
    for (const entry of toc) {
      out.push(`- ${entry.label}`);
    }
    out.push("");
  }
  for (const chapter of chapters) {
    out.push(`## ${chapter.title}`);
    out.push("");
    out.push(chapter.markdown);
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}