const test = require("node:test");
const assert = require("node:assert/strict");

const {
  availableHistoryPeriods,
  formatTokenAmount,
  formatWalletAmount,
  niceChartTicks,
  splitForColumns,
  selectHistoryPeriod
} = require("../public/ui");

test("compact amount formatting rounds ordinary values and preserves tiny nonzero values", () => {
  assert.equal(formatTokenAmount("94060.5628691").display, "94060.56287");
  assert.equal(formatTokenAmount("5029.358065").display, "5029.35807");
  assert.equal(formatTokenAmount("0.96609236").display, "0.96609");
  assert.equal(formatTokenAmount("0.00457592").display, "0.00458");
  assert.equal(formatTokenAmount("23.997600").display, "23.9976");
  assert.equal(formatTokenAmount("0.000000000000000001").display, "0.00000000…0001");
});

test("wallet-derived amounts retain full precision while using compact display rules", () => {
  assert.equal(formatWalletAmount("94060.5628691").display, "94060.56");
  assert.equal(formatWalletAmount("1").display, "1.00");
  assert.equal(formatWalletAmount("0.96609236").display, "0.96609");
  assert.equal(formatWalletAmount("0.00457592").display, "0.00458");
  assert.equal(formatWalletAmount("0.000000000000000001").display, "0.00000000…0001");
  assert.equal(formatWalletAmount("5029.358065").full, "5029.358065");
});

test("history period controls expose only covered daily ranges and never invent snapshots", () => {
  const history = [
    { date: "2026-05-17", totalUsd: 100 },
    { date: "2026-07-03", totalUsd: 110 },
    { date: "2026-08-03", totalUsd: 120 }
  ];

  assert.deepEqual(availableHistoryPeriods(history), ["1M", "ALL"]);
  assert.deepEqual(selectHistoryPeriod(history, "1M"), history.slice(1));
  assert.deepEqual(selectHistoryPeriod(history, "3M"), history);
  assert.deepEqual(selectHistoryPeriod(history, "ALL"), history);
});

test("allocation columns preserve descending read order and keep the extra row on the left", () => {
  const assets = ["A", "B", "C", "D", "E"];
  assert.deepEqual(splitForColumns(assets), [["A", "B", "C"], ["D", "E"]]);
});

test("history scale uses rounded standard steps while covering every data point", () => {
  const scale = niceChartTicks(29607.17, 44816.29);
  assert.equal(scale.step, 5000);
  assert.deepEqual(scale.ticks, [25000, 30000, 35000, 40000, 45000]);
  assert.ok(scale.min <= 29607.17);
  assert.ok(scale.max >= 44816.29);
  assert.ok(scale.ticks.length >= 4 && scale.ticks.length <= 6);

  const fractionalScale = niceChartTicks(100, 109);
  assert.equal(fractionalScale.step, 2.5);
});
