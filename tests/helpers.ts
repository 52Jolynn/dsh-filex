import * as path from "node:path";
import * as url from "node:url";

/** Absolute path to a fixture under tests/fixtures/. */
export function fixture(name: string): string {
  return path.join(path.dirname(url.fileURLToPath(import.meta.url)), "fixtures", name);
}
