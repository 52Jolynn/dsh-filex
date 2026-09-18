import { makeOfficeTool } from "./office-family.js";

export function makeExcelTool() {
  return makeOfficeTool({
    toolName: "extract_excel",
    description:
      "Extract text from a Microsoft Excel workbook (.xls or .xlsx) as Markdown. " +
      "Supports local file paths (absolute, or relative to working_directory).",
    legacyExt: ".xls",
    modernExt: ".xlsx",
  });
}
