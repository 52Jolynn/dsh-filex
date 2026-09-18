import type { Context } from "@deepseek-ai/cordis";

import { FILEX_TOOLS } from "./tools/index.js";

/**
 * dsh-filex plugin entry.
 *
 * This file stays deliberately tiny: every tool is described in its own
 * module under `src/tools/`, and `FILEX_TOOLS` is the single registry that
 * `apply` walks. Registration is effect-based — when the plugin unloads,
 * cordis disposes each registration and the tools disappear.
 */
export const name = "dsh-filex";

export const inject = ["tools"];

export function apply(ctx: Context): void {
  for (const tool of FILEX_TOOLS) {
    ctx.tools.register(tool);
  }
}
