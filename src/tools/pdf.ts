import { defineTool } from "@deepseek-ai/dsh-tools";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";

import { extractPdf } from "../extractors/pdf.js";
import { resolveSafeFilePath } from "../util/resolve-path.js";
import { outputJson, pathParameters, renderMarkdownWithWarning } from "./common.js";

export function makePdfTool(): ToolDefinition {
  return defineTool({
    name: "extract_pdf",
    description:
      "Extract text from a PDF file as Markdown. Supports local file paths " +
      "(absolute, or relative to working_directory). Returns the full Markdown " +
      "for text-based PDFs. For scanned/image-based PDFs the tool returns " +
      "{pdf_type, markdown: null, warning} so the caller can run OCR first.",
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
      return (await extractPdf(file)) as unknown as JsonValue;
    },
  });
}
