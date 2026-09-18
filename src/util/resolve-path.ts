import * as path from "node:path";
import * as fs from "node:fs";

/**
 * Resolves `filePath` for tool input and verifies the result points at a
 * regular file.
 *
 * Resolution rules:
 *   - absolute `filePath` → taken verbatim; `workingDirectory` is ignored
 *     entirely (not even validated — it is irrelevant, and tool callers may
 *     pass a scratch directory that does not exist)
 *   - relative `filePath` → joined onto `workingDirectory`, which must be an
 *     absolute existing directory
 *
 * For relative paths the result is additionally checked against workspace
 * escape (`..` segments or cross-drive targets), so a model-supplied relative
 * path cannot climb out of `workingDirectory`. Absolute paths bypass that
 * check by design — attachments live outside the workspace on purpose.
 *
 * Throws domain errors that map to tool `isError` results upstream:
 *   - `WorkingDirectoryInvalid`  : (relative paths only) cwd missing / not
 *                                  absolute / not a directory
 *   - `PathOutsideWorkspace`     : (relative paths only) resolved path escapes
 *                                  workingDirectory
 *   - `NotAFile`                 : path is a directory or non-existent
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
  // Absolute filePath: taken verbatim — workingDirectory is irrelevant.
  if (path.isAbsolute(filePath)) {
    const resolved = path.normalize(filePath);
    let fileStat: fs.Stats;
    try {
      fileStat = fs.statSync(resolved);
    } catch (cause) {
      throw new NotAFile(resolved, cause);
    }
    if (!fileStat.isFile()) {
      throw new NotAFile(resolved);
    }
    return resolved;
  }

  // Relative filePath: validate workingDirectory
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

  // Resolve candidate absolute path and reject if it escapes the workspace
  const resolved = path.resolve(workingDirectory, filePath);

  const rel = path.relative(workingDirectory, resolved);
  const escapes = rel === "" ? false : rel.startsWith("..") || path.isAbsolute(rel);
  if (escapes) {
    throw new PathOutsideWorkspace(workingDirectory, resolved);
  }

  // Verify it's a regular file
  let fileStat: fs.Stats;
  try {
    fileStat = fs.statSync(resolved);
  } catch (cause) {
    throw new NotAFile(resolved, cause);
  }
  if (!fileStat.isFile()) {
    throw new NotAFile(resolved);
  }

  return resolved;
}