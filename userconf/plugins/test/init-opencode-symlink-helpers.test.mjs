import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const repoRoot = new URL("../../..", import.meta.url).pathname
const initScript = join(repoRoot, "init_opencode.sh")

test("init_opencode uses safe symlink target normalization helpers", () => {
  const source = readFileSync(initScript, "utf8")

  assert.match(source, /cd -- "\$target_dir"/)
  assert.doesNotMatch(source, /"\$managed_suffix"\|\*\/"\$managed_suffix"/)
})
