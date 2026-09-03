const fs = require("fs/promises");
const path = require("path");
const { writeJsonAtomically } = require("./storage");

const walletPath = path.join(__dirname, "..", "data", "wallet.json");
const walletsPath = path.join(__dirname, "..", "data", "wallets.json");
const backupsPath = path.join(__dirname, "..", "data", "backups");
const chainId = 1;
const nativeAssetId = `eip155:${chainId}:native`;
const reconciliationModes = new Set(["replaceManual", "addToManual", "ignoreWallet"]);
const trackingStatuses = new Set(["tracked", "stopped"]);
const manualWalletChains = new Set(["monero", "bitcoin", "ton", "solana", "other"]);
const defaultTimeoutMs = 8000;
const defaultMaxAttempts = 3;

let activeSync = null;

function getWalletConfig(env = process.env) {
  return {
    chainId,
    // Kept only for a one-time migration from the former single-wallet setup.
    address: String(env.ETHEREUM_WALLET_ADDRESS || "").trim(),
    baseUrl: String(env.BLOCKSCOUT_BASE_URL || "").trim().replace(/\/+$/, "")
  };
}

function validateAddress(value, fieldName = "wallet address") {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(value || ""))) {
    throw new Error(`${fieldName} must be a valid Ethereum address`);
  }

  return String(value);
}

function validateConfig(config) {
  let parsedUrl;

  try {
    parsedUrl = new URL(config.baseUrl);
  } catch {
    throw new Error("BLOCKSCOUT_BASE_URL must be a valid URL");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("BLOCKSCOUT_BASE_URL must use HTTPS");
  }
}

function validateWalletId(value, fieldName = "wallet id") {
  const id = String(value || "").trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(id)) {
    throw new Error(`${fieldName} must contain lowercase letters, numbers or hyphens`);
  }

  return id;
}

function normalizeWalletEntry(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("wallet must be an object");
  }

  const name = String(input.name || "").trim();

  if (!name) {
    throw new Error("wallet name is required");
  }

  if (typeof input.enabled !== "boolean") {
    throw new Error("wallet enabled must be a boolean");
  }

  const type = input.type == null ? "evm" : String(input.type);

  if (type === "evm") {
    if (input.chain !== "ethereum") {
      throw new Error("EVM wallets must use the ethereum chain");
    }
    return {
      id: validateWalletId(input.id),
      name,
      type: "evm",
      address: validateAddress(input.address),
      chain: "ethereum",
      enabled: input.enabled
    };
  }

  if (type !== "manual" || !manualWalletChains.has(String(input.chain || ""))) {
    throw new Error("manual wallet chain is unsupported");
  }

  return {
    id: validateWalletId(input.id),
    name,
    type: "manual",
    address: null,
    chain: String(input.chain),
    enabled: input.enabled
  };
}

function normalizeWallets(input) {
  if (!Array.isArray(input)) {
    throw new Error("wallets data must be an array");
  }

  const wallets = input.map(normalizeWalletEntry);
  const ids = new Set();
  const addresses = new Set();

  for (const wallet of wallets) {
    const address = wallet.type === "evm" ? wallet.address.toLowerCase() : null;

    if (ids.has(wallet.id)) {
      throw new Error(`duplicate wallet id: ${wallet.id}`);
    }

    if (address && addresses.has(address)) {
      throw new Error("wallet address is already configured");
    }

    ids.add(wallet.id);
    if (address) addresses.add(address);
  }

  return wallets;
}

function slugifyWalletId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function createWalletId(name, wallets) {
  const base = slugifyWalletId(name) || "wallet";
  const ids = new Set(wallets.map((wallet) => wallet.id));

  if (!ids.has(base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const id = `${base.slice(0, 59)}-${suffix}`;
    if (!ids.has(id)) return id;
  }

  throw new Error("unable to create a unique wallet id");
}

function makeTokenAssetId(contractAddress) {
  return `eip155:${chainId}:erc20:${validateAddress(contractAddress, "contract address").toLowerCase()}`;
}

function parseDecimals(value) {
  const stringValue = String(value ?? "").trim();

  if (!/^\d{1,3}$/.test(stringValue)) {
    throw new Error("token decimals must be a non-negative integer");
  }

  const decimals = Number(stringValue);

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error("token decimals must be between 0 and 255");
  }

  return decimals;
}

function normalizeUint256(rawValue, decimalsInput) {
  const rawBalance = String(rawValue ?? "").trim();
  const decimals = parseDecimals(decimalsInput);

  if (!/^\d+$/.test(rawBalance)) {
    throw new Error("raw balance must be an unsigned integer string");
  }

  const exactValue = BigInt(rawBalance).toString();

  if (decimals === 0) {
    return exactValue;
  }

  const padded = exactValue.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function parseNativeBalance(payload, syncedAt, expectedAddress) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("malformed Blockscout address response");
  }

  if (
    typeof payload.hash !== "string" ||
    payload.hash.toLowerCase() !== expectedAddress.toLowerCase()
  ) {
    throw new Error("Blockscout address response does not match configured wallet");
  }

  const rawBalance = String(payload.coin_balance ?? "").trim();
  const decimals = 18;

  return {
    id: nativeAssetId,
    chainId,
    type: "native",
    contractAddress: null,
    rawBalance,
    normalizedBalance: normalizeUint256(rawBalance, decimals),
    decimals,
    symbol: "ETH",
    name: "Ethereum",
    reputation: "ok",
    syncedAt
  };
}

