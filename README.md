# dsh-filex

[![Node](https://img.shields.io/badge/node-%E2%89%A522.19-blue)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](#许可)

一个 [DeepSeek Harness (dsh)](https://deepseek-harness.github.io/deepseek-harness/) 插件，
将 **Office / PDF / EPUB / ODF** 文档内容端侧提取为 **Markdown**，供 dsh 会话中的 LLM
直接消费（摘要、问答、RAG 等）。文件全程不离开本机。

---

## 目录

- [简介](#简介)
- [术语表](#术语表)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [工具一览](#工具一览)
- [架构](#架构)
- [新增文件格式支持指南](#新增文件格式支持指南)
- [开发](#开发)
- [编译与构建](#编译与构建)
- [安装部署](#安装部署)
- [已知限制](#已知限制)
- [故障排查](#故障排查)
- [许可](#许可)

---

## 简介

dsh 本身不擅长阅读二进制文档——把 docx/pdf 的字节流塞进上下文既浪费 token 又不可靠。
**dsh-filex** 在工具层解决这个问题：它注册一组面向模型的提取工具，LLM 传入文件路径，
插件在端侧调用 WASM / 纯 JS 解析库，把文档转成干净的 Markdown 返回。

核心特性：

- **6 类工具覆盖 13 种扩展名**：PDF、Word（doc/docx）、PPT（ppt/pptx）、Excel
  （xls/xlsx）、EPUB、ODF（odt/ods/odp/odg）。
- **扫描件智能分流**：PDF 先经 pdf-inspector 分类，扫描件返回
  `{pdf_type, markdown: null, warning}` 而非报错，让 LLM 自行决定是否走 OCR。
- **路径安全**：所有路径经 `resolveSafeFilePath` 校验，拒绝逃出
  `working_directory` 的路径穿越。
- **纯端侧处理**：除 EPUB/ODF 的纯 JS 解析外，Office/PDF 走 WASM，无原生二进制依赖、
  无 LibreOffice 子进程、无网络请求。
- **Markdown 输出统一**：标题/段落/列表/表格/链接等语义结构在所有格式间保持一致。

---

## 术语表

| 术语 | 含义 |
| --- | --- |
| **dsh / Harness** | DeepSeek Harness，基于 Cordis 框架的 agent 运行时，一切功能皆为插件 |
| **插件 (plugin)** | 一个导出 `name` / `inject` / `apply(ctx)` 的 TypeScript 模块，通过 `ctx` 注册能力 |
| **工具 (tool)** | 面向模型的能力单元，经 `ctx.tools.register(defineTool(...))` 注册，由 LLM 按需调用 |
| **profile** | dsh 的具名插件组合（如 `web`），由 bundle 与 patch 叠加而成 |
| **patch / cordis.yml** | 覆盖层配置，用 `--patch` 注入树外插件；条目按 `id` 定位、替换或插入 |
| **OOXML** | Office Open XML，`.docx/.xlsx/.pptx` 的底层格式 |
| **ODF** | OpenDocument Format（ISO/IEC 26300），LibreOffice 的原生格式，`.odt/.ods/.odp/.odg` |
| **扫描件 (Scanned PDF)** | 由图片扫描生成的 PDF，无文字层（无 `Tj/TJ` 文本操作符），须 OCR 才能提取 |
| **spine** | EPUB 的章节阅读顺序，定义在 `content.opf` 的 `<spine>` 元素中 |
| **NCX / nav.xhtml** | EPUB 2 / EPUB 3 的目录（Table of Contents）载体文件 |
| **WASM** | WebAssembly；本插件用它获得接近原生的解析速度且免 node-gyp |

---

## 技术栈

| 层 | 选型 | 版本 | 用途 |
| --- | --- | --- | --- |
| 运行时 | Node.js | ≥ 22.19 | ESM 原生加载，对齐 dsh 要求 |
| 插件框架 | `@deepseek-ai/cordis` | * | 上下文/依赖注入/自动清理 |
| 工具 DSL | `@deepseek-ai/dsh-tools` | 0.0.1-rc.1 | `defineTool` + schema 校验 + 渲染 |
| Office 解析 | `office-oxide-wasm` | ^0.1.8 | doc/docx/ppt/pptx/xls/xlsx → Markdown（Rust 核心） |
| PDF 解析 | `pdf-oxide-wasm` | ^0.3.77 | PDF → Markdown（Rust 核心） |
| PDF 分类 | `@firecrawl/pdf-inspector-wasm` | ^1.20.0 | 扫描件/文本件检测 |
| ODF 解析 | `odf.js` | ^7.25.5 | odt/ods/odp/odg → typed DocumentTree |
| ZIP 解压 | `jszip` | ^3.10.1 | EPUB 容器解析 |
| HTML 解析 | `htmlparser2` | ^9.1.0 | EPUB 章节 XHTML / OPF / NCX 解析 |
| 类型检查 | `typescript` | ^5.7 | strict + NodeNext |

许可均为宽松协议（MIT / Apache-2.0 / BSD-2 / CC0），无 AGPL/GPL 传染。

---

## 快速开始

> 前置：已克隆 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
> 仓库并能运行 `pnpm dsh web`；Node ≥ 22.19。

```sh
# 1. 安装本插件依赖
cd /home/micray/workspace/node/dsh-filex
npm install

# 2. 核对 cordis.yml 中的绝对路径指向本机 filex.ts
cat cordis.yml
# - insert:
#     - id: dsh-filex
#       name: /home/micray/workspace/node/dsh-filex/src/filex.ts

# 3. 启动 dsh web 并挂载本插件（在 dsh 仓库根目录）
pnpm dsh web --patch /home/micray/workspace/node/dsh-filex/cordis.yml
或者
pnpm dsh plugin --profile web remove dsh-filex
pnpm dsh plugin --profile web add ~/workspace/node/dsh-filex/ -w
```

启动后：

1. 打开 <http://127.0.0.1:3080>；
2. **Settings → Plugins** 确认 `dsh-filex` 为 Enabled；
3. 在会话中直接让模型调用，例如：

```text
请用 extract_pdf 工具读取 working_directory=/home/me/docs 中的 report.pdf，
并总结第三章要点。
```

一行验证插件已挂载（无需启动 web）：

```sh
pnpm dsh --profile web --dump-config \
  --patch /home/micray/workspace/node/dsh-filex/cordis.yml \
  | grep dsh-filex
```

---

## 工具一览

| 工具名 | 扩展名 | 返回 |
| --- | --- | --- |
| `extract_pdf` | `.pdf` | `{markdown, pdf_type, warning, page_count}`；扫描件 `markdown: null` |
| `extract_word` | `.doc` `.docx` | `{markdown, format, format_requested, warning}` |
| `extract_ppt` | `.ppt` `.pptx` | 同上 |
| `extract_excel` | `.xls` `.xlsx` | 同上 |
| `extract_epub` | `.epub` | `{markdown, format, warning, chapter_count, metadata}`，含目录与章节 |
| `extract_odf` | `.odt` `.ods` `.odp` `.odg` | `{markdown, format, warning, metadata}` |
| `filex_list_formats` | — | 扩展名 → 工具映射表（调试用） |

所有工具入参统一为：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file_path` | string | ✅ | 绝对路径，或相对 `working_directory` 的相对路径 |
| `working_directory` | string | ✅ | 工作空间根目录，用于安全解析与穿越防护 |

### PDF 扫描件行为

| pdf_type | 行为 |
| --- | --- |
| `TextBased` | 正常提取 Markdown |
| `Mixed` | 提取文本页；若 `pages_needing_ocr` 非空，`warning` 列出跳过的页 |
| `Scanned` / `ImageBased` | **不抛异常**，返回 `{pdf_type, markdown: null, warning}`，提示先 OCR |
| `Unknown` | 尽力提取，`warning` 注明分类不确定 |

### 路径安全规则

1. `working_directory` 必须存在且为目录；
2. 相对 `file_path` 解析后必须仍位于 `working_directory` 内（`path.relative` 判定）；
3. 目标必须是常规文件。

违反时抛出 `WorkingDirectoryInvalid` / `PathOutsideWorkspace` / `NotAFile`，
由 dsh 工具管线转为 `isError` 结果。

---

## 架构

```
src/
├── filex.ts               # 插件入口（~21 行）：遍历 FILEX_TOOLS 逐个注册
├── types.ts               # 共享结果类型（Office/Pdf/Epub/Odf ExtractResult）
├── extractors/            # 纯提取层：bytes → typed result，不感知 dsh
│   ├── office.ts          #   office-oxide-wasm（6 种 OOXML/97 格式）
│   ├── pdf.ts             #   分类分流 + pdf-oxide 提取
│   ├── epub.ts            #   jszip 解压 + OPF/spine/NCX/nav 解析
│   └── odf.ts             #   odf.js 按格式分发 reader
├── tools/                 # dsh 粘合层：schema + render + execute
│   ├── common.ts          #   共享参数 schema / output schema / render helper
│   ├── office-family.ts   #   工厂：word/ppt/excel 仅配置扩展名差异
│   ├── pdf.ts word.ts ppt.ts excel.ts epub.ts odf.ts   # 每格式一个薄包装
│   ├── list-formats.ts    #   调试工具
│   └── index.ts           #   FILEX_TOOLS —— 唯一工具注册表
└── util/
    ├── resolve-path.ts    # 路径解析 + 穿越防护 + 三个领域错误类
    ├── wasm-init.ts       # 并发安全的三方 WASM 懒加载单例
    └── markdown-adapter.ts# XHTML → Markdown 与 ODF tree → Markdown visitor
```

### 新增一种文件格式的完整指南

见下文[《新增文件格式支持指南》](#新增文件格式支持指南)。入口、路径安全、WASM 懒加载、render 均无需改动。

---

## 开发

```sh
npm install          # 安装依赖（约 58 个包）

# 类型检查（质量门禁，提交前必须通过）
npm run typecheck    # 等价于 ./node_modules/.bin/tsc --noEmit
```

### 编码约定

- **严格 TS**：`strict` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`；
  可选字段一律写 `T | undefined` 而非 `T?`。
- **错误两分**：基础设施错误（文件不存在、扩展名不支持、WASM 损坏）抛异常；
  领域级"不理想但合法"的结果（扫描件、Mixed 部分页）用规范值表达。
- **WASM 资源**：解析出的文档对象必须在 `try/finally` 中 `free()`，防止内存常驻。
- **无占位代码**：不允许 TODO/FIXME/空函数体。
- **工具命名**：`extract_<格式>`（snake_case）；内部模块与函数用驼峰。

### 模块职责边界

| 目录 | 允许依赖 | 禁止依赖 |
| --- | --- | --- |
| `extractors/` | 三方解析库、`util/` | `tools/`、`@deepseek-ai/*` |
| `tools/` | `extractors/`、`util/`、`@deepseek-ai/dsh-tools` | 直接操作二进制 |
| `util/` | Node 内置、三方 | 上层目录 |
| `filex.ts` | `tools/index.ts` | 其余一切 |

---

## 新增文件格式支持指南

本指南以新增假想的 `extract_csv` 工具为例，完整走一遍添加 `.csv` 支持的流程。
任何新格式都遵循同样的七步。

### 第 0 步：决策清单

动手前先回答三个问题：

| 问题 | 判断依据 |
| --- | --- |
| **有现成解析库吗？** | 优先选纯 JS/WASM 且宽松许可（MIT/Apache-2.0）的库；拒绝 AGPL/GPL 传染（参考技术栈表的选型标准） |
| **需要 WASM init 吗？** | 若库需要 `await init()`，在 `util/wasm-init.ts` 里仿照 `getPdfInspector()` 加一个懒加载单例；纯 JS 库（如 csv-parse）跳过此步 |
| **独立工具还是并入现有工具？** | 语义独立的格式（如 csv、rtf）建独立工具；同族格式（如新的 Office 变体）扩展现有工具的扩展名白名单即可 |

### 第 1 步：定义结果类型（`src/types.ts`）

复用 `markdown + format + warning` 三件套，只补充格式特有字段：

```ts
// types.ts 追加
export interface CsvExtractResult {
  markdown: string;              // 每行一个 Markdown 表格（多表时用 ## 分隔）
  format: "csv";
  warning: string | null;
  row_count: number | undefined; // 格式特有元数据
}

// AnyExtractResult 联合类型中加入 CsvExtractResult
```

> 可选字段一律写 `T \| undefined` 而非 `T?`（tsconfig 开启了
> `exactOptionalPropertyTypes`，见[编码约定](#编码约定)）。

### 第 2 步：实现提取器（`src/extractors/csv.ts`）

提取器是**纯函数层**：`readFile` 交给工具层做（见第 3 步），本层只做
`bytes → typed result`。这样提取器可以在没有 dsh 的环境下独立复用与调试。

```ts
// src/extractors/csv.ts
import type { CsvExtractResult } from "../types.js";

export class UnsupportedCsvEncoding extends Error {
  constructor(public readonly encoding: string) {
    super(`unsupported CSV encoding: ${encoding}`);
    this.name = "UnsupportedCsvEncoding";
  }
}

/** bytes → typed result；不读文件、不碰 dsh。 */
export function extractCsvFromBytes(bytes: Uint8Array): CsvExtractResult {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  // …csv-parse 解析 + markdown-adapter 风格的表格渲染…
  return { markdown: renderTable(rows), format: "csv", warning: null, row_count: rows.length };
}
```

若解析库需释放 WASM 资源，仿照 `extractors/office.ts` 用 `try/finally` 包裹 `free()`。

### 第 3 步：注册工具（`src/tools/csv.ts`）

复用 `common.ts` 的三个 helper，工具模块只描述差异化配置：

```ts
// src/tools/csv.ts
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { JsonValue } from "@deepseek-ai/dsh-session";

import { readFile } from "node:fs/promises";
import { extractCsvFromBytes } from "../extractors/csv.js";
import { resolveSafeFilePath } from "../util/resolve-path.js";
import { outputJson, pathParameters, renderMarkdownWithWarning } from "./common.js";

export function makeCsvTool(): ToolDefinition {
  return defineTool({
    name: "extract_csv",
    description:
      "Extract data from a CSV file as Markdown tables. " +
      "Supports local file paths (absolute, or relative to working_directory).",
    parameters: pathParameters(),          // 统一的 file_path + working_directory
    output: { schema: outputJson, render: (_a, v) => renderMarkdownWithWarning(v) },
    async execute(args, _exec) {
      const { file_path, working_directory } = args as {
        file_path: string;
        working_directory: string;
      };
      const file = resolveSafeFilePath(working_directory, file_path); // 路径安全（勿省略）
      const bytes = new Uint8Array(await readFile(file));
      return (await Promise.resolve(extractCsvFromBytes(bytes))) as unknown as JsonValue;
    },
  });
}
```

**三个强制点**：
1. `execute` 内必须先调 `resolveSafeFilePath`——路径安全不可绕过；
2. `description` 写给模型看，必须列出支持的扩展名与相对/绝对路径规则；
3. 返回值用 `as unknown as JsonValue` 对齐 `outputJson` schema 的推断类型。

### 第 4 步：加入工具注册表（`src/tools/index.ts`）

```ts
import { makeCsvTool } from "./csv.js";

export const FILEX_TOOLS: readonly ToolDefinition[] = [
  // …existing…
  makeCsvTool(),          // ← 加这一行
  makeListFormatsTool(),
];
```

### 第 5 步：更新调试工具映射（`src/tools/list-formats.ts`）

```ts
{ extension: ".csv", tool: "extract_csv" },  // execute() 返回数组中加一行
```

### 第 6 步：类型检查 + 模块冒烟

```sh
npm run typecheck          # 必须零错误

# 模块加载冒烟：确认新工具可被构造
node --import tsx/esm -e "
  const { FILEX_TOOLS } = await import('./src/tools/index.js');
  console.log(FILEX_TOOLS.map(t => t.name));
" --input-type=module
```

### 第 7 步：手动验收

| 用例 | 预期 |
| --- | --- |
| 正常样本（一份含表头的 csv） | 返回 Markdown 表格，`format: "csv"` |
| 空文件 / 只有表头 | 返回空 markdown 或占位说明，不崩溃 |
| 恶意编码（非 UTF-8 字节） | 抛 `UnsupportedCsvEncoding`，转为 `isError` |
| `file_path: "../x.csv"` | 抛 `PathOutsideWorkspace`（由 resolve-path 保证） |
| `filex_list_formats` | 输出包含 `.csv → extract_csv` |

### 同族格式（简化路径）

若新格式属于现有工具家族（例如给 Office 家族加 `.rtf` 的假想支持），
**不需要**新建工具模块，只需：

1. `extractors/office.ts` 的 `EXT_TO_FORMAT` 加映射；
2. `tools/office-family.ts` 的 `OfficeToolSpec` 描述中补充扩展名说明；
3. 对应工具（如 `word.ts`）的 `description` 与枚举追加新扩展名；
4. `list-formats.ts` 加映射行。

### 检查清单（提交前）

- [ ] `types.ts` 新增结果类型，且 `AnyExtractResult` 已扩展
- [ ] 提取器不依赖 `@deepseek-ai/*`（模块职责边界，见下表）
- [ ] 工具层复用 `pathParameters` / `outputJson` / `renderMarkdownWithWarning`，无自定义 schema 漂移
- [ ] `execute` 首行调用 `resolveSafeFilePath`
- [ ] WASM 资源在 `try/finally` 中释放（如适用）
- [ ] `FILEX_TOOLS` 与 `list-formats.ts` 均已更新
- [ ] `npm run typecheck` 零错误
- [ ] 第 7 步验收表全部通过
- [ ] 无 TODO/FIXME 占位代码
- [ ] 本 README 的「工具一览」表已补充新工具行

---

## 编译与构建

本插件**无需构建产物**——dsh 通过 `tsx` 直接加载 TypeScript 源码
（`cordis.yml` 的 `name` 指向 `src/filex.ts`）。这是 dsh 树外插件的标准形态。

```sh
# 类型检查即"编译验证"（noEmit，仅校验类型）
npm run typecheck
```

若未来需要发布为 npm 包（预编译 JS + d.ts），可追加：

```sh
# 可选：安装 tsup 后
npx tsup src/filex.ts --format esm --dts --outDir dist
```

当前版本刻意保持"零构建"以消除产物与源码漂移的风险。

---

## 安装部署

### 方式 A：开发挂载（`--patch`，推荐用于调试）

在启动命令后附加 patch 文件：

```sh
pnpm dsh web --patch /绝对路径/cordis.yml
```

> ⚠️ `cordis.yml` 中 `name` **必须是本机绝对路径**——patch 不改变 loader 的
> profile 目录，相对路径会解析失败。换机器部署时需同步修改该路径。

### 方式 B：profile 级持久挂载

把插件条目写入 dsh home 的 `cordis.patch.yml`（路径参考 dsh 文档
[Develop → Basic](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)），
使其对某 profile 永久生效，无需每次 `--patch`。

### 验证部署

```sh
# 1. 配置树检查
pnpm dsh --profile web --dump-config --patch ./cordis.yml | grep -A2 dsh-filex

# 2. 冒烟（用真实样本逐工具验证）
#    - 一份 docx/xlsx/pptx/doc/xls/ppt → extract_* 返回非空 Markdown
#    - 一份 text-based PDF → extract_pdf 返回 Markdown 且 pdf_type=TextBased
#    - 一份扫描件 PDF    → 返回 {pdf_type: "Scanned", markdown: null, warning}
#    - 一份 epub         → 返回含目录与章节的 Markdown
#    - 一份 odt/ods/odp/odg → extract_odf 返回对应 Markdown/表格
#    - file_path=../etc/passwd → 抛 PathOutsideWorkspace（isError）
```

### 卸载

移除启动命令中的 `--patch` 参数（或从 profile patch 文件删除对应条目）即可。
通过 `ctx.tools.register` 注册的工具会在插件卸载时被 cordis 自动撤销，无残留。

---

## 已知限制

| 限制 | 说明 | 规避 |
| --- | --- | --- |
| PDF 扫描件 | 无文字层，本工具拒绝提取 | 先用 OCR / vision 工具转换后重试 |
| EPUB 加密 | Adobe DRM / LCP 加密的书抛 `EpubEncrypted` | 使用已解密文件 |
| 大文件 | > 50MB 可能触发 WASM OOM（无硬限制） | 拆分文档 |
| Office 复杂元素 | 图表/公式/嵌入对象不还原，仅保留文字与表格 | 预先导出为 PDF |
| ODF 复杂元素 | 同上；odg 仅输出形状内文字 | — |
| WASM 首次调用延迟 | 模块编译约数百 ms，仅首次 | 插件已做懒加载单例，无重复开销 |

---

## 故障排查

<details>
<summary><b>插件未出现在 Plugin List</b></summary>

- 检查 `cordis.yml` 的 `name` 是否为绝对路径且指向存在的文件；
- 运行 `--dump-config` 确认条目被注入；
- 查看启动终端是否有模块加载错误（常见：忘记 `npm install`）。

</details>

<details>
<summary><b>工具调用报 Cannot find module 'xxx'</b></summary>

依赖未装全：重新 `npm install`。dsh 通过 tsx 解析依赖，
解析起点是插件文件所在目录的 `node_modules`。

</details>

<details>
<summary><b>WASM init 失败 / illegal instruction</b></summary>

Node 版本过低或架构不匹配。确认 `node -v ≥ 22.19`；容器/边缘环境确认支持
WASM SIMD。

</details>

<details>
<summary><b>odf.js 解析报 SchemaVersionMismatch</b></summary>

`odf.js` 升级后 schema 变更。锁定 `package.json` 中的 `odf.js` 版本号后重装。

</details>

---

## 许可

MIT。依赖库许可：`office-oxide-wasm` / `pdf-oxide-wasm`（MIT OR Apache-2.0）、
`@firecrawl/pdf-inspector-wasm`（MIT）、`odf.js`（MIT）、`jszip`（MIT/GPLv3 双许可，
本插件按 MIT 使用）、`htmlparser2`（MIT）。
