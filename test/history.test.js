const test = require("node:test");
const assert = require("node:assert/strict");

const { maxHistoryDays, retainHistory } = require("../server/history");

function dayAt(offset) {
  return new Date(Date.UTC(2025, 0, offset + 1)).toISOString().slice(0, 10);
}

test("history retention keeps the newest 400 daily snapshots in date order", () => {
  const snapshots = Array.from({ length: 405 }, (_, index) => ({
    date: dayAt(index),
    totalUsd: index,
    assets: []
  })).reverse();

  const retained = retainHistory(snapshots);

  assert.equal(maxHistoryDays, 400);
  assert.equal(retained.length, 400);
  assert.equal(retained[0].date, dayAt(5));
  assert.equal(retained.at(-1).date, dayAt(404));
  assert.deepEqual(retained.map((snapshot) => snapshot.date), [...retained.map((snapshot) => snapshot.date)].sort());
});
