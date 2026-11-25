import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";

/**
 * Every test file runs on a database of its own, in a temporary folder removed when the file is done. Call it at the
 * top of the file, before anything from src is imported (the database opens on first use, at the path set here).
 */
export function useTempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "kalchas-test-"));
  process.env.KALCHAS_DB = join(dir, "test.db");
  process.env.KALCHAS_IGNORE_BUDGET = "1";
  process.env.KALCHAS_TEST_OFFLINE = "1";
  after(() => rmSync(dir, { recursive: true, force: true }));
  return process.env.KALCHAS_DB;
}
