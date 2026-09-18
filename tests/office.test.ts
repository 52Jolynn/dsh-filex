import { describe, expect, it } from "vitest";

import { extractOffice, officeFormatFromExt, UnsupportedOfficeExtension } from "../src/extractors/office.js";
import { fixture } from "./helpers.js";

describe("extractOffice — OOXML formats", () => {
  it("extracts .docx headings and paragraphs as Markdown", async () => {
    const r = await extractOffice(fixture("sample.docx"));

    expect(r.format).toBe("docx");
    expect(r.format_requested).toBe("docx");
    expect(r.warning).toBeNull();
    expect(r.markdown).toContain("dsh-filex 文档标题");
    expect(r.markdown).toContain("这是第一段正文内容。");
  });

  it("extracts .xlsx sheets as Markdown tables", async () => {
    const r = await extractOffice(fixture("sample.xlsx"));

    expect(r.format).toBe("xlsx");
    expect(r.format_requested).toBe("xlsx");
    expect(r.markdown).toContain("## 数据表");
    expect(r.markdown).toContain("项目名称");
    expect(r.markdown).toContain("dsh-filex");
    expect(r.markdown).toContain("|");
  });

  it("extracts .pptx slides as Markdown sections", async () => {
    const r = await extractOffice(fixture("sample.pptx"));

    expect(r.format).toBe("pptx");
    expect(r.format_requested).toBe("pptx");
    expect(r.markdown).toContain("Slide 1");
    expect(r.markdown).toContain("dsh-filex 架构评审");
    expect(r.markdown).toContain("支持 docx/pdf/epub 等格式提取");
  });
});

describe("officeFormatFromExt", () => {
  it("maps all six office extensions", () => {
    expect(officeFormatFromExt(".docx")).toBe("docx");
    expect(officeFormatFromExt(".doc")).toBe("doc");
    expect(officeFormatFromExt(".xlsx")).toBe("xlsx");
    expect(officeFormatFromExt(".xls")).toBe("xls");
    expect(officeFormatFromExt(".pptx")).toBe("pptx");
    expect(officeFormatFromExt(".ppt")).toBe("ppt");
  });

  it("accepts full paths and rejects unknown extensions", () => {
    expect(officeFormatFromExt("/tmp/report.DOCX")).toBe("docx");

    expect(() => officeFormatFromExt(".txt")).toThrow(UnsupportedOfficeExtension);
    expect(() => officeFormatFromExt("/tmp/file")).toThrow(UnsupportedOfficeExtension);
  });
});
