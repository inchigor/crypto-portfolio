const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { writeJsonAtomically } = require("../server/storage");

test("atomic JSON storage creates, replaces and removes its temporary file", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "crypto-portfolio-storage-"));
  const filePath = path.join(directory, "nested", "state.json");

  try {
    await writeJsonAtomically(filePath, { version: 1 });
    assert.deepEqual(JSON.parse(await fs.readFile(filePath, "utf8")), { version: 1 });
    assert.match(await fs.readFile(filePath, "utf8"), /\n$/);

    await writeJsonAtomically(filePath, { version: 2, replaced: true });
    assert.deepEqual(JSON.parse(await fs.readFile(filePath, "utf8")), { version: 2, replaced: true });

    const files = await fs.readdir(path.dirname(filePath));
    assert.equal(files.some((name) => name.endsWith(".tmp")), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
