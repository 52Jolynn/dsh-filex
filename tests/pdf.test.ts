import { describe, expect, it } from "vitest";

import { extractPdf } from "../src/extractors/pdf.js";
import { fixture } from "./helpers.js";

describe("extractPdf — classification and extraction", () => {
  it("extracts Markdown from a text-based PDF", async () => {
    const r = await extractPdf(fixture("text.pdf"));

    expect(r.pdf_type).toBe("TextBased");
    expect(r.warning).toBeNull();
    expect(r.markdown).toBeTruthy();
    expect(r.markdown).toContain("Hello dsh-filex text layer");
    expect(r.page_count).toBe(1);
  });

  it("returns a domain signal (not an error) for scanned PDFs", async () => {
    const r = await extractPdf(fixture("scanned.pdf"));

    expect(r.pdf_type).toBe("Scanned");
    expect(r.markdown).toBeNull();
    expect(r.warning).toContain("OCR");
    expect(r.page_count).toBe(1);
  });
});