function parseTokenBalances(payload, syncedAt) {
  if (!Array.isArray(payload)) {
    throw new Error("malformed Blockscout token balances response");
  }

  const assets = [];
  const seenIds = new Set();

  for (const item of payload) {
    if (!item || typeof item !== "object" || !item.token || typeof item.token !== "object") {
      throw new Error("malformed token balance entry");
    }

    if (item.token.type !== "ERC-20") {
      continue;
    }

    const contractAddress = validateAddress(item.token.address_hash, "contract address");
    const id = makeTokenAssetId(contractAddress);

    if (seenIds.has(id)) {
      throw new Error(`duplicate token balance for ${contractAddress}`);
    }

    const decimals = parseDecimals(item.token.decimals);
    const rawBalance = String(item.value ?? "").trim();
    const symbol = String(item.token.symbol || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
    const name = String(item.token.name || "Unknown token").trim() || "Unknown token";

    assets.push({
      id,
      chainId,
      type: "erc20",
      contractAddress,
      rawBalance,
      normalizedBalance: normalizeUint256(rawBalance, decimals),
      decimals,
      symbol,
      name,
      reputation: String(item.token.reputation || "unknown"),
      syncedAt
    });
    seenIds.add(id);
  }

  return assets;
}

function createDefaultWalletState(config = getWalletConfig()) {
  return {
    version: 3,
    chainId,
    source: "blockscout",
    blockscoutBaseUrl: config.baseUrl || "",
    wallets: [],
    mappings: []
  };
}

function createDefaultWallets(config = getWalletConfig()) {
  if (!config.address || !/^0x[0-9a-fA-F]{40}$/.test(config.address)) {
    return [];
  }

  return [{
    id: "main",
    name: "Main",
    type: "evm",
    address: validateAddress(config.address),
    chain: "ethereum",
    enabled: true
  }];
}

function normalizeStoredAsset(asset) {
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
    throw new Error("wallet asset must be an object");
  }

  const type = asset.type;
  const decimals = parseDecimals(asset.decimals);
  const rawBalance = String(asset.rawBalance ?? "").trim();
  const contractAddress = type === "native" ? null : validateAddress(asset.contractAddress, "contract address");
  const id = type === "native" ? nativeAssetId : makeTokenAssetId(contractAddress);

  if (type !== "native" && type !== "erc20") {
    throw new Error("wallet asset type must be native or erc20");
  }

  return {
    id,
    chainId,
    type,
    contractAddress,
    rawBalance,
    normalizedBalance: normalizeUint256(rawBalance, decimals),
    decimals,
    symbol: String(asset.symbol || "UNKNOWN").trim().toUpperCase() || "UNKNOWN",
    name: String(asset.name || "Unknown token").trim() || "Unknown token",
    reputation: String(asset.reputation || "unknown"),
    syncedAt: typeof asset.syncedAt === "string" ? asset.syncedAt : null
  };
}

function normalizeStoredMapping(mapping) {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    throw new Error("wallet mapping must be an object");
  }

  const mode = String(mapping.mode || "ignoreWallet");
  const status = mapping.status == null ? null : String(mapping.status);

  if (!reconciliationModes.has(mode)) {
    throw new Error(`unsupported wallet reconciliation mode: ${mode}`);
  }

  if (status !== null && !trackingStatuses.has(status)) {
    throw new Error(`unsupported wallet tracking status: ${status}`);
  }

  return {
    walletAssetId: String(mapping.walletAssetId || ""),
    portfolioAssetId: String(mapping.portfolioAssetId || ""),
    mode,
    ...(status ? { status } : {}),
    trackedAt: typeof mapping.trackedAt === "string" ? mapping.trackedAt : null,
    stoppedAt: typeof mapping.stoppedAt === "string" ? mapping.stoppedAt : null,
    updatedAt: typeof mapping.updatedAt === "string" ? mapping.updatedAt : null
  };
}

function normalizeWalletSnapshot(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("wallet snapshot must be an object");
  }

  return {
    walletId: validateWalletId(input.walletId),
    lastAttemptAt: typeof input.lastAttemptAt === "string" ? input.lastAttemptAt : null,
    lastSuccessfulSyncAt:
      typeof input.lastSuccessfulSyncAt === "string" ? input.lastSuccessfulSyncAt : null,
    stale: Boolean(input.stale),
    lastError: typeof input.lastError === "string" ? input.lastError : null,
    assets: Array.isArray(input.assets) ? input.assets.map(normalizeStoredAsset) : []
  };
}

function normalizeWalletState(input, portfolio = null) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("wallet data must be an object");
  }

  if (input.chainId !== chainId) {
    throw new Error(`wallet chainId must be ${chainId}`);
  }

  const isMultiWallet = input.version === 3 || Array.isArray(input.wallets);
  const snapshots = isMultiWallet
    ? (Array.isArray(input.wallets) ? input.wallets : []).map(normalizeWalletSnapshot)
    : input.address
      ? [normalizeWalletSnapshot({
          walletId: "main",
          lastAttemptAt: input.lastAttemptAt,
          lastSuccessfulSyncAt: input.lastSuccessfulSyncAt,
          stale: input.stale,
          lastError: input.lastError,
          assets: input.assets
        })]
      : [];
  const walletIds = new Set();
  const assetIds = new Set();

  for (const snapshot of snapshots) {
    if (walletIds.has(snapshot.walletId)) {
      throw new Error(`duplicate wallet snapshot: ${snapshot.walletId}`);
    }

    walletIds.add(snapshot.walletId);
    for (const asset of snapshot.assets) assetIds.add(asset.id);
  }

  const portfolioIds = portfolio ? new Set(portfolio.map((asset) => asset.id)) : null;
  const mappings = Array.isArray(input.mappings)
    ? input.mappings.map(normalizeStoredMapping)
    : [];
  const seenWalletIds = new Set();
  const seenPortfolioIds = new Set();

  for (const mapping of mappings) {
    if (!assetIds.has(mapping.walletAssetId)) {
      throw new Error(`wallet mapping references unknown asset: ${mapping.walletAssetId}`);
    }

    if (portfolioIds && !portfolioIds.has(mapping.portfolioAssetId)) {
      throw new Error(`wallet mapping references unknown portfolio asset: ${mapping.portfolioAssetId}`);
    }

    if (seenWalletIds.has(mapping.walletAssetId)) {
      throw new Error(`duplicate mapping for wallet asset: ${mapping.walletAssetId}`);
    }

    if (seenPortfolioIds.has(mapping.portfolioAssetId)) {
      throw new Error(`duplicate mapping for portfolio asset: ${mapping.portfolioAssetId}`);
    }

    seenWalletIds.add(mapping.walletAssetId);
    seenPortfolioIds.add(mapping.portfolioAssetId);
  }

  return {
    version: 3,
    chainId,
    source: "blockscout",
    blockscoutBaseUrl: String(input.blockscoutBaseUrl || ""),
    wallets: snapshots,
    mappings
  };
}

function storagePaths(options = {}) {
  return {
    walletPath: options.walletPath || walletPath,
    walletsPath: options.walletsPath || walletsPath,
    backupsPath: options.backupsPath || backupsPath
  };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function migrationTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function backupLegacyWalletState(state, paths, now = new Date()) {
  await fs.mkdir(paths.backupsPath, { recursive: true });
  const fileName = `wallet-before-multi-wallet-migration-${migrationTimestamp(now)}.json`;
  await fs.writeFile(
    path.join(paths.backupsPath, fileName),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8"
  );
  return fileName;
}

async function ensureWalletStorage(options = {}) {
  const paths = storagePaths(options);
  const config = options.config || getWalletConfig(options.env);
  const hasState = await fileExists(paths.walletPath);
  const hasWallets = await fileExists(paths.walletsPath);
  const rawState = hasState
    ? JSON.parse(await fs.readFile(paths.walletPath, "utf8"))
    : createDefaultWalletState(config);
  const isLegacyState = rawState.version !== 3 && !Array.isArray(rawState.wallets);
  const legacyAddress = String(rawState.address || config.address || "").trim();
  let wallets = hasWallets
    ? normalizeWallets(JSON.parse(await fs.readFile(paths.walletsPath, "utf8")))
    : legacyAddress && /^0x[0-9a-fA-F]{40}$/.test(legacyAddress)
      ? [{
          id: "main",
          name: "Main",
          type: "evm",
          address: validateAddress(legacyAddress),
          chain: "ethereum",
          enabled: true
        }]
      : createDefaultWallets(config);
  let state = normalizeWalletState(rawState);

  if (isLegacyState && legacyAddress && /^0x[0-9a-fA-F]{40}$/.test(legacyAddress)) {
    const existingWallet = wallets.find(
      (wallet) => wallet.type === "evm" && wallet.address.toLowerCase() === legacyAddress.toLowerCase()
    );
    const migratedWalletId = existingWallet?.id || (
      wallets.some((wallet) => wallet.id === "main")
        ? createWalletId("Migrated wallet", wallets)
        : "main"
    );

    if (!existingWallet) {
      wallets = normalizeWallets([
        ...wallets,
        {
          id: migratedWalletId,
          name: migratedWalletId === "main" ? "Main" : "Migrated wallet",
          type: "evm",
          address: validateAddress(legacyAddress),
          chain: "ethereum",
          enabled: true
        }
      ]);
    }

    state = {
      ...state,
      wallets: state.wallets.map((snapshot) => ({
        ...snapshot,
        walletId: snapshot.walletId === "main" ? migratedWalletId : snapshot.walletId
      }))
    };
  }

  if (isLegacyState) {
    if (hasState) await backupLegacyWalletState(rawState, paths, options.now?.() || new Date());
    await writeJsonAtomically(paths.walletsPath, wallets);
    await writeJsonAtomically(paths.walletPath, state);
  } else if (!hasWallets) {
    await writeJsonAtomically(paths.walletsPath, wallets);
  } else if (!hasState) {
    await writeJsonAtomically(paths.walletPath, state);
  }

  return { state, wallets };
}

async function readWalletState(options = {}) {
  const { state } = await ensureWalletStorage(options);
  return state;
}

async function readWallets(options = {}) {
  const { wallets } = await ensureWalletStorage(options);
  return wallets;
}

async function writeWalletState(state, options = {}) {
  const paths = storagePaths(options);
  await writeJsonAtomically(paths.walletPath, normalizeWalletState(state));
}

async function writeWallets(wallets, options = {}) {
  const paths = storagePaths(options);
  await writeJsonAtomically(paths.walletsPath, normalizeWallets(wallets));
}

async function createWallet(input, options = {}) {
  const wallets = await readWallets(options);
  const wallet = normalizeWalletEntry({
    id: createWalletId(input?.name, wallets),
    name: input?.name,
    type: input?.type == null ? "evm" : input.type,
    address: input?.address,
    chain: input?.chain || "ethereum",
    enabled: true
  });
  const nextWallets = normalizeWallets([...wallets, wallet]);
  await writeWallets(nextWallets, options);
  return wallet;
}

async function updateWallet(id, input, options = {}) {
  const walletId = validateWalletId(id);
  const wallets = await readWallets(options);
  const current = wallets.find((wallet) => wallet.id === walletId);

  if (!current) return null;
  if (input.name !== undefined && !String(input.name).trim()) {
    throw new Error("wallet name is required");
  }
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
    throw new Error("wallet enabled must be a boolean");
  }

  const updated = normalizeWalletEntry({
    ...current,
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {})
  });
  const nextWallets = wallets.map((wallet) => wallet.id === walletId ? updated : wallet);
  await writeWallets(nextWallets, options);
  return updated;
}

async function deleteWallet(id, options = {}) {
  const walletId = validateWalletId(id);
  const [wallets, state] = await Promise.all([readWallets(options), readWalletState(options)]);
  const nextWallets = wallets.filter((wallet) => wallet.id !== walletId);

  if (nextWallets.length === wallets.length) return false;

  const nextSnapshots = state.wallets.filter((snapshot) => snapshot.walletId !== walletId);
  const remainingAssetIds = new Set(
    nextSnapshots.flatMap((snapshot) => snapshot.assets.map((asset) => asset.id))
  );
  const nextState = {
    ...state,
    wallets: nextSnapshots,
    mappings: state.mappings.filter((mapping) => remainingAssetIds.has(mapping.walletAssetId))
  };

  await Promise.all([writeWallets(nextWallets, options), writeWalletState(nextState, options)]);
  return true;
}

function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(
  url,
  {
    fetchImpl = global.fetch,
    timeoutMs = defaultTimeoutMs,
    maxAttempts = defaultMaxAttempts,
    delayImpl = delay
  } = {}
) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal
      });

      if (!response.ok) {
        const error = new Error(`Blockscout request failed with status ${response.status}`);
        error.status = response.status;

        if (isRetryableStatus(response.status) && attempt < maxAttempts) {
          lastError = error;
          await delayImpl(Math.min(1000, 150 * 2 ** (attempt - 1)));
          continue;
        }

        throw error;
      }

      try {
        return await response.json();
      } catch {
        throw new Error("malformed JSON response from Blockscout");
      }
    } catch (error) {
      const isHttpError = typeof error.status === "number";
      const isNetworkError = !isHttpError && error.message !== "malformed JSON response from Blockscout";

      if (isNetworkError && attempt < maxAttempts) {
        lastError = error;
        await delayImpl(Math.min(1000, 150 * 2 ** (attempt - 1)));
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("Blockscout request failed");
}

function mergeMissingAssetsAsZero(previousAssets, nextAssets, syncedAt) {
  const nextIds = new Set(nextAssets.map((asset) => asset.id));
  const missingAssets = previousAssets
    .filter((asset) => asset.type === "erc20" && !nextIds.has(asset.id))
    .map((asset) => ({
      ...asset,
      rawBalance: "0",
      normalizedBalance: "0",
      syncedAt
    }));

  return [...nextAssets, ...missingAssets];
}

async function performWalletSync(options = {}) {
  const config = options.config || getWalletConfig();
  validateConfig(config);
  const wallet = options.wallet || {
    id: "main",
    name: "Main",
    type: "evm",
    address: validateAddress(config.address),
    chain: "ethereum",
    enabled: true
  };
  const normalizedWallet = normalizeWalletEntry(wallet);
  if (normalizedWallet.type !== "evm") {
    throw new Error("manual wallets cannot be synchronized");
  }

  const readState = options.readState || readWalletState;
  const writeState = options.writeState || writeWalletState;
  const previousState = normalizeWalletState(await readState());
  const previousSnapshot = previousState.wallets.find(
    (snapshot) => snapshot.walletId === normalizedWallet.id
  ) || {
    walletId: normalizedWallet.id,
    lastAttemptAt: null,
    lastSuccessfulSyncAt: null,
    stale: false,
    lastError: null,
    assets: []
  };
  const now = options.now || (() => new Date());
  const attemptedAt = now().toISOString();

  try {
    const addressUrl = `${config.baseUrl}/api/v2/addresses/${normalizedWallet.address}`;
    const tokenBalancesUrl = `${addressUrl}/token-balances`;
    const requestOptions = {
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
      maxAttempts: options.maxAttempts,
      delayImpl: options.delayImpl
    };
    const [addressPayload, tokenPayload] = await Promise.all([
      fetchJsonWithRetry(addressUrl, requestOptions),
      fetchJsonWithRetry(tokenBalancesUrl, requestOptions)
    ]);
    const syncedAt = now().toISOString();
    const parsedAssets = [
      parseNativeBalance(addressPayload, syncedAt, normalizedWallet.address),
      ...parseTokenBalances(tokenPayload, syncedAt)
    ];
    const assets = mergeMissingAssetsAsZero(previousSnapshot.assets, parsedAssets, syncedAt);
    const snapshot = {
      walletId: normalizedWallet.id,
      lastAttemptAt: attemptedAt,
      lastSuccessfulSyncAt: syncedAt,
      stale: false,
      lastError: null,
      assets
    };
    const nextState = {
      ...previousState,
      version: 3,
      chainId,
      source: "blockscout",
      blockscoutBaseUrl: config.baseUrl,
      wallets: [
        ...previousState.wallets.filter((candidate) => candidate.walletId !== normalizedWallet.id),
        snapshot
      ]
    };

    await writeState(nextState);
    return nextState;
  } catch (error) {
    const failedSnapshot = {
      ...previousSnapshot,
      walletId: normalizedWallet.id,
      lastAttemptAt: attemptedAt,
      stale: true,
      lastError: error.message
    };
    const failedState = {
      ...previousState,
      chainId,
      source: "blockscout",
      blockscoutBaseUrl: config.baseUrl,
      wallets: [
        ...previousState.wallets.filter((candidate) => candidate.walletId !== normalizedWallet.id),
        failedSnapshot
      ]
    };

    await writeState(failedState);
    error.walletState = failedState;
    throw error;
  }
}

async function syncWallet(options = {}) {
  if (!activeSync) {
    activeSync = (async () => {
      const wallets = normalizeWallets(
        options.wallets || await (options.readWallets || readWallets)(options)
      );
      const requestedWallet = options.walletId
        ? wallets.find((wallet) => wallet.id === options.walletId)
        : null;
      if (options.walletId && !requestedWallet) {
        throw new Error("wallet not found");
      }
      const targets = requestedWallet
        ? [requestedWallet]
        : wallets.filter((wallet) => wallet.type === "evm" && wallet.enabled);

      if (requestedWallet && requestedWallet.type !== "evm") {
        throw new Error("manual wallets cannot be synchronized");
      }

      if (!targets.length) {
        throw new Error("no enabled Ethereum wallets are configured");
      }

      let state;
      const errors = [];
      for (const wallet of targets) {
        try {
          state = await performWalletSync({ ...options, wallet });
        } catch (error) {
          state = error.walletState || state;
          errors.push({ walletId: wallet.id, message: error.message });
        }
      }
      return { state, errors };
    })().finally(() => {
      activeSync = null;
    });
  }

  return activeSync;
}

function normalizedBalanceToNumber(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function isTrackedMapping(mapping) {
  return mapping?.status === "tracked";
}

function isStoppedMapping(mapping) {
  return mapping?.status === "stopped";
}

function isEthereumPortfolioAsset(asset) {
  return Number(asset?.cmcId) === 1027 || asset?.coingeckoId === "ethereum";
}

function walletConfigsForState(walletState, wallets = []) {
  if (Array.isArray(wallets) && wallets.length) {
    return normalizeWallets(wallets);
  }

  return walletState.wallets.map((snapshot) => ({
    id: snapshot.walletId,
    name: snapshot.walletId === "main" ? "Main" : snapshot.walletId,
    type: "evm",
    address: "",
    chain: "ethereum",
    enabled: true
  }));
}

function selectWalletScope(wallets, walletId = null) {
  const configs = normalizeWallets(wallets);

  if (!walletId || walletId === "all") {
    return configs;
  }

  const selected = configs.find((wallet) => wallet.id === walletId);
  if (!selected) {
    throw new Error("wallet not found");
  }

  // A single-wallet view is informational. It may inspect a disabled wallet's
  // last successful snapshot without re-enabling it in persisted configuration.
  return configs.map((wallet) => ({
    ...wallet,
    enabled: wallet.id === selected.id
  }));
}

function aggregateWalletAssets(walletStateInput, wallets = []) {
  const walletState = normalizeWalletState(walletStateInput);
  const configs = walletConfigsForState(walletState, wallets);
  const enabledWallets = new Map(
    configs.filter((wallet) => wallet.type === "evm" && wallet.enabled).map((wallet) => [wallet.id, wallet])
  );
  const assetsById = new Map();

  for (const snapshot of walletState.wallets) {
    const wallet = enabledWallets.get(snapshot.walletId);
    if (!wallet) continue;

    for (const asset of snapshot.assets) {
      const existing = assetsById.get(asset.id);
      const rawBalance = BigInt(asset.rawBalance);
      const breakdown = {
        walletId: wallet.id,
        walletName: wallet.name,
        rawBalance: asset.rawBalance,
        normalizedBalance: asset.normalizedBalance,
        amount: asset.normalizedBalance,
        ...(wallet.address ? { address: wallet.address } : {})
      };

      if (!existing) {
        assetsById.set(asset.id, {
          ...asset,
          rawBalance: rawBalance.toString(),
          walletBreakdown: [breakdown],
          walletStale: snapshot.stale
        });
        continue;
      }

      if (
        existing.type !== asset.type ||
        existing.decimals !== asset.decimals ||
        existing.contractAddress !== asset.contractAddress
      ) {
        throw new Error(`incompatible balances for wallet asset: ${asset.id}`);
      }

      const combinedRawBalance = BigInt(existing.rawBalance) + rawBalance;
      existing.rawBalance = combinedRawBalance.toString();
      existing.normalizedBalance = normalizeUint256(existing.rawBalance, existing.decimals);
      existing.walletBreakdown.push(breakdown);
      existing.walletStale = existing.walletStale || snapshot.stale;
      if (asset.syncedAt && (!existing.syncedAt || asset.syncedAt > existing.syncedAt)) {
        existing.syncedAt = asset.syncedAt;
      }
    }
  }

  return {
    assets: [...assetsById.values()],
    configuredWallets: configs,
    enabledWallets: configs.filter((wallet) => wallet.type === "evm" && wallet.enabled)
  };
}

function walletSyncSummary(walletStateInput, wallets = []) {
  const walletState = normalizeWalletState(walletStateInput);
  const configs = walletConfigsForState(walletState, wallets);
  const enabledIds = new Set(configs.filter((wallet) => wallet.type === "evm" && wallet.enabled).map((wallet) => wallet.id));
  const snapshots = walletState.wallets.filter((snapshot) => enabledIds.has(snapshot.walletId));
  const successfulSyncs = snapshots
    .map((snapshot) => snapshot.lastSuccessfulSyncAt)
    .filter(Boolean)
    .sort();
  const attempts = snapshots.map((snapshot) => snapshot.lastAttemptAt).filter(Boolean).sort();
  const staleSnapshots = snapshots.filter((snapshot) => snapshot.stale);

  return {
    lastAttemptAt: attempts.at(-1) || null,
    lastSuccessfulSyncAt: successfulSyncs.at(-1) || null,
    stale: staleSnapshots.length > 0,
    lastError: staleSnapshots.map((snapshot) => snapshot.lastError).filter(Boolean).join("; ") || null
  };
}

function getTrackVerification(walletAsset, portfolioAsset, contractMetadata = null) {
  if (!walletAsset || !portfolioAsset) {
    throw new Error("wallet and portfolio assets are required for Track verification");
  }

  if (walletAsset.type === "native") {
    const contractVerified = isEthereumPortfolioAsset(portfolioAsset);
    return {
      contractVerified,
      verificationMethod: contractVerified ? "native-eth" : null,
      contractMismatch: false,
      possibleSpam: false,
      requiresAdvancedConfirmation: !contractVerified
    };
  }

  const providerContract = String(contractMetadata?.contractAddress || "").toLowerCase();
  const walletContract = String(walletAsset.contractAddress || "").toLowerCase();
  const contractVerified =
    contractMetadata?.chainId === chainId &&
    /^0x[0-9a-f]{40}$/.test(providerContract) &&
    providerContract === walletContract;
  const sameSymbol =
    String(walletAsset.symbol || "").toUpperCase() ===
    String(portfolioAsset.symbol || "").toUpperCase();
  const contractMismatch = Boolean(
    sameSymbol && providerContract && providerContract !== walletContract
  );

  return {
    contractVerified,
    verificationMethod: contractVerified ? "coinmarketcap-contract" : null,
    contractMismatch,
    possibleSpam: contractMismatch,
    requiresAdvancedConfirmation: !contractVerified
  };
}

function assertTrackConfirmation(
  walletAsset,
  portfolioAsset,
  contractMetadata,
  advancedConfirmation
) {
  const verification = getTrackVerification(walletAsset, portfolioAsset, contractMetadata);

  if (verification.requiresAdvancedConfirmation && advancedConfirmation !== true) {
    const error = new Error(
      verification.contractMismatch
        ? "Contract mismatch requires Advanced Track confirmation"
        : "Unverified contract requires Advanced Track confirmation"
    );
    error.code = "ADVANCED_TRACK_REQUIRED";
    error.verification = verification;
    throw error;
  }

  return verification;
}

function applyWalletAccounting(portfolio, walletStateInput, wallets = []) {
  const { assets } = aggregateWalletAssets(walletStateInput, wallets);
  const walletState = normalizeWalletState(walletStateInput);
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const mappingsByPortfolioId = new Map(
    walletState.mappings.map((mapping) => [mapping.portfolioAssetId, mapping])
  );

  return portfolio.map((asset) => {
    const mapping = mappingsByPortfolioId.get(asset.id);
    const walletAsset = mapping ? assetsById.get(mapping.walletAssetId) : null;
    const walletAmount = walletAsset ? normalizedBalanceToNumber(walletAsset.normalizedBalance) : null;
    let effectiveAmount = asset.amount;
    let accountingSource = "manual";
    let isActive = true;

    if (isTrackedMapping(mapping)) {
      effectiveAmount = walletAmount ?? 0;
      accountingSource = "ethereum-wallet";
    } else if (isStoppedMapping(mapping)) {
      effectiveAmount = null;
      accountingSource = "stopped";
      isActive = false;
    } else if (mapping?.mode === "replaceManual") {
      // Version 1 imports retain their original reconciliation behavior.
      effectiveAmount = walletAmount;
      accountingSource = "wallet";
    } else if (mapping?.mode === "addToManual") {
      effectiveAmount = walletAmount === null ? null : asset.amount + walletAmount;
      accountingSource = "manual + wallet";
    }

    return {
      ...asset,
      manualAmount: asset.amount,
      effectiveAmount,
      walletAmount: walletAsset?.normalizedBalance ?? null,
      walletAssetId: walletAsset?.id ?? null,
      walletBreakdown: walletAsset?.walletBreakdown || [],
      walletMode: mapping?.mode || "ignoreWallet",
      walletTrackingStatus: mapping?.status || null,
      accountingSource,
      isActive,
      isEthereumTracked: isTrackedMapping(mapping),
      walletStale: Boolean(mapping && walletAsset?.walletStale)
    };
  });
}

async function trackWalletAsset({ walletAssetId, portfolioAssetId }, portfolio, now = new Date()) {
  const state = await readWalletState();
  const wallets = await readWallets();
  const { assets } = aggregateWalletAssets(state, wallets);
  const normalizedWalletAssetId = String(walletAssetId || "");
  const normalizedPortfolioAssetId = String(portfolioAssetId || "");
  const existingForWallet = state.mappings.find(
    (mapping) => mapping.walletAssetId === normalizedWalletAssetId
  );
  const existingForPortfolio = state.mappings.find(
    (mapping) => mapping.portfolioAssetId === normalizedPortfolioAssetId
  );

  if (!assets.some((asset) => asset.id === normalizedWalletAssetId)) {
    throw new Error("wallet asset not found");
  }

  if (!portfolio.some((asset) => asset.id === normalizedPortfolioAssetId)) {
    throw new Error("portfolio asset not found");
  }

  if (existingForWallet && existingForWallet.portfolioAssetId !== normalizedPortfolioAssetId) {
    throw new Error("wallet asset is already linked to another portfolio asset");
  }

  if (existingForPortfolio && existingForPortfolio.walletAssetId !== normalizedWalletAssetId) {
    throw new Error("portfolio asset is already linked to another wallet asset");
  }

  const updatedAt = now.toISOString();
  const nextMappings = state.mappings.filter(
    (mapping) => mapping.walletAssetId !== normalizedWalletAssetId
  );
  nextMappings.push({
    walletAssetId: normalizedWalletAssetId,
    portfolioAssetId: normalizedPortfolioAssetId,
    mode: "replaceManual",
    status: "tracked",
    trackedAt: existingForWallet?.trackedAt || updatedAt,
    stoppedAt: null,
    updatedAt
  });

  const nextState = { ...state, version: 3, mappings: nextMappings };
  await writeWalletState(nextState);
  return nextState;
}

async function stopTrackingWalletAsset(walletAssetId, now = new Date()) {
  const state = await readWalletState();
  const normalizedWalletAssetId = String(walletAssetId || "");
  const existing = state.mappings.find(
    (mapping) => mapping.walletAssetId === normalizedWalletAssetId
  );

  if (!existing || !isTrackedMapping(existing)) {
    throw new Error("tracked wallet asset not found");
  }

  const updatedAt = now.toISOString();
  const nextMappings = state.mappings.map((mapping) =>
    mapping.walletAssetId === normalizedWalletAssetId
      ? {
          ...mapping,
          mode: "replaceManual",
          status: "stopped",
          stoppedAt: updatedAt,
          updatedAt
        }
      : mapping
  );
  const nextState = { ...state, version: 3, mappings: nextMappings };
  await writeWalletState(nextState);
  return nextState;
}

async function updateWalletMapping({ walletAssetId, portfolioAssetId, mode }, portfolio) {
  const state = await readWalletState();
  const wallets = await readWallets();
  const { assets } = aggregateWalletAssets(state, wallets);
  const normalizedWalletAssetId = String(walletAssetId || "");
  const normalizedPortfolioAssetId = String(portfolioAssetId || "");

  if (!assets.some((asset) => asset.id === normalizedWalletAssetId)) {
    throw new Error("wallet asset not found");
  }

  const nextMappings = state.mappings.filter(
    (mapping) => mapping.walletAssetId !== normalizedWalletAssetId
  );

  if (!normalizedPortfolioAssetId) {
    const nextState = { ...state, mappings: nextMappings };
    await writeWalletState(nextState);
    return nextState;
  }

  if (!portfolio.some((asset) => asset.id === normalizedPortfolioAssetId)) {
    throw new Error("portfolio asset not found");
  }

  if (nextMappings.some((mapping) => mapping.portfolioAssetId === normalizedPortfolioAssetId)) {
    throw new Error("portfolio asset is already linked to another wallet token");
  }

  const normalizedMode = String(mode || "ignoreWallet");

  if (!reconciliationModes.has(normalizedMode)) {
    throw new Error("unsupported reconciliation mode");
  }

  nextMappings.push({
    walletAssetId: normalizedWalletAssetId,
    portfolioAssetId: normalizedPortfolioAssetId,
    mode: normalizedMode,
    updatedAt: new Date().toISOString()
  });

  const nextState = { ...state, mappings: nextMappings };
  await writeWalletState(nextState);
  return nextState;
}

function getWalletPriceAssets(portfolio, walletState) {
  void walletState;
  return [...portfolio];
}

function buildWalletView(
  walletStateInput,
  portfolio,
  pricesById = {},
  contractsByPortfolioId = {},
  wallets = []
) {
  const walletState = normalizeWalletState(walletStateInput);
  const aggregation = aggregateWalletAssets(walletState, wallets);
  const sync = walletSyncSummary(walletState, wallets);
  const mappingsByWalletId = new Map(
    walletState.mappings.map((mapping) => [mapping.walletAssetId, mapping])
  );
  const portfolioById = new Map(portfolio.map((asset) => [asset.id, asset]));
  let trackedEthereumValueUsd = 0;
  let pricedTrackedAssets = 0;
  let trackedAssets = 0;
  const walletStats = new Map(
    aggregation.configuredWallets.map((wallet) => [wallet.id, {
      walletValueUsd: 0,
      pricedAssets: 0
    }])
  );

  for (const snapshot of walletState.wallets) {
    const stats = walletStats.get(snapshot.walletId);
    if (!stats) continue;

    for (const asset of snapshot.assets) {
      const mapping = mappingsByWalletId.get(asset.id);
      const portfolioAsset = mapping ? portfolioById.get(mapping.portfolioAssetId) : null;
      const currentPriceUsd = isTrackedMapping(mapping)
        ? pricesById[portfolioAsset?.coingeckoId]?.currentPriceUsd ?? null
        : null;
      const amount = normalizedBalanceToNumber(asset.normalizedBalance);
      if (amount !== null && typeof currentPriceUsd === "number") {
        stats.walletValueUsd += amount * currentPriceUsd;
        stats.pricedAssets += 1;
      }
    }
  }

  const balances = aggregation.assets.map((asset) => {
    const mapping = mappingsByWalletId.get(asset.id) || null;
    const portfolioAsset = mapping ? portfolioById.get(mapping.portfolioAssetId) : null;
    const tracked = isTrackedMapping(mapping);
    const priceId = tracked ? portfolioAsset?.coingeckoId : null;
    const currentPriceUsd = priceId ? pricesById[priceId]?.currentPriceUsd ?? null : null;
    const amount = normalizedBalanceToNumber(asset.normalizedBalance);
    const walletAssetValueUsd =
      amount !== null && typeof currentPriceUsd === "number" ? amount * currentPriceUsd : null;

    if (tracked) {
      trackedAssets += 1;
    }

    if (tracked && Number.isFinite(walletAssetValueUsd)) {
      trackedEthereumValueUsd += walletAssetValueUsd;
      pricedTrackedAssets += 1;

    }

    const suggestedPortfolioAsset = !mapping
      ? asset.type === "native"
        ? portfolio.find(isEthereumPortfolioAsset) || null
        : portfolio.find((candidate) =>
            getTrackVerification(
              asset,
              candidate,
              contractsByPortfolioId[candidate.id] || null
            ).contractVerified
          ) || null
      : null;
    const symbolMismatch = !mapping && !suggestedPortfolioAsset
      ? portfolio
          .filter(
            (candidate) =>
              String(candidate.symbol || "").toUpperCase() ===
              String(asset.symbol || "").toUpperCase()
          )
          .map((candidate) => ({
            candidate,
            verification: getTrackVerification(
              asset,
              candidate,
              contractsByPortfolioId[candidate.id] || null
            )
          }))
          .find((entry) => entry.verification.contractMismatch) || null
      : null;
    const isSuggested = !mapping && (asset.type === "native" || Boolean(suggestedPortfolioAsset));

    return {
      ...asset,
      mapping,
      trackingStatus: tracked ? "tracked" : isStoppedMapping(mapping) ? "stopped" : "untracked",
      portfolioAsset: portfolioAsset
        ? {
            id: portfolioAsset.id,
            name: portfolioAsset.name,
            symbol: portfolioAsset.symbol
          }
        : null,
      suggestedPortfolioAsset: suggestedPortfolioAsset
        ? {
            id: suggestedPortfolioAsset.id,
            name: suggestedPortfolioAsset.name,
            symbol: suggestedPortfolioAsset.symbol
          }
        : null,
      contractVerified: asset.type === "native" || Boolean(suggestedPortfolioAsset),
      verificationMethod:
        asset.type === "native"
          ? "native-eth"
          : suggestedPortfolioAsset
            ? "coinmarketcap-contract"
            : null,
      contractMismatch: Boolean(symbolMismatch?.verification.contractMismatch),
      possibleSpam: Boolean(symbolMismatch?.verification.possibleSpam),
      conflictingPortfolioAsset: symbolMismatch
        ? {
            id: symbolMismatch.candidate.id,
            name: symbolMismatch.candidate.name,
            symbol: symbolMismatch.candidate.symbol
          }
        : null,
      requiresAdvancedConfirmation: !isSuggested,
      discoveryGroup: isSuggested ? "suggested" : "other",
      accountingSource: tracked ? "ethereum-wallet" : "excluded",
      currentPriceUsd,
      walletAssetValueUsd: tracked ? walletAssetValueUsd : null,
      walletUrl: asset.walletBreakdown[0]?.address
        ? `https://etherscan.io/address/${asset.walletBreakdown[0].address}`
        : null,
      contractUrl: asset.contractAddress
        ? `https://etherscan.io/token/${asset.contractAddress}`
        : null,
      blockscoutUrl: asset.contractAddress
        ? `${walletState.blockscoutBaseUrl}/token/${asset.contractAddress}`
        : asset.walletBreakdown[0]?.address
          ? `${walletState.blockscoutBaseUrl}/address/${asset.walletBreakdown[0].address}`
          : null
    };
  });

  return {
    configured: Boolean(aggregation.enabledWallets.length && walletState.blockscoutBaseUrl),
    chainId: walletState.chainId,
    source: walletState.source,
    lastAttemptAt: sync.lastAttemptAt,
    lastSuccessfulSyncAt: sync.lastSuccessfulSyncAt,
    stale: sync.stale,
    lastError: sync.lastError,
    totalWallets: aggregation.configuredWallets.length,
    enabledWallets: aggregation.enabledWallets.length,
    wallets: aggregation.configuredWallets.map((wallet) => {
      const snapshot = walletState.wallets.find((item) => item.walletId === wallet.id);
      const stats = walletStats.get(wallet.id) || { walletValueUsd: 0, pricedAssets: 0 };
      return {
        ...wallet,
        addressUrl: `https://etherscan.io/address/${wallet.address}`,
        assetCount: snapshot?.assets.length || 0,
        lastAttemptAt: snapshot?.lastAttemptAt || null,
        lastSuccessfulSyncAt: snapshot?.lastSuccessfulSyncAt || null,
        stale: Boolean(snapshot?.stale),
        lastError: snapshot?.lastError || null,
        walletValueUsd: stats.walletValueUsd,
        pricedAssets: stats.pricedAssets
      };
    }),
    trackedEthereumValueUsd,
    trackedAssets,
    pricedTrackedAssets,
    unpricedTrackedAssets: trackedAssets - pricedTrackedAssets,
    walletValueUsd: trackedEthereumValueUsd,
    pricedWalletAssets: pricedTrackedAssets,
    uniqueAssets: balances.length,
    balances,
    discoveredTokens: balances.filter((asset) => asset.trackingStatus !== "tracked"),
    suggestedAssets: balances.filter(
      (asset) => asset.trackingStatus !== "tracked" && asset.discoveryGroup === "suggested"
    ),
    otherDiscoveredTokens: balances.filter(
      (asset) => asset.trackingStatus !== "tracked" && asset.discoveryGroup === "other"
    ),
    matchedAssets: balances.filter((asset) => asset.trackingStatus === "tracked"),
    portfolioOptions: portfolio.map((asset) => {
      const mapping = walletState.mappings.find(
        (candidate) => candidate.portfolioAssetId === asset.id
      );
      return {
        id: asset.id,
        name: asset.name,
        symbol: asset.symbol,
        coingeckoId: asset.coingeckoId,
        cmcId: asset.cmcId || null,
        available: !mapping,
        walletAssetId: mapping?.walletAssetId || null,
        trackingStatus: mapping?.status || null,
        ethereumContract: contractsByPortfolioId[asset.id] || null
      };
    })
  };
}

module.exports = {
  nativeAssetId,
  reconciliationModes,
  getWalletConfig,
  normalizeUint256,
  parseNativeBalance,
  parseTokenBalances,
  createDefaultWalletState,
  createDefaultWallets,
  normalizeWalletState,
  normalizeWallets,
  readWalletState,
  writeWalletState,
  readWallets,
  writeWallets,
  createWallet,
  updateWallet,
  deleteWallet,
  fetchJsonWithRetry,
  performWalletSync,
  mergeMissingAssetsAsZero,
  syncWallet,
  selectWalletScope,
  aggregateWalletAssets,
  walletSyncSummary,
  applyWalletAccounting,
  trackWalletAsset,
  stopTrackingWalletAsset,
  updateWalletMapping,
  getWalletPriceAssets,
  buildWalletView,
  getTrackVerification,
  assertTrackConfirmation,
  isEthereumPortfolioAsset,
  isTrackedMapping,
  isStoppedMapping
};
