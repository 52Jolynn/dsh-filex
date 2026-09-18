/**
 * Shared extractor result types. All public-facing tools return one of these
 * shapes; the dsh `output.schema` mirrors the same field set so model-facing
 * `render` can be uniform.
 *
 * Note: every optional-ish field is typed `T | undefined` (rather than `T?`)
 * because tsconfig sets `exactOptionalPropertyTypes`. This means the
 * runtime value of the property is always present — either as the typed
 * value or as `undefined` — so dsh-tool schema validation, which treats
 * `undefined` as a real value, doesn't reject our outputs.
 */

export type OfficeFormat = "docx" | "xlsx" | "pptx" | "doc" | "xls" | "ppt";

export interface OfficeExtractResult {
  markdown: string;
  format: OfficeFormat;
  format_requested: OfficeFormat;
  warning: string | null;
}

/**
 * PDF classification result. `pdf-efficient-loader` distinguishes scan vs
 * text/vector; we surface that as Scanned vs TextBased.
 */
export type PdfType = "TextBased" | "Scanned";

export interface PdfExtractResult {
  markdown: string | null;
  pdf_type: PdfType;
  warning: string | null;
  page_count: number | undefined;
}

export interface EpubMetadata {
  title: string | undefined;
  creator: string | undefined;
  language: string | undefined;
}

export interface EpubExtractResult {
  markdown: string;
  format: "epub";
  warning: string | null;
  chapter_count: number | undefined;
  metadata: EpubMetadata | undefined;
}

export type OdfFormat = "odt" | "ods" | "odp" | "odg";

export interface OdfMetadata {
  title: string | undefined;
  creator: string | undefined;
}

export interface OdfExtractResult {
  markdown: string;
  format: OdfFormat;
  warning: string | null;
  metadata: OdfMetadata | undefined;
}

export type AnyExtractResult =
  | OfficeExtractResult
  | PdfExtractResult
  | EpubExtractResult
  | OdfExtractResult;