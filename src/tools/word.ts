import { makeOfficeTool } from "./office-family.js";

export function makeWordTool() {
  return makeOfficeTool({
    toolName: "extract_word",
    description:
      "Extract text from a Microsoft Word document (.doc or .docx) as Markdown. " +
      "Supports local file paths (absolute, or relative to working_directory).",
    legacyExt: ".doc",
    modernExt: ".docx",
  });
}
