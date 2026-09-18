import { defineTool } from "@deepseek-ai/dsh-tools";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";

/**
 * Debug helper: tells the model which extension maps to which tool so it can
 * dispatch correctly without guessing.
 */
export function makeListFormatsTool(): ToolDefinition {
  return defineTool({
    name: "filex_list_formats",
    description:
      "List every file extension and matching tool supported by dsh-filex.",
    parameters: {},
    output: {
      schema: { type: "json" },
      render: (_args, value) => [
        { type: "text", text: JSON.stringify(value, null, 2) },
      ],
    },
    async execute() {
      return [
        { extension: ".pdf", tool: "extract_pdf" },
        { extension: ".doc", tool: "extract_word" },
        { extension: ".docx", tool: "extract_word" },
        { extension: ".ppt", tool: "extract_ppt" },
        { extension: ".pptx", tool: "extract_ppt" },
        { extension: ".xls", tool: "extract_excel" },
        { extension: ".xlsx", tool: "extract_excel" },
        { extension: ".epub", tool: "extract_epub" },
        { extension: ".odt", tool: "extract_odf" },
        { extension: ".ods", tool: "extract_odf" },
        { extension: ".odp", tool: "extract_odf" },
        { extension: ".odg", tool: "extract_odf" },
      ] as unknown as JsonValue;
    },
  });
}
