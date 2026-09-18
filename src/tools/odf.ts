import { defineTool } from "@deepseek-ai/dsh-tools";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";

import { extractOdf } from "../extractors/odf.js";
import { resolveSafeFilePath } from "../util/resolve-path.js";
import { outputJson, pathParameters, renderMarkdownWithWarning } from "./common.js";

export function makeOdfTool(): ToolDefinition {
  return defineTool({
    name: "extract_odf",
    description:
      "Extract content from an OpenDocument file as Markdown. Supports " +
      ".odt (text), .ods (spreadsheet), .odp (presentation), and .odg (drawing). " +
      "Supports local file paths (absolute, or relative to working_directory). " +
      "Complex elements like charts, formulas, and embedded objects are not " +
      "fully reconstructed — text and tables are preserved.",
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
      return (await extractOdf(file)) as unknown as JsonValue;
    },
  });
}
