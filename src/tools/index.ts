import type { ToolDefinition } from "@deepseek-ai/dsh-tools";

import { makePdfTool } from "./pdf.js";
import { makeWordTool } from "./word.js";
import { makePptTool } from "./ppt.js";
import { makeExcelTool } from "./excel.js";
import { makeEpubTool } from "./epub.js";
import { makeOdfTool } from "./odf.js";
import { makeListFormatsTool } from "./list-formats.js";

/**
 * The single source of truth for which tools this plugin exposes. Adding a
 * new format means adding one module in this directory and one line here —
 * nothing else in the plugin needs to change.
 */
export const FILEX_TOOLS: readonly ToolDefinition[] = [
  makePdfTool(),
  makeWordTool(),
  makePptTool(),
  makeExcelTool(),
  makeEpubTool(),
  makeOdfTool(),
  makeListFormatsTool(),
];
