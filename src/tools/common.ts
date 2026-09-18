import type { ContentBlock } from "@deepseek-ai/dsh-llm";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";

/**
 * Shared building blocks for every filex tool definition. Keeping these here
 * means a new tool module only describes what makes it *different*.
 */

/** Standard two-parameter input shared by every extractor tool. */
export function pathParameters() {
  return {
    file_path: {
      type: "string" as const,
      required: true as const,
      description: "File path; absolute, or relative to working_directory.",
    },
    working_directory: {
      type: "string" as const,
      required: true as const,
      description: "Workspace root used to resolve relative file_path safely.",
    },
  };
}

/**
 * Every extractor returns a JSON object; the `json` value-schema keeps the
 * wrapper flexible while `execute` supplies the typed shape.
 */
export const outputJson = { type: "json" as const };

interface MarkdownCarrier {
  markdown?: string | null;
  warning?: string | null;
}

/**
 * Uniform model-facing render: warning first (if any), then the markdown
 * body, with a placeholder when both are empty.
 */
export function renderMarkdownWithWarning(value: JsonValue): ContentBlock[] {
  const v = value as MarkdownCarrier;
  const parts: string[] = [];
  if (v.warning) parts.push(`# Warning\n\n${v.warning}`);
  if (v.markdown) parts.push(v.markdown);
  if (parts.length === 0) parts.push("(no extractable content)");
  return [{ type: "text", text: parts.join("\n\n") }];
}
