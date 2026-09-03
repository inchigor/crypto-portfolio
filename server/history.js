const fs = require("fs/promises");
const path = require("path");

const historyPath = path.join(__dirname, "..", "data", "history.json");
const maxHistoryDays = 90;

async function ensureHistoryFile() {
  try {
    await fs.access(historyPath);
  } catch {
    await fs.mkdir(path.dirname(historyPath), { recursive: true });
    await fs.writeFile(historyPath, "[]\n", "utf8");
  }
}

async function readHistory() {
  await ensureHistoryFile();

  const raw = await fs.readFile(historyPath, "utf8");
  return JSON.parse(raw);
}

async function writeHistory(history) {
  await fs.writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

async function upsertDailySnapshot(totalUsd, assets) {
  if (!totalUsd) {
    return;
  }

  const history = await readHistory();
  const today = getLocalDateString();
  const snapshot = {
    date: today,
    totalUsd: roundCurrency(totalUsd),
    assets: assets.map((asset) => ({
      ...asset,
      totalUsd: roundCurrency(asset.totalUsd)
    }))
  };

  const existingIndex = history.findIndex((item) => item.date === today);

  if (existingIndex >= 0) {
    history[existingIndex] = snapshot;
  } else {
    history.push(snapshot);
  }

  history.sort((a, b) => a.date.localeCompare(b.date));
  await writeHistory(history.slice(-maxHistoryDays));
}

async function getRecentHistory() {
  const history = await readHistory();
  return history.sort((a, b) => a.date.localeCompare(b.date)).slice(-maxHistoryDays);
}

module.exports = {
  upsertDailySnapshot,
  getRecentHistory
};
