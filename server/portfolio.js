const fs = require("fs/promises");
const path = require("path");

const portfolioPath = path.join(__dirname, "..", "data", "portfolio.json");

async function ensurePortfolioFile() {
  try {
    await fs.access(portfolioPath);
  } catch {
    await fs.mkdir(path.dirname(portfolioPath), { recursive: true });
    await fs.writeFile(portfolioPath, "[]\n", "utf8");
  }
}

async function readPortfolio() {
  await ensurePortfolioFile();

  const raw = await fs.readFile(portfolioPath, "utf8");
  return JSON.parse(raw);
}

async function writePortfolio(portfolio) {
  await fs.writeFile(portfolioPath, `${JSON.stringify(portfolio, null, 2)}\n`, "utf8");
}

function normalizeManualWalletId(value) {
  if (value == null || value === "") return null;
  const walletId = String(value).trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(walletId)) {
    throw new Error("manual position walletId is invalid");
  }

  return walletId;
}

function normalizeManualPositions(input, fallbackAmount) {
  const fallback = Number(fallbackAmount);
  if (!Number.isFinite(fallback) || fallback < 0) {
    throw new Error("amount must be a non-negative number");
  }

  const rawPositions = Array.isArray(input)
    ? input
    : [{ walletId: null, amount: fallback }];
  const amountsByWalletId = new Map();

  for (const position of rawPositions) {
    if (!position || typeof position !== "object" || Array.isArray(position)) {
      throw new Error("manual position must be an object");
    }

    const walletId = normalizeManualWalletId(position.walletId);
    const amount = Number(position.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("manual position amount must be a non-negative number");
    }

    const key = walletId || "__unassigned__";
    amountsByWalletId.set(key, (amountsByWalletId.get(key) || 0) + amount);
  }

  const positions = [...amountsByWalletId.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([key, amount]) => ({
      walletId: key === "__unassigned__" ? null : key,
      amount
    }));

  return positions.length ? positions : [{ walletId: null, amount: 0 }];
}

function manualPositionsTotal(positions) {
  return positions.reduce((sum, position) => sum + position.amount, 0);
}

function getManualPositions(asset) {
  return normalizeManualPositions(asset?.manualPositions, asset?.amount);
}

function withManualPositions(asset) {
  const manualPositions = getManualPositions(asset);
  return {
    ...asset,
    amount: manualPositionsTotal(manualPositions),
    manualPositions
  };
}

function migratePortfolioManualPositions(portfolio) {
  let migrated = false;
  const nextPortfolio = portfolio.map((asset) => {
    if (Array.isArray(asset?.manualPositions)) return withManualPositions(asset);
    migrated = true;
    return withManualPositions(asset);
  });

  return { migrated, portfolio: nextPortfolio };
}

function unassignManualPositionsForWallet(portfolio, walletIdInput) {
  const walletId = normalizeManualWalletId(walletIdInput);
  if (!walletId) return { changed: false, portfolio };

  let changed = false;
  const nextPortfolio = portfolio.map((asset) => {
    const manualPositions = getManualPositions(asset);
    if (!manualPositions.some((position) => position.walletId === walletId)) {
      return withManualPositions(asset);
    }

    changed = true;
    return {
      ...asset,
      manualPositions: normalizeManualPositions(
        manualPositions.map((position) =>
          position.walletId === walletId ? { ...position, walletId: null } : position
        ),
        0
      )
    };
  }).map(withManualPositions);

  return { changed, portfolio: nextPortfolio };
}

