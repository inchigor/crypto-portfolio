const fs = require("fs/promises");
const path = require("path");
const { readPortfolio } = require("./portfolio");
const { getRecentHistory } = require("./history");
const { readWalletState, readWallets } = require("./wallet");

const backupsPath = path.join(__dirname, "..", "data", "backups");

function getTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
}

async function ensureBackupsFolder() {
  await fs.mkdir(backupsPath, { recursive: true });
}

async function writeBackupFile(fileName, data) {
  await ensureBackupsFolder();
  const filePath = path.join(backupsPath, fileName);
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return fileName;
}

async function backupPortfolioBeforeImport(portfolio) {
  const fileName = `portfolio-before-import-${getTimestamp()}.json`;
  return writeBackupFile(fileName, portfolio);
}

async function backupPortfolioBeforeManualPositionsMigration(portfolio) {
  const fileName = `portfolio-before-manual-positions-migration-${getTimestamp()}.json`;
  return writeBackupFile(fileName, portfolio);
}

async function backupDataBeforeImport(portfolio, wallet, wallets) {
  const timestamp = getTimestamp();
  const writes = [
    writeBackupFile(`portfolio-before-import-${timestamp}.json`, portfolio),
    writeBackupFile(`wallet-before-import-${timestamp}.json`, wallet),
    writeBackupFile(`wallets-before-import-${timestamp}.json`, wallets)
  ];
  return Promise.all(writes);
}

async function createManualBackup() {
  const timestamp = getTimestamp();
  const [portfolio, history, wallet, wallets] = await Promise.all([
    readPortfolio(),
    getRecentHistory(),
    readWalletState(),
    readWallets()
  ]);
  const createdFiles = await Promise.all([
    writeBackupFile(`portfolio-${timestamp}.json`, portfolio),
    writeBackupFile(`history-${timestamp}.json`, history),
    writeBackupFile(`wallet-${timestamp}.json`, wallet),
    writeBackupFile(`wallets-${timestamp}.json`, wallets)
  ]);

  return createdFiles;
}

module.exports = {
  backupPortfolioBeforeImport,
  backupPortfolioBeforeManualPositionsMigration,
  backupDataBeforeImport,
  createManualBackup
};
