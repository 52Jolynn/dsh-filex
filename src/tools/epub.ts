import { defineTool } from "@deepseek-ai/dsh-tools";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";

import { extractEpub } from "../extractors/epub.js";
import { resolveSafeFilePath } from "../util/resolve-path.js";
import { outputJson, pathParameters, renderMarkdownWithWarning } from "./common.js";

export function makeEpubTool(): ToolDefinition {
  return defineTool({
    name: "extract_epub",
    description:
      "Extract content from an EPUB e-book as Markdown, with chapters in spine " +
      "order. Output begins with the book title (when available) and a Markdown " +
      "table of contents derived from NCX or nav.xhtml. Supports local file paths " +
      "(absolute, or relative to working_directory). Encrypted (DRM/LCP) books " +
      "are not supported — the tool will raise an error.",
    parameters: pathParameters(),
    output: {
      schema: outputJson,
      render: (_args, value) => renderMarkdownWithWarning(value),
    },
    async execute(args, _exec) {
      const { file_path, working_directory } = args as {
        file_path: string;
        working_directory: string;
      };
      const file = resolveSafeFilePath(working_directory, file_path);
      return (await extractEpub(file)) as unknown as JsonValue;
    },
  });
}