function normalizeAssetInput(input) {
  const name = String(input.name || "").trim();
  const symbol = String(input.symbol || "").trim().toUpperCase();
  const coingeckoId = String(input.coingeckoId || "").trim().toLowerCase();
  const cmcId = input.cmcId == null || input.cmcId === "" ? null : Number(input.cmcId);
  const amount = Number(input.amount);
  const fallbackId = slugify(`${name}-${symbol}`);
  const id = String(input.id || coingeckoId || fallbackId).trim().toLowerCase();

  if (!id || !name || !symbol) {
    throw new Error("id, name and symbol are required");
  }

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("amount must be a non-negative number");
  }

  if (cmcId !== null && (!Number.isInteger(cmcId) || cmcId <= 0)) {
    throw new Error("cmcId must be a positive integer");
  }

  const manualPositions = normalizeManualPositions(
    input.walletId === undefined
      ? input.manualPositions
      : [{ walletId: input.walletId, amount }],
    amount
  );
  const manualAmount = manualPositionsTotal(manualPositions);

  if (
    Array.isArray(input.manualPositions) &&
    Math.abs(amount - manualAmount) > Number.EPSILON * Math.max(1, amount, manualAmount)
  ) {
    throw new Error("amount must equal the total of manualPositions");
  }

  return {
    id,
    name,
    symbol,
    coingeckoId,
    ...(cmcId !== null ? { cmcId } : {}),
    amount: manualAmount,
    manualPositions,
    source: "manual"
  };
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeImportedAsset(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("each asset must be an object");
  }

  const id = typeof input.id === "string" ? input.id.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const symbol = typeof input.symbol === "string" ? input.symbol.trim().toUpperCase() : "";
  const coingeckoId =
    typeof input.coingeckoId === "string" ? input.coingeckoId.trim().toLowerCase() : "";
  const cmcId =
    input.cmcId == null
      ? null
      : typeof input.cmcId === "number" && Number.isInteger(input.cmcId) && input.cmcId > 0
        ? input.cmcId
        : NaN;
  const amount = input.amount;
  const source =
    typeof input.source === "string" && input.source.trim() ? input.source.trim() : "manual";

  if (!id || !name || !symbol || !coingeckoId) {
    throw new Error("id, name, symbol and coingeckoId must be non-empty strings");
  }

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    throw new Error("amount must be a non-negative number");
  }

  if (Number.isNaN(cmcId)) {
    throw new Error("cmcId must be a positive integer when provided");
  }

  const manualPositions = normalizeManualPositions(input.manualPositions, amount);
  const manualAmount = manualPositionsTotal(manualPositions);
  if (Math.abs(amount - manualAmount) > Number.EPSILON * Math.max(1, amount, manualAmount)) {
    throw new Error("amount must equal the total of manualPositions");
  }

  return {
    id,
    name,
    symbol,
    coingeckoId,
    ...(cmcId !== null ? { cmcId } : {}),
    amount: manualAmount,
    manualPositions,
    source
  };
}

function validateImportedPortfolio(input) {
  if (!Array.isArray(input)) {
    throw new Error("portfolio import must be a JSON array");
  }

  const normalizedPortfolio = input.map(normalizeImportedAsset);
  const seenIds = new Set();
  const seenCoinIds = new Set();

  for (const asset of normalizedPortfolio) {
    if (seenIds.has(asset.id)) {
      throw new Error(`duplicate asset id: ${asset.id}`);
    }

    if (seenCoinIds.has(asset.coingeckoId)) {
      throw new Error(`duplicate coingeckoId: ${asset.coingeckoId}`);
    }

    seenIds.add(asset.id);
    seenCoinIds.add(asset.coingeckoId);
  }

  return normalizedPortfolio;
}

function parsePortfolioImport(input) {
  if (Array.isArray(input)) {
    return {
      format: "legacy",
      portfolio: validateImportedPortfolio(input),
      wallet: null
    };
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("portfolio import must be a JSON array or export package");
  }

  if (!([2, 3, 4].includes(input.version)) || !Array.isArray(input.portfolio)) {
    throw new Error("unsupported portfolio export package");
  }

  return {
    format: "package",
    portfolio: validateImportedPortfolio(input.portfolio),
    wallet: input.wallet ?? null
  };
}

async function addAsset(input) {
  const portfolio = await readPortfolio();
  const asset = normalizeAssetInput(input);

  if (portfolio.some((item) => item.id === asset.id || item.coingeckoId === asset.coingeckoId)) {
    throw new Error("asset already exists");
  }

  portfolio.push(asset);
  await writePortfolio(portfolio);
  return asset;
}

async function updateAssetAmount(id, amountInput, walletIdInput = null) {
  const amount = Number(amountInput);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("amount must be a non-negative number");
  }

  const portfolio = await readPortfolio();
  const asset = portfolio.find((item) => item.id === id);

  if (!asset) {
    return null;
  }

  const walletId = normalizeManualWalletId(walletIdInput);
  const manualPositions = getManualPositions(asset);
  const position = manualPositions.find((item) => item.walletId === walletId);

  if (position) {
    position.amount = amount;
  } else {
    manualPositions.push({ walletId, amount });
  }

  asset.manualPositions = normalizeManualPositions(manualPositions, 0);
  asset.amount = manualPositionsTotal(asset.manualPositions);
  await writePortfolio(portfolio);
  return asset;
}

