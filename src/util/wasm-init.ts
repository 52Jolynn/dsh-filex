/**
 * Lazily initialise the WASM-backed extractors used by the office and pdf tools.
 *
 * Each helper is a concurrent-safe singleton: the first call kicks off the
 * `await init()` (if any) and caches the resulting Promise. Subsequent calls
 * reuse the same Promise, so a burst of tool invocations only initialises once.
 *
 * `office-oxide-wasm` ships a synchronous `WasmDocument` constructor and
 * needs no `init()` — the helper just resolves with the module's exports.
 *
 * `pdf-oxide-wasm` may or may not expose a default `init` export; we handle
 * both shapes by checking for the export before calling it.
 *
 * `@firecrawl/pdf-inspector-wasm` always requires an explicit `init()` before
 * `processPdf` / `detectPdf` can be used.
 */

export interface OfficeWasmModule {
  WasmDocument: new (
    bytes: Uint8Array,
    format: "docx" | "xlsx" | "pptx" | "doc" | "xls" | "ppt",
  ) => {
    formatName(): string;
    plainText(): string;
    toMarkdown(): string;
    toHtml(): string;
    toIr(): unknown;
    free(): void;
    [Symbol.dispose]?: () => void;
  };
}

let officeCache: Promise<OfficeWasmModule> | null = null;
export function getOfficeWasm(): Promise<OfficeWasmModule> {
  if (officeCache) return officeCache;
  officeCache = (async () => {
    const mod: OfficeWasmModule = await import("office-oxide-wasm");
    return mod;
  })();
  return officeCache;
}

export interface PdfInspectorModule {
  processPdf: (
    bytes: Uint8Array,
    options?: Record<string, unknown>,
  ) => {
    pdfType: "TextBased" | "Scanned" | "ImageBased" | "Mixed" | string;
    markdown?: string | null;
    pages_needing_ocr?: number[];
    [key: string]: unknown;
  };
  detectPdf?: (
    bytes: Uint8Array,
    options?: Record<string, unknown>,
  ) => { pdfType: string };
  version?: () => string;
}

let inspectorCache: Promise<PdfInspectorModule> | null = null;
export function getPdfInspector(): Promise<PdfInspectorModule> {
  if (inspectorCache) return inspectorCache;
  inspectorCache = (async () => {
    const initMod: unknown = await import("@firecrawl/pdf-inspector-wasm");
    // The package ships a default `init` export. Wrap the call to discard the
    // returned `InitOutput` shape — we don't need its payload.
    const maybeInit = (initMod as { default?: unknown }).default;
    if (typeof maybeInit === "function") {
      await (maybeInit as () => Promise<unknown>)();
    }
    const mod = initMod as PdfInspectorModule;
    return mod;
  })();
  return inspectorCache;
}

// Use `unknown` for the pdf-oxide-wasm module — its actual constructor
// accepts an optional `password` second argument and `extractText` accepts
// an optional `region`. We only need a small subset, so we type-erase.
export type PdfOxideModule = typeof import("pdf-oxide-wasm");

let pdfOxideCache: Promise<PdfOxideModule> | null = null;
export function getPdfOxide(): Promise<PdfOxideModule> {
  if (pdfOxideCache) return pdfOxideCache;
  pdfOxideCache = (async () => {
    const mod = (await import("pdf-oxide-wasm")) as PdfOxideModule;
    const maybeInit = (mod as unknown as { default?: unknown }).default;
    if (typeof maybeInit === "function") {
      await (maybeInit as () => Promise<unknown>)();
    }
    return mod;
  })();
  return pdfOxideCache;
}