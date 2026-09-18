import { makeOfficeTool } from "./office-family.js";

export function makePptTool() {
  return makeOfficeTool({
    toolName: "extract_ppt",
    description:
      "Extract text from a Microsoft PowerPoint document (.ppt or .pptx) as Markdown. " +
      "Supports local file paths (absolute, or relative to working_directory).",
    legacyExt: ".ppt",
    modernExt: ".pptx",
  });
}
