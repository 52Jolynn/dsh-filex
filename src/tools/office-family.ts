import { defineTool } from "@deepseek-ai/dsh-tools";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";

import { extractOffice } from "../extractors/office.js";
import { outputJson, pathParameters, renderMarkdownWithWarning } from "./common.js";

/**
 * Factory for the three Microsoft Office tools (word / ppt / excel).
 *
 * The three tools differ only in extension whitelist and enum vocabulary;
 * everything else (parameters, execution flow, output shape) is identical.
 * A new Office-family tool is therefore ~15 lines of configuration.
 */
export interface OfficeToolSpec {
  /** Tool name exposed to the model, e.g. `extract_word`. */
  toolName: string;
  /** Model-facing description; must name the supported extensions. */
  description: string;
  /** Legacy extension (dot-prefixed, lowercase), e.g. `.doc`. */
  legacyExt: string;
  /** Modern extension (dot-prefixed, lowercase), e.g. `.docx`. */
  modernExt: string;
}

export function makeOfficeTool(spec: OfficeToolSpec): ToolDefinition {
  const legacy = spec.legacyExt.slice(1) as string; // "doc"
  const modern = spec.modernExt.slice(1) as string; // "docx"

  return defineTool({
    name: spec.toolName,
    description: spec.description,
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
      const { resolveSafeFilePath } = await import("../util/resolve-path.js");
      const file = resolveSafeFilePath(working_directory, file_path);

      const lower = file.toLowerCase();
      const requested = lower.endsWith(spec.legacyExt) ? legacy : modern;
      const result = await extractOffice(file);

      // The WASM layer detects the real format; prefer it when it matches the
      // family, otherwise fall back to the extension-derived guess.
      const detected = result.format === legacy || result.format === modern ? result.format : requested;

      return {
        markdown: result.markdown,
        format: detected,
        format_requested: requested,
        warning: result.warning,
      } as unknown as JsonValue;
    },
  });
}
