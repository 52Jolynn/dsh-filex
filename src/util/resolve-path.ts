import * as path from "node:path";
import * as fs from "node:fs";

/**
 * Resolves `filePath` against `workingDirectory` and verifies the result
 * stays inside the workspace and points at a regular file.
 *
 * Throws domain errors that map to tool `isError` results upstream:
 *   - `WorkingDirectoryInvalid`  : cwd missing / not absolute / not a directory
 *   - `PathOutsideWorkspace`     : resolved path escapes workingDirectory
 *   - `NotAFile`                 : path is a directory or non-existent
 *
 * The path-traversal check uses `path.relative` and refuses any relative
 * path starting with `..`, plus the cross-drive case (Windows, where
 * `path.relative` returns the absolute target verbatim).
 */
export class WorkingDirectoryInvalid extends Error {
  constructor(public readonly given: string, cause?: unknown) {
    super(`working_directory invalid: ${given}`);
    this.name = "WorkingDirectoryInvalid";
    if (cause !== undefined) this.cause = cause;
  }
}

export class PathOutsideWorkspace extends Error {
  constructor(
    public readonly workingDirectory: string,
    public readonly resolved: string,
  ) {
    super(
      `path is outside working_directory: working_directory=${workingDirectory} resolved=${resolved}`,
    );
    this.name = "PathOutsideWorkspace";
  }
}

export class NotAFile extends Error {
  constructor(public readonly resolved: string, cause?: unknown) {
    super(`not a regular file: ${resolved}`);
    this.name = "NotAFile";
    if (cause !== undefined) this.cause = cause;
  }
}

export function resolveSafeFilePath(
  workingDirectory: string,
  filePath: string,
): string {
  // 1. Validate workingDirectory
  if (!path.isAbsolute(workingDirectory)) {
    throw new WorkingDirectoryInvalid(workingDirectory);
  }
  let cwdStat: fs.Stats;
  try {
    cwdStat = fs.statSync(workingDirectory);
  } catch (cause) {
    throw new WorkingDirectoryInvalid(workingDirectory, cause);
  }
  if (!cwdStat.isDirectory()) {
    throw new WorkingDirectoryInvalid(workingDirectory);
  }

  // 2. Resolve candidate absolute path
  const resolved = path.resolve(workingDirectory, filePath);

  // 3. Reject if it escapes the workspace
  const rel = path.relative(workingDirectory, resolved);
  const escapes = rel === "" ? false : rel.startsWith("..") || path.isAbsolute(rel);
  if (escapes) {
    throw new PathOutsideWorkspace(workingDirectory, resolved);
  }

  // 4. Verify it's a regular file
  let fileStat: fs.Stats;
  try {
    fileStat = fs.statSync(resolved);
  } catch (cause) {
    throw new NotAFile(resolved, cause);
  }
  if (!fileStat.isFile()) {
    throw new NotAFile(resolved);
  }

  // 5. Return
  return resolved;
}