import { describe, expect, it } from "vitest";

import { extractEpub } from "../src/extractors/epub.js";
import { fixture } from "./helpers.js";

// Regression guard: parseContentOpf used to look for <manifest>/<spine>/
// <metadata> at the document top level only. Standard EPUB OPFs nest them
// under <package>, which made every standard file parse to an empty result.
describe("extractEpub — standard OPF structure", () => {
  it("resolves the spine, TOC and metadata from a <package>-rooted OPF", async () => {
    const r = await extractEpub(fixture("sample.epub"));

    expect(r.format).toBe("epub");
    expect(r.warning).toBeNull();

    expect(r.chapter_count).toBe(1);
    expect(r.metadata?.title).toBe("插件开发手记");
    expect(r.metadata?.creator).toBe("测试");

    expect(r.markdown).toContain("# 插件开发手记");
    expect(r.markdown).toContain("第一章"); // TOC label
    expect(r.markdown).toContain("# 第一章 工具设计"); // chapter heading
    expect(r.markdown).toContain("dsh-filex 通过 WASM 提取文档内容。");
  });
});
