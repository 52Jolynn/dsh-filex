import { describe, expect, it } from "vitest";

import { extractOdf, odfFormatFromExt, UnsupportedOdfExtension } from "../src/extractors/odf.js";
import { fixture } from "./helpers.js";

// Regression guard: the extractor used to call the hierarchical DocumentTree
// readers (readOdt/readOds) whose `children` shape does not match the
// Markdown adapter, silently producing empty output for every ODF file.
describe("extractOdf — flat ContentDocument readers", () => {
  it("extracts .odt headings and paragraphs as Markdown", async () => {
    const r = await extractOdf(fixture("sample.odt"));

    expect(r.format).toBe("odt");
    expect(r.warning).toBeNull();
    expect(r.markdown).toContain("ODF 提取验证");
    expect(r.markdown).toContain("这是一段用于验证 odt 提取的正文。");
  });

  it("extracts .ods sheets as Markdown tables (0-based cell coordinates)", async () => {
    // Regression guard for emitSheetTable: cells are 0-based (A1 = row 0,
    // column 0); the old 1-based loop dropped the first row/column and even
    // crashed when content sat only in A1.
    const r = await extractOdf(fixture("sample.ods"));

    expect(r.format).toBe("ods");
    expect(r.warning).toBeNull();
    expect(r.markdown).toContain("## Sheet1");
    expect(r.markdown).toContain("科目");
    expect(r.markdown).toContain("42");
    expect(r.markdown).toContain("| --- |");
  });
});

describe("odfFormatFromExt", () => {
  it("maps all four ODF extensions and rejects unknown ones", () => {
    expect(odfFormatFromExt(".odt")).toBe("odt");
    expect(odfFormatFromExt(".ods")).toBe("ods");
    expect(odfFormatFromExt(".odp")).toBe("odp");
    expect(odfFormatFromExt(".odg")).toBe("odg");

    expect(() => odfFormatFromExt(".docx")).toThrow(UnsupportedOdfExtension);
  });
});
