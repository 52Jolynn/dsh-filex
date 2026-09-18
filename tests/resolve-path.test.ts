import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  NotAFile,
  PathOutsideWorkspace,
  WorkingDirectoryInvalid,
  resolveSafeFilePath,
} from "../src/util/resolve-path.js";
import { fixture } from "./helpers.js";

describe("resolveSafeFilePath — absolute file_path", () => {
  it("uses an absolute file_path verbatim, ignoring working_directory entirely", () => {
    // working_directory deliberately does not exist: for absolute file_path it
    // must not even be validated (tool callers may pass a scratch directory).
    const result = resolveSafeFilePath("/definitely/not/a/real/dir", fixture("sample.docx"));

    expect(result).toBe(path.normalize(fixture("sample.docx")));
  });

  it("still rejects an absolute file_path that does not exist", () => {
    expect(() =>
      resolveSafeFilePath("/home/micray/abc", "/home/micray/.dsh/no/such/file.docx"),
    ).toThrow(NotAFile);
  });

  it("still rejects an absolute file_path pointing at a directory", () => {
    expect(() => resolveSafeFilePath("/home/micray/abc", os.tmpdir())).toThrow(NotAFile);
  });
});

describe("resolveSafeFilePath — relative file_path", () => {
  it("joins working_directory as the prefix", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "filex-cwd-"));
    try {
      fs.writeFileSync(path.join(dir, "report.docx"), "x");
      const result = resolveSafeFilePath(dir, "report.docx");
      expect(result).toBe(path.join(dir, "report.docx"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects relative paths escaping working_directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "filex-cwd-"));
    try {
      expect(() => resolveSafeFilePath(dir, "../outside.docx")).toThrow(PathOutsideWorkspace);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("validates working_directory for relative paths", () => {
    expect(() =>
      resolveSafeFilePath("not/absolute", "report.docx"),
    ).toThrow(WorkingDirectoryInvalid);
    expect(() =>
      resolveSafeFilePath("/definitely/not/a/real/dir", "report.docx"),
    ).toThrow(WorkingDirectoryInvalid);
  });

  it("rejects a relative path that does not exist", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "filex-cwd-"));
    try {
      expect(() => resolveSafeFilePath(dir, "missing.docx")).toThrow(NotAFile);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