async function addBuy(id, amountInput, walletIdInput) {
  const amount = Number(amountInput);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be a positive number");
  }

  const portfolio = await readPortfolio();
  const asset = portfolio.find((item) => item.id === id);

  if (!asset) {
    return null;
  }

  Object.assign(asset, addManualBuyToAsset(asset, amount, walletIdInput));
  await writePortfolio(portfolio);
  return asset;
}

function addManualBuyToAsset(asset, amountInput, walletIdInput) {
  const amount = Number(amountInput);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be a positive number");
  }
  const manualPositions = getManualPositions(asset);
  const walletId = walletIdInput === undefined
    ? manualPositions.length === 1 ? manualPositions[0].walletId : null
    : normalizeManualWalletId(walletIdInput);
  if (walletIdInput === undefined && manualPositions.length > 1) {
    throw new Error("walletId is required when an asset has multiple manual positions");
  }
  const position = manualPositions.find((item) => item.walletId === walletId);
  if (position) position.amount += amount;
  else manualPositions.push({ walletId, amount });
  return withManualPositions({ ...asset, manualPositions });
}

async function moveManualPosition(id, fromWalletIdInput, toWalletIdInput, amountInput) {
  const amount = Number(amountInput);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("manual position move amount must be a positive number");
  }

  const fromWalletId = normalizeManualWalletId(fromWalletIdInput);
  const toWalletId = normalizeManualWalletId(toWalletIdInput);
  if (fromWalletId === toWalletId) {
    throw new Error("manual position source and destination must differ");
  }

  const portfolio = await readPortfolio();
  const asset = portfolio.find((item) => item.id === id);
  if (!asset) return null;

  Object.assign(asset, moveManualPositionInAsset(asset, fromWalletId, toWalletId, amount));
  await writePortfolio(portfolio);
  return asset;
}

function moveManualPositionInAsset(asset, fromWalletIdInput, toWalletIdInput, amountInput) {
  const amount = Number(amountInput);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("manual position move amount must be a positive number");
  const fromWalletId = normalizeManualWalletId(fromWalletIdInput);
  const toWalletId = normalizeManualWalletId(toWalletIdInput);
  if (fromWalletId === toWalletId) throw new Error("manual position source and destination must differ");
  const manualPositions = getManualPositions(asset);
  const source = manualPositions.find((item) => item.walletId === fromWalletId);
  if (!source || source.amount < amount) throw new Error("manual position does not have enough amount");
  source.amount -= amount;
  const destination = manualPositions.find((item) => item.walletId === toWalletId);
  if (destination) destination.amount += amount;
  else manualPositions.push({ walletId: toWalletId, amount });
  return withManualPositions({ ...asset, manualPositions });
}

function assignUnassignedManualPosition(asset, walletIdInput, amountInput) {
  return moveManualPositionInAsset(asset, null, walletIdInput, amountInput);
}

async function assignUnassignedManualPositionById(id, walletIdInput, amountInput) {
  const portfolio = await readPortfolio();
  const asset = portfolio.find((item) => item.id === id);
  if (!asset) return null;

  Object.assign(asset, assignUnassignedManualPosition(asset, walletIdInput, amountInput));
  await writePortfolio(portfolio);
  return asset;
}

async function deleteAsset(id) {
  const portfolio = await readPortfolio();
  const nextPortfolio = portfolio.filter((item) => item.id !== id);

  if (nextPortfolio.length === portfolio.length) {
    return false;
  }

  await writePortfolio(nextPortfolio);
  return true;
}

module.exports = {
  readPortfolio,
  writePortfolio,
  addAsset,
  updateAssetAmount,
  addBuy,
  moveManualPosition,
  assignUnassignedManualPositionById,
  addManualBuyToAsset,
  moveManualPositionInAsset,
  assignUnassignedManualPosition,
  deleteAsset,
  normalizeManualWalletId,
  normalizeManualPositions,
  manualPositionsTotal,
  getManualPositions,
  migratePortfolioManualPositions,
  unassignManualPositionsForWallet,
  normalizeAssetInput,
  validateImportedPortfolio,
  parsePortfolioImport
};
