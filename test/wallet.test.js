const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  nativeAssetId,
  normalizeUint256,
  parseNativeBalance,
  parseTokenBalances,
  normalizeWalletState,
  normalizeWallets,
  readWalletState,
  readWallets,
  createWallet,
  updateWallet,
  deleteWallet,
  writeWalletState,
  fetchJsonWithRetry,
  performWalletSync,
  syncWallet,
  mergeMissingAssetsAsZero,
  applyWalletAccounting,
  aggregateWalletAssets,
  selectWalletScope,
  buildWalletView,
  getTrackVerification,
  assertTrackConfirmation
} = require("../server/wallet");
const {
  parsePortfolioImport,
  migratePortfolioManualPositions,
  addManualBuyToAsset,
  moveManualPositionInAsset,
  assignUnassignedManualPosition
} = require("../server/portfolio");
const {
  buildPortfolioResponse,
  applyManualWalletScope,
  buildManualWalletSummary
} = require("../server/index");
const {
  extractEthereumContractMetadata,
  mapCoinMarketCapSearchResult
} = require("../server/prices");

const fixturesPath = path.join(__dirname, "fixtures");
const walletAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const syncedAt = "2026-08-03T10:00:00.000Z";

function readFixture(fileName) {
  return JSON.parse(fs.readFileSync(path.join(fixturesPath, fileName), "utf8"));
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function makePortfolioAsset(amount = 10) {
  return {
    id: "usd-coin",
    name: "USDC",
    symbol: "USDC",
    coingeckoId: "usd-coin",
    cmcId: 3408,
    amount,
    source: "manual"
  };
}

function makeWalletState(walletAsset, mode) {
  return {
    version: 1,
    chainId: 1,
    address: walletAddress,
    source: "blockscout",
    blockscoutBaseUrl: "https://eth.blockscout.com",
    lastAttemptAt: syncedAt,
    lastSuccessfulSyncAt: syncedAt,
    stale: false,
    lastError: null,
    assets: [walletAsset],
    mappings: [
      {
        walletAssetId: walletAsset.id,
        portfolioAssetId: "usd-coin",
        mode,
        updatedAt: syncedAt
      }
    ]
  };
}

function makeTrackedWalletState(walletAssets, mappings, overrides = {}) {
  return {
    version: 2,
    chainId: 1,
    address: walletAddress,
    source: "blockscout",
    blockscoutBaseUrl: "https://eth.blockscout.com",
    lastAttemptAt: syncedAt,
    lastSuccessfulSyncAt: syncedAt,
    stale: false,
    lastError: null,
    assets: walletAssets,
    mappings,
    ...overrides
  };
}

function trackedMapping(walletAssetId, portfolioAssetId) {
  return {
    walletAssetId,
    portfolioAssetId,
    mode: "replaceManual",
    status: "tracked",
    trackedAt: syncedAt,
    stoppedAt: null,
    updatedAt: syncedAt
  };
}

function priceResult(pricesById) {
  return {
    pricesById,
    updatedAt: syncedAt,
    error: null,
    priceSource: "cache",
    priceWarning: null
  };
}

function makeMultiWalletState(wallets, mappings = []) {
  return {
    version: 3,
    chainId: 1,
    source: "blockscout",
    blockscoutBaseUrl: "https://eth.blockscout.com",
    wallets,
    mappings
  };
}

function makeWalletConfig(id, name, address, enabled = true) {
  return { id, name, address, chain: "ethereum", enabled };
}

test("normalizes raw uint256 without precision loss", () => {
  assert.equal(normalizeUint256("123456789", 6), "123.456789");
  assert.equal(normalizeUint256("1000000000000000001", 18), "1.000000000000000001");
  assert.equal(
    normalizeUint256(
      "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      18
    ),
    "115792089237316195423570985008687907853269984665640564039457.584007913129639935"
  );
});

test("parses ETH using a stable native identifier and ignores exchange_rate", () => {
  const asset = parseNativeBalance(
    readFixture("blockscout-address.json"),
    syncedAt,
    walletAddress
  );

  assert.equal(asset.id, nativeAssetId);
  assert.equal(asset.rawBalance, "1234500000000000000");
  assert.equal(asset.normalizedBalance, "1.2345");
  assert.equal(asset.exchangeRate, undefined);
});

test("parses ERC-20 6/18 decimals, large uint256, unknown and zero balances", () => {
  const assets = parseTokenBalances(
    readFixture("blockscout-token-balances.json"),
    syncedAt
  );

  assert.equal(assets.length, 5);
  assert.equal(assets[0].normalizedBalance, "123.456789");
  assert.equal(assets[1].normalizedBalance, "1.000000000000000001");
  assert.equal(
    assets[2].normalizedBalance,
    "115792089237316195423570985008687907853269984665640564039457.584007913129639935"
  );
  assert.equal(assets[3].symbol, "UNKNOWN");
  assert.equal(assets[3].name, "Unknown token");
  assert.equal(assets[4].rawBalance, "0");
  assert.equal(assets[4].normalizedBalance, "0");
  assert.equal(assets.some((asset) => asset.symbol === "NFT"), false);
});

test("rejects malformed token balance responses", () => {
  assert.throws(
    () => parseTokenBalances(readFixture("blockscout-malformed.json"), syncedAt),
    /malformed Blockscout token balances response/
  );
});

test("retries 429 and temporary 5xx responses", async () => {
  let rateLimitCalls = 0;
  const rateLimitResult = await fetchJsonWithRetry("https://example.test", {
    fetchImpl: async () => {
      rateLimitCalls += 1;
      return rateLimitCalls === 1 ? response(429, {}) : response(200, { ok: true });
    },
    delayImpl: async () => {}
  });

  let serverErrorCalls = 0;
  const serverErrorResult = await fetchJsonWithRetry("https://example.test", {
    fetchImpl: async () => {
      serverErrorCalls += 1;
      return serverErrorCalls < 3 ? response(503, {}) : response(200, { ok: true });
    },
    delayImpl: async () => {}
  });

  assert.deepEqual(rateLimitResult, { ok: true });
  assert.equal(rateLimitCalls, 2);
  assert.deepEqual(serverErrorResult, { ok: true });
  assert.equal(serverErrorCalls, 3);
});

test("retries network errors but not malformed successful responses", async () => {
  let networkCalls = 0;
  const networkResult = await fetchJsonWithRetry("https://example.test", {
    fetchImpl: async () => {
      networkCalls += 1;

      if (networkCalls === 1) {
        throw new TypeError("network unavailable");
      }

      return response(200, { ok: true });
    },
    delayImpl: async () => {}
  });

  let malformedCalls = 0;

  await assert.rejects(
    fetchJsonWithRetry("https://example.test", {
      fetchImpl: async () => {
        malformedCalls += 1;
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("bad json");
          }
        };
      },
      delayImpl: async () => {}
    }),
    /malformed JSON response/
  );

  assert.deepEqual(networkResult, { ok: true });
  assert.equal(networkCalls, 2);
  assert.equal(malformedCalls, 1);
});

test("all reconciliation modes avoid double counting and preserve manual amount", () => {
  const parsedWalletAsset = parseTokenBalances(
    readFixture("blockscout-token-balances.json"),
    syncedAt
  )[0];
  const walletAsset = {
    ...parsedWalletAsset,
    rawBalance: "3000000",
    normalizedBalance: "3"
  };
  const portfolio = [makePortfolioAsset(10)];

  const ignored = applyWalletAccounting(portfolio, makeWalletState(walletAsset, "ignoreWallet"));
  const replaced = applyWalletAccounting(portfolio, makeWalletState(walletAsset, "replaceManual"));
  const added = applyWalletAccounting(portfolio, makeWalletState(walletAsset, "addToManual"));

  assert.equal(ignored.length, 1);
  assert.equal(ignored[0].manualAmount, 10);
  assert.equal(ignored[0].effectiveAmount, 10);
  assert.equal(replaced[0].manualAmount, 10);
  assert.equal(replaced[0].effectiveAmount, 3);
  assert.equal(added[0].manualAmount, 10);
  assert.equal(added[0].effectiveAmount, 13);
  assert.equal(portfolio[0].amount, 10);
});

test("a zero on-chain balance keeps the portfolio asset and manual amount", () => {
  const zeroAsset = parseTokenBalances(
    readFixture("blockscout-token-balances.json"),
    syncedAt
  )[4];
  const portfolio = [makePortfolioAsset(10)];
  const state = makeWalletState(zeroAsset, "replaceManual");
  state.version = 2;
  state.mappings[0].status = "tracked";
  const accounted = applyWalletAccounting(portfolio, state);

  assert.equal(accounted.length, 1);
  assert.equal(accounted[0].manualAmount, 10);
  assert.equal(accounted[0].effectiveAmount, 0);
  assert.equal(portfolio[0].amount, 10);
});

test("unmapped tokens remain discovered and excluded from wallet value", () => {
  const walletAsset = parseTokenBalances(
    readFixture("blockscout-token-balances.json"),
    syncedAt
  )[3];
  const state = {
    ...makeWalletState(walletAsset, "ignoreWallet"),
    mappings: []
  };
  const view = buildWalletView(state, [makePortfolioAsset()], {
    "usd-coin": { currentPriceUsd: 1 }
  });

  assert.equal(view.discoveredTokens.length, 1);
  assert.equal(view.walletValueUsd, 0);
  assert.equal(view.pricedWalletAssets, 0);
});

test("legacy portfolio arrays remain import-compatible", () => {
  const legacyPortfolio = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "data", "portfolio.example.json"), "utf8")
  );
  const parsed = parsePortfolioImport(legacyPortfolio);

  assert.equal(parsed.format, "legacy");
  assert.equal(parsed.wallet, null);
  assert.equal(parsed.portfolio.length, legacyPortfolio.length);
  assert.equal(parsed.portfolio[0].source, legacyPortfolio[0].source || "manual");
});

test("versioned imports restore wallet snapshot and mappings", () => {
  const portfolio = [makePortfolioAsset()];
  const walletAsset = parseTokenBalances(
    readFixture("blockscout-token-balances.json"),
    syncedAt
  )[0];
  const wallet = makeWalletState(walletAsset, "addToManual");
  const parsed = parsePortfolioImport({
    version: 2,
    exportedAt: syncedAt,
    portfolio,
    wallet
  });
  const normalizedWallet = normalizeWalletState(parsed.wallet, parsed.portfolio);

  assert.equal(parsed.format, "package");
  assert.equal(normalizedWallet.wallets[0].assets[0].rawBalance, walletAsset.rawBalance);
  assert.equal(normalizedWallet.mappings[0].portfolioAssetId, "usd-coin");
  assert.equal(normalizedWallet.mappings[0].mode, "addToManual");
});

test("confirmed ETH and ERC-20 tracking replace rather than add manual amounts", () => {
  const native = parseNativeBalance(readFixture("blockscout-address.json"), syncedAt, walletAddress);
  const usdc = parseTokenBalances(readFixture("blockscout-token-balances.json"), syncedAt)[0];
  const portfolio = [
    { id: "ethereum", name: "Ethereum", symbol: "ETH", coingeckoId: "ethereum", amount: 99, source: "manual" },
    makePortfolioAsset(10)
  ];
  const state = makeTrackedWalletState(
    [native, usdc],
    [trackedMapping(native.id, "ethereum"), trackedMapping(usdc.id, "usd-coin")]
  );
  const accounted = applyWalletAccounting(portfolio, state);

  assert.equal(accounted[0].manualAmount, 99);
  assert.equal(accounted[0].effectiveAmount, 1.2345);
  assert.equal(accounted[1].manualAmount, 10);
  assert.equal(accounted[1].effectiveAmount, 123.456789);
  assert.equal(portfolio[0].amount, 99);
  assert.equal(portfolio[1].amount, 10);
});

test("non-Ethereum assets remain manual before and after wallet accounting", () => {
  const manualAssets = [
    { id: "bitcoin", name: "Bitcoin", symbol: "BTC", coingeckoId: "bitcoin", amount: 1, source: "manual" },
    { id: "monero", name: "Monero", symbol: "XMR", coingeckoId: "monero", amount: 2, source: "manual" },
    { id: "toncoin", name: "Toncoin", symbol: "TON", coingeckoId: "toncoin", amount: 3, source: "manual" }
  ];
  const state = makeTrackedWalletState(
    parseTokenBalances(readFixture("blockscout-token-balances.json"), syncedAt),
    []
  );
  const accounted = applyWalletAccounting(manualAssets, state);

  assert.deepEqual(accounted.map((asset) => asset.effectiveAmount), [1, 2, 3]);
  assert.ok(accounted.every((asset) => asset.accountingSource === "manual"));
});

test("manual Ethereum amount remains active until explicit tracking", () => {
  const native = parseNativeBalance(readFixture("blockscout-address.json"), syncedAt, walletAddress);
  const portfolio = [
    { id: "ethereum", name: "Ethereum", symbol: "ETH", coingeckoId: "ethereum", amount: 7, source: "manual" }
  ];
  const [accounted] = applyWalletAccounting(portfolio, makeTrackedWalletState([native], []));

  assert.equal(accounted.effectiveAmount, 7);
  assert.equal(accounted.isEthereumTracked, false);
});

test("stopping tracking excludes the asset without restoring manual amount", () => {
  const usdc = parseTokenBalances(readFixture("blockscout-token-balances.json"), syncedAt)[0];
  const mapping = {
    ...trackedMapping(usdc.id, "usd-coin"),
    status: "stopped",
    stoppedAt: syncedAt
  };
  const portfolio = [makePortfolioAsset(10)];
  const [accounted] = applyWalletAccounting(
    portfolio,
    makeTrackedWalletState([usdc], [mapping])
  );
  const calculated = buildPortfolioResponse([accounted], priceResult({
    "usd-coin": { currentPriceUsd: 1 }
  }));

  assert.equal(accounted.manualAmount, 10);
  assert.equal(accounted.effectiveAmount, null);
  assert.equal(accounted.isActive, false);
  assert.equal(calculated.response.totals.numberOfAssets, 0);
  assert.equal(calculated.portfolioTotalUsd, 0);
  assert.equal(calculated.pricedAssets.length, 0);
});

test("a mapped ERC-20 missing from a complete sync becomes zero", () => {
  const previous = parseTokenBalances(readFixture("blockscout-token-balances.json"), syncedAt)[0];
  const merged = mergeMissingAssetsAsZero([previous], [], "2026-08-03T11:00:00.000Z");

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, previous.id);
  assert.equal(merged[0].rawBalance, "0");
  assert.equal(merged[0].normalizedBalance, "0");
});

test("network and malformed JSON failures preserve the last successful snapshot as stale", async () => {
  const previousAsset = parseTokenBalances(
    readFixture("blockscout-token-balances.json"),
    syncedAt
  )[0];
  const previousState = makeTrackedWalletState(
    [previousAsset],
    [trackedMapping(previousAsset.id, "usd-coin")]
  );

  for (const fetchImpl of [
    async () => {
      throw new TypeError("network unavailable");
    },
    async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("bad json");
      }
    })
  ]) {
    let writtenState;

    await assert.rejects(
      performWalletSync({
        config: { chainId: 1, address: walletAddress, baseUrl: "https://eth.blockscout.com" },
        fetchImpl,
        maxAttempts: 1,
        readState: async () => previousState,
        writeState: async (state) => {
          writtenState = state;
        },
        now: () => new Date("2026-08-03T12:00:00.000Z")
      })
    );

    assert.equal(writtenState.wallets[0].stale, true);
    assert.equal(writtenState.wallets[0].lastSuccessfulSyncAt, syncedAt);
    assert.equal(writtenState.wallets[0].assets[0].rawBalance, previousAsset.rawBalance);
    assert.deepEqual(writtenState.mappings, previousState.mappings);
  }
});

test("discovered tokens are excluded from totals, allocation, count and snapshot assets", () => {
  const discovered = parseTokenBalances(
    readFixture("blockscout-token-balances.json"),
    syncedAt
  )[3];
  const portfolio = [makePortfolioAsset(5)];
  const state = makeTrackedWalletState([discovered], []);
  const accounted = applyWalletAccounting(portfolio, state);
  const calculated = buildPortfolioResponse(accounted, priceResult({
    "usd-coin": { currentPriceUsd: 1 }
  }));
  const view = buildWalletView(state, portfolio, { "usd-coin": { currentPriceUsd: 1 } });

  assert.equal(calculated.portfolioTotalUsd, 5);
  assert.equal(calculated.response.totals.numberOfAssets, 1);
  assert.equal(calculated.response.allocation.length, 1);
  assert.equal(calculated.pricedAssets.length, 1);
  assert.equal(view.discoveredTokens.length, 1);
  assert.equal(view.trackedAssets, 0);
});

test("unpriced tracked balances remain visible without adding unknown value", () => {
  const token = parseTokenBalances(readFixture("blockscout-token-balances.json"), syncedAt)[1];
  const portfolio = [
    { id: "unpriced", name: token.name, symbol: token.symbol, coingeckoId: "unpriced", amount: 50, source: "manual" }
  ];
  const state = makeTrackedWalletState([token], [trackedMapping(token.id, "unpriced")]);
  const accounted = applyWalletAccounting(portfolio, state);
  const calculated = buildPortfolioResponse(accounted, priceResult({}));
  const view = buildWalletView(state, portfolio, {});

  assert.equal(accounted[0].effectiveAmount, 1.000000000000000001);
  assert.equal(calculated.portfolioTotalUsd, 0);
  assert.equal(calculated.response.totals.numberOfAssets, 1);
  assert.equal(view.trackedAssets, 1);
  assert.equal(view.unpricedTrackedAssets, 1);
  assert.equal(view.matchedAssets[0].normalizedBalance, "1.000000000000000001");
});

test("tracked Ethereum value sums every priced tracked asset", () => {
  const native = parseNativeBalance(readFixture("blockscout-address.json"), syncedAt, walletAddress);
  const usdc = parseTokenBalances(readFixture("blockscout-token-balances.json"), syncedAt)[0];
  const portfolio = [
    { id: "ethereum", name: "Ethereum", symbol: "ETH", coingeckoId: "ethereum", amount: 0, source: "manual" },
    makePortfolioAsset(0)
  ];
  const state = makeTrackedWalletState(
    [native, usdc],
    [trackedMapping(native.id, "ethereum"), trackedMapping(usdc.id, "usd-coin")]
  );
  const view = buildWalletView(state, portfolio, {
    ethereum: { currentPriceUsd: 2000 },
    "usd-coin": { currentPriceUsd: 1 }
  });

  assert.equal(view.trackedEthereumValueUsd, 1.2345 * 2000 + 123.456789);
  assert.equal(view.pricedTrackedAssets, 2);
  assert.equal(view.unpricedTrackedAssets, 0);
});

test("wallet and portfolio mappings are one-to-one", () => {
  const [first, second] = parseTokenBalances(
    readFixture("blockscout-token-balances.json"),
    syncedAt
  );
  const portfolio = [
    makePortfolioAsset(),
    { id: "second", name: "Second", symbol: "SECOND", coingeckoId: "second", amount: 0, source: "manual" }
  ];
  const base = makeTrackedWalletState([first, second], []);

  assert.throws(
    () => normalizeWalletState({
      ...base,
      mappings: [trackedMapping(first.id, "usd-coin"), trackedMapping(first.id, "second")]
    }, portfolio),
    /duplicate mapping for wallet asset/
  );
  assert.throws(
    () => normalizeWalletState({
      ...base,
      mappings: [trackedMapping(first.id, "usd-coin"), trackedMapping(second.id, "usd-coin")]
    }, portfolio),
    /duplicate mapping for portfolio asset/
  );
});

test("symbol matches alone never create mappings or normal suggestions", () => {
  const usdc = parseTokenBalances(readFixture("blockscout-token-balances.json"), syncedAt)[0];
  const state = makeTrackedWalletState([usdc], []);
  const view = buildWalletView(state, [makePortfolioAsset()], {});

  assert.equal(state.mappings.length, 0);
  assert.equal(view.balances[0].mapping, null);
  assert.equal(view.balances[0].suggestedPortfolioAsset, null);
  assert.equal(view.balances[0].contractVerified, false);
  assert.equal(view.balances[0].requiresAdvancedConfirmation, true);
  assert.equal(view.discoveredTokens.length, 1);
});

test("versioned imports preserve tracked state", () => {
  const portfolio = [makePortfolioAsset()];
  const walletAsset = parseTokenBalances(
    readFixture("blockscout-token-balances.json"),
    syncedAt
  )[0];
  const wallet = makeTrackedWalletState(
    [walletAsset],
    [trackedMapping(walletAsset.id, "usd-coin")]
  );
  const parsed = parsePortfolioImport({ version: 2, portfolio, wallet });
  const normalized = normalizeWalletState(parsed.wallet, parsed.portfolio);

  assert.equal(normalized.version, 3);
  assert.equal(normalized.mappings[0].status, "tracked");
  assert.equal(normalized.mappings[0].trackedAt, syncedAt);
});

test("manual holdings migrate to unassigned and stay out of an individual wallet scope", () => {
  const legacy = [makePortfolioAsset(0.24)];
  const migrated = migratePortfolioManualPositions(legacy);
  const scoped = applyManualWalletScope(
    applyWalletAccounting(migrated.portfolio, makeTrackedWalletState([], [])),
    "sample-manual-wallet"
  );

  assert.equal(migrated.migrated, true);
  assert.deepEqual(migrated.portfolio[0].manualPositions, [{ walletId: null, amount: 0.24 }]);
  assert.equal(scoped.length, 0);
});

test("manual BTC scope, split and add buy retain wallet-specific amounts", () => {
  const asset = {
    id: "bitcoin",
    name: "Bitcoin",
    symbol: "BTC",
    coingeckoId: "bitcoin",
    amount: 0.24,
    source: "manual",
    manualPositions: [{ walletId: "sample-manual-wallet", amount: 0.24 }]
  };
  const split = moveManualPositionInAsset(asset, "sample-manual-wallet", "secondary-manual-wallet", 0.04);
  const bought = addManualBuyToAsset(split, 0.1, "sample-manual-wallet");
  const state = makeTrackedWalletState([], []);
  const accounted = applyWalletAccounting([bought], state);

  assert.equal(applyManualWalletScope(accounted, "sample-manual-wallet")[0].effectiveAmount, 0.3);
  assert.equal(applyManualWalletScope(accounted, "secondary-manual-wallet")[0].effectiveAmount, 0.04);
  assert.ok(Math.abs(applyManualWalletScope(accounted)[0].effectiveAmount - 0.34) < 1e-12);
});

test("assigning existing unassigned BTC moves the holding without creating a duplicate", () => {
  const btc = {
    id: "bitcoin",
    name: "Bitcoin",
    symbol: "BTC",
    coingeckoId: "bitcoin",
    amount: 0.24033,
    source: "manual",
    manualPositions: [{ walletId: null, amount: 0.24033 }]
  };
  const assigned = assignUnassignedManualPosition(btc, "sample-manual-wallet", 0.24033);
  const accounted = applyWalletAccounting([assigned], makeTrackedWalletState([], []));

  assert.equal(assigned.amount, 0.24033);
  assert.deepEqual(assigned.manualPositions, [{ walletId: "sample-manual-wallet", amount: 0.24033 }]);
  assert.equal(applyManualWalletScope(accounted)[0].effectiveAmount, 0.24033);
  assert.equal(applyManualWalletScope(accounted, "sample-manual-wallet")[0].effectiveAmount, 0.24033);
  assert.equal(assigned.manualPositions.some((position) => position.walletId === null), false);
  assert.equal([assigned].length, 1);
});

test("manual-only wallets participate in portfolio scopes without EVM addresses or sync balances", () => {
  const wallets = normalizeWallets([
    makeWalletConfig("sample-manual-wallet", "Sample manual wallet", walletAddress),
    { id: "monero-wallet", name: "Monero", type: "manual", address: null, chain: "monero", enabled: true },
    { id: "tonkeeper", name: "Tonkeeper", type: "manual", address: null, chain: "ton", enabled: true },
    { id: "solflare", name: "Solflare", type: "manual", address: null, chain: "solana", enabled: true }
  ]);
  const native = parseNativeBalance(readFixture("blockscout-address.json"), syncedAt, walletAddress);
  const portfolio = [
    { id: "ethereum", name: "Ethereum", symbol: "ETH", coingeckoId: "ethereum", amount: 0, source: "manual" },
    { id: "bitcoin", name: "Bitcoin", symbol: "BTC", coingeckoId: "bitcoin", amount: 1, source: "manual", manualPositions: [{ walletId: "sample-manual-wallet", amount: 1 }] },
    { id: "monero", name: "Monero", symbol: "XMR", coingeckoId: "monero", amount: 2, source: "manual", manualPositions: [{ walletId: "monero-wallet", amount: 2 }] },
    { id: "toncoin", name: "Toncoin", symbol: "TON", coingeckoId: "the-open-network", amount: 3, source: "manual", manualPositions: [{ walletId: "tonkeeper", amount: 3 }] },
    { id: "pump", name: "PUMP", symbol: "PUMP", coingeckoId: "pump-fun", amount: 4, source: "manual", manualPositions: [{ walletId: "solflare", amount: 4 }] }
  ];
  const accounted = applyWalletAccounting(
    portfolio,
    makeMultiWalletState([
      {
        walletId: "sample-manual-wallet",
        assets: [native],
        lastAttemptAt: syncedAt,
        lastSuccessfulSyncAt: syncedAt,
        stale: false,
        lastError: null
      }
    ], [trackedMapping(native.id, "ethereum")]),
    wallets
  );

  assert.equal(wallets.filter((wallet) => wallet.type === "manual").length, 3);
  assert.equal(aggregateWalletAssets(makeTrackedWalletState([], []), wallets).enabledWallets.length, 1);
  assert.deepEqual(applyManualWalletScope(accounted, "monero-wallet").map((asset) => asset.symbol), ["XMR"]);
  assert.deepEqual(applyManualWalletScope(accounted, "tonkeeper").map((asset) => asset.symbol), ["TON"]);
  assert.deepEqual(applyManualWalletScope(accounted, "solflare").map((asset) => asset.symbol), ["PUMP"]);
  assert.deepEqual(applyManualWalletScope(accounted, "sample-manual-wallet").map((asset) => asset.symbol), ["ETH", "BTC"]);
  assert.equal(applyManualWalletScope(accounted, "sample-manual-wallet").find((asset) => asset.symbol === "BTC").effectiveAmount, 1);
  assert.equal(applyManualWalletScope(accounted, "sample-manual-wallet").find((asset) => asset.symbol === "ETH").effectiveAmount, 1.2345);
  assert.equal(applyManualWalletScope(accounted).reduce((sum, asset) => sum + asset.effectiveAmount, 0), 11.2345);
  assert.equal(selectWalletScope(wallets, "monero-wallet").find((wallet) => wallet.id === "monero-wallet").enabled, true);
});

test("wallet summaries add manual value without re-enabling disabled EVM balances", () => {
  const asset = {
    ...makePortfolioAsset(2),
    manualPositions: [{ walletId: "sample-manual-wallet", amount: 2 }]
  };
  const wallets = [{
    id: "sample-manual-wallet",
    name: "Sample manual wallet",
    address: walletAddress,
    chain: "ethereum",
    enabled: false
  }];
  const summary = buildManualWalletSummary(
    applyWalletAccounting([asset], makeTrackedWalletState([], [])),
    wallets,
    { "usd-coin": { currentPriceUsd: 1 } }
  );

  assert.equal(summary.walletSummaries.get("sample-manual-wallet").manualValueUsd, 2);
  assert.equal(summary.walletSummaries.get("sample-manual-wallet").manualAssets, 1);
});

test("official USDC receives an exact contract suggestion from CoinMarketCap metadata", () => {
  const fixture = readFixture("usdc-contracts.json");
  const officialUsdc = parseTokenBalances([fixture.officialTokenBalance], syncedAt)[0];
  const metadata = extractEthereumContractMetadata(fixture.coinMarketCapAsset);
  const searchResult = mapCoinMarketCapSearchResult(fixture.coinMarketCapAsset);
  const state = makeTrackedWalletState([officialUsdc], []);
  const view = buildWalletView(state, [makePortfolioAsset()], {}, {
    "usd-coin": metadata
  });

  assert.equal(metadata.contractAddress, fixture.coinMarketCapAsset.platform.token_address);
  assert.equal(searchResult.ethereumContract.contractAddress, metadata.contractAddress);
  assert.equal(view.suggestedAssets.length, 1);
  assert.equal(view.otherDiscoveredTokens.length, 0);
  assert.equal(view.balances[0].suggestedPortfolioAsset.id, "usd-coin");
  assert.equal(view.balances[0].contractVerified, true);
  assert.equal(view.balances[0].verificationMethod, "coinmarketcap-contract");
});

test("fake USDC with the same symbol is classified as a possible spam mismatch", () => {
  const fixture = readFixture("usdc-contracts.json");
  const fakeUsdc = parseTokenBalances([fixture.fakeTokenBalance], syncedAt)[0];
  const metadata = extractEthereumContractMetadata(fixture.coinMarketCapAsset);
  const state = makeTrackedWalletState([fakeUsdc], []);
  const view = buildWalletView(state, [makePortfolioAsset()], {}, {
    "usd-coin": metadata
  });
  const [asset] = view.otherDiscoveredTokens;

  assert.equal(view.suggestedAssets.length, 0);
  assert.equal(asset.suggestedPortfolioAsset, null);
  assert.equal(asset.contractVerified, false);
  assert.equal(asset.contractMismatch, true);
  assert.equal(asset.possibleSpam, true);
  assert.equal(asset.requiresAdvancedConfirmation, true);
  assert.equal(asset.conflictingPortfolioAsset.id, "usd-coin");
});

test("live-shaped USDC view identifies the exact fake contract as a mismatch", () => {
  const fixture = readFixture("usdc-contracts.json");
  const [officialUsdc, fakeUsdc] = parseTokenBalances(
    [fixture.officialTokenBalance, fixture.fakeTokenBalance],
    syncedAt
  );
  const metadata = extractEthereumContractMetadata(fixture.coinMarketCapAsset);
  const state = makeTrackedWalletState([officialUsdc, fakeUsdc], []);
  const view = buildWalletView(state, [makePortfolioAsset()], {}, {
    "usd-coin": metadata
  });
  const normalizedFakeContract = fixture.fakeTokenBalance.token.address_hash.toLowerCase();
  const renderedFake = view.otherDiscoveredTokens.find(
    (asset) => asset.contractAddress.toLowerCase() === normalizedFakeContract
  );

  assert.equal(view.suggestedAssets[0].contractAddress, officialUsdc.contractAddress);
  assert.ok(renderedFake);
  assert.equal(renderedFake.contractMismatch, true);
  assert.equal(renderedFake.possibleSpam, true);
  assert.equal(renderedFake.requiresAdvancedConfirmation, true);
  assert.equal(renderedFake.suggestedPortfolioAsset, null);
  assert.equal(renderedFake.conflictingPortfolioAsset.id, "usd-coin");
});

test("fake USDC cannot use ordinary Track confirmation", () => {
  const fixture = readFixture("usdc-contracts.json");
  const fakeUsdc = parseTokenBalances([fixture.fakeTokenBalance], syncedAt)[0];
  const metadata = extractEthereumContractMetadata(fixture.coinMarketCapAsset);

  assert.throws(
    () => assertTrackConfirmation(fakeUsdc, makePortfolioAsset(), metadata, false),
    (error) =>
      error.code === "ADVANCED_TRACK_REQUIRED" &&
      error.verification.contractMismatch === true
  );
  assert.equal(
    assertTrackConfirmation(fakeUsdc, makePortfolioAsset(), metadata, true)
      .requiresAdvancedConfirmation,
    true
  );
});

test("native ETH remains eligible for ordinary Track", () => {
  const native = parseNativeBalance(
    readFixture("blockscout-address.json"),
    syncedAt,
    walletAddress
  );
  const ethereum = {
    id: "ethereum",
    name: "Ethereum",
    symbol: "ETH",
    coingeckoId: "ethereum",
    cmcId: 1027,
    amount: 4,
    source: "manual"
  };
  const verification = getTrackVerification(native, ethereum, null);
  const view = buildWalletView(makeTrackedWalletState([native], []), [ethereum]);

  assert.equal(verification.contractVerified, true);
  assert.equal(verification.requiresAdvancedConfirmation, false);
  assert.equal(view.suggestedAssets.length, 1);
  assert.equal(view.balances[0].suggestedPortfolioAsset.id, "ethereum");
});

test("aggregates the same tracked ERC-20 across enabled wallets with an exact breakdown", () => {
  const [fixtureAsset] = parseTokenBalances(readFixture("blockscout-token-balances.json"), syncedAt);
  const mainAsset = {
    ...fixtureAsset,
    rawBalance: "2000000",
    normalizedBalance: "2"
  };
  const reserveAsset = {
    ...fixtureAsset,
    rawBalance: "3000000",
    normalizedBalance: "3"
  };
  const state = makeMultiWalletState([
    { walletId: "main", assets: [mainAsset], lastSuccessfulSyncAt: syncedAt, stale: false },
    { walletId: "reserve", assets: [reserveAsset], lastSuccessfulSyncAt: syncedAt, stale: false }
  ], [trackedMapping(mainAsset.id, "usd-coin")]);
  const wallets = [
    makeWalletConfig("main", "Main", "0x1111111111111111111111111111111111111111"),
    makeWalletConfig("reserve", "Reserve", "0x2222222222222222222222222222222222222222")
  ];
  const [accounted] = applyWalletAccounting([makePortfolioAsset(10)], state, wallets);
  const view = buildWalletView(state, [makePortfolioAsset(10)], { "usd-coin": { currentPriceUsd: 1 } }, {}, wallets);

  assert.equal(accounted.manualAmount, 10);
  assert.equal(accounted.effectiveAmount, 5);
  assert.equal(accounted.walletAmount, "5");
  assert.deepEqual(
    accounted.walletBreakdown.map((entry) => [entry.walletId, entry.walletName, entry.amount]),
    [["main", "Main", "2"], ["reserve", "Reserve", "3"]]
  );
  assert.equal(view.balances[0].rawBalance, "5000000");
  assert.equal(view.trackedEthereumValueUsd, 5);
});

test("disabled wallets are excluded from aggregation without changing manual amounts", () => {
  const [fixtureAsset] = parseTokenBalances(readFixture("blockscout-token-balances.json"), syncedAt);
  const state = makeMultiWalletState([
    {
      walletId: "main",
      assets: [{ ...fixtureAsset, rawBalance: "2000000", normalizedBalance: "2" }],
      lastSuccessfulSyncAt: syncedAt,
      stale: false
    },
    {
      walletId: "reserve",
      assets: [{ ...fixtureAsset, rawBalance: "3000000", normalizedBalance: "3" }],
      lastSuccessfulSyncAt: syncedAt,
      stale: false
    }
  ], [trackedMapping(fixtureAsset.id, "usd-coin")]);
  const wallets = [
    makeWalletConfig("main", "Main", "0x1111111111111111111111111111111111111111"),
    makeWalletConfig("reserve", "Reserve", "0x2222222222222222222222222222222222222222", false)
  ];
  const [accounted] = applyWalletAccounting([makePortfolioAsset(10)], state, wallets);

  assert.equal(accounted.effectiveAmount, 2);
  assert.equal(accounted.manualAmount, 10);
  assert.deepEqual(accounted.walletBreakdown.map((entry) => entry.walletId), ["main"]);
});

test("single-wallet scope keeps manual amounts untouched and exposes only that wallet balance", () => {
  const [fixtureAsset] = parseTokenBalances(readFixture("blockscout-token-balances.json"), syncedAt);
  const state = makeMultiWalletState([
    {
      walletId: "main",
      assets: [{ ...fixtureAsset, rawBalance: "2000000", normalizedBalance: "2" }],
      lastSuccessfulSyncAt: syncedAt,
      stale: false
    },
    {
      walletId: "reserve",
      assets: [{ ...fixtureAsset, rawBalance: "3000000", normalizedBalance: "3" }],
      lastSuccessfulSyncAt: syncedAt,
      stale: false
    }
  ], [trackedMapping(fixtureAsset.id, "usd-coin")]);
  const wallets = [
    makeWalletConfig("main", "Main", "0x1111111111111111111111111111111111111111"),
    makeWalletConfig("reserve", "Reserve", "0x2222222222222222222222222222222222222222", false)
  ];
  const scopedWallets = selectWalletScope(wallets, "reserve");
  const [accounted] = applyWalletAccounting([makePortfolioAsset(10)], state, scopedWallets);

  assert.equal(wallets[1].enabled, false);
  assert.equal(scopedWallets[0].enabled, false);
  assert.equal(scopedWallets[1].enabled, true);
  assert.equal(accounted.manualAmount, 10);
  assert.equal(accounted.effectiveAmount, 3);
  assert.deepEqual(accounted.walletBreakdown.map((entry) => entry.walletId), ["reserve"]);
  assert.throws(() => selectWalletScope(wallets, "missing"), /wallet not found/);
});

test("global wallet sync continues after one wallet fails and preserves its stale snapshot", async () => {
  const initialState = makeMultiWalletState([
    {
      walletId: "main",
      assets: [],
      lastAttemptAt: null,
      lastSuccessfulSyncAt: null,
      stale: false,
      lastError: null
    },
    {
      walletId: "reserve",
      assets: [],
      lastAttemptAt: null,
      lastSuccessfulSyncAt: null,
      stale: false,
      lastError: null
    }
  ]);
  const wallets = [
    makeWalletConfig("main", "Main", "0x1111111111111111111111111111111111111111"),
    makeWalletConfig("reserve", "Reserve", "0x2222222222222222222222222222222222222222")
  ];
  let state = initialState;
  const result = await syncWallet({
    wallets,
    readState: async () => state,
    writeState: async (next) => { state = next; },
    fetchImpl: async (url) => {
      if (url.includes(wallets[0].address)) return response(503, {});
      return response(
        200,
        url.endsWith("/token-balances")
          ? readFixture("blockscout-token-balances.json")
          : { ...readFixture("blockscout-address.json"), hash: wallets[1].address }
      );
    },
    maxAttempts: 1,
    delayImpl: async () => {},
    now: () => new Date(syncedAt),
    config: { chainId: 1, address: walletAddress, baseUrl: "https://eth.blockscout.com" }
  });

  const failed = state.wallets.find((snapshot) => snapshot.walletId === "main");
  const succeeded = state.wallets.find((snapshot) => snapshot.walletId === "reserve");
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].walletId, "main");
  assert.equal(failed.stale, true);
  assert.equal(succeeded.stale, false);
  assert.ok(succeeded.lastSuccessfulSyncAt);
});

test("wallet storage migrates a legacy address with a rollback copy and validates CRUD", async () => {
  const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), "crypto-portfolio-wallets-"));
  const options = {
    walletPath: path.join(tempPath, "wallet.json"),
    walletsPath: path.join(tempPath, "wallets.json"),
    backupsPath: path.join(tempPath, "backups")
  };
  const legacy = makeTrackedWalletState([], []);
  fs.writeFileSync(options.walletPath, `${JSON.stringify(legacy)}\n`);

  try {
    const migratedWallets = await readWallets(options);
    const migratedState = await readWalletState(options);
    assert.deepEqual(migratedWallets.map((wallet) => wallet.id), ["main"]);
    assert.equal(migratedState.version, 3);
    assert.equal(migratedState.wallets[0].walletId, "main");
    assert.match(fs.readdirSync(options.backupsPath)[0], /^wallet-before-multi-wallet-migration-/);

    const reserve = await createWallet({
      name: "Reserve",
      address: "0x2222222222222222222222222222222222222222"
    }, options);
    assert.equal(reserve.id, "reserve");
    const monero = await createWallet({
      name: "Monero",
      type: "manual",
      chain: "monero",
      address: null
    }, options);
    assert.deepEqual(monero, {
      id: "monero",
      name: "Monero",
      type: "manual",
      address: null,
      chain: "monero",
      enabled: true
    });
    assert.equal((await updateWallet(reserve.id, { enabled: false, name: "Reserve cold" }, options)).enabled, false);
    assert.throws(
      () => normalizeWallets([{ id: "bad", name: "Bad", address: "not-an-address", chain: "ethereum", enabled: true }]),
      /valid Ethereum address/
    );

    const [asset] = parseTokenBalances(readFixture("blockscout-token-balances.json"), syncedAt);
    await writeWalletState(makeMultiWalletState([
      { walletId: "main", assets: [asset], lastSuccessfulSyncAt: syncedAt, stale: false },
      { walletId: "reserve", assets: [asset], lastSuccessfulSyncAt: syncedAt, stale: false }
    ], [trackedMapping(asset.id, "usd-coin")]), options);
    assert.equal(await deleteWallet("reserve", options), true);
    const stateAfterDelete = await readWalletState(options);
    const [accounted] = applyWalletAccounting([makePortfolioAsset(10)], stateAfterDelete, await readWallets(options));

    assert.equal(accounted.manualAmount, 10);
    assert.equal(accounted.effectiveAmount, 123.456789);
  } finally {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }
});

test("legacy migration retains its address when wallets configuration already exists", async () => {
  const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), "crypto-portfolio-wallets-existing-"));
  const options = {
    walletPath: path.join(tempPath, "wallet.json"),
    walletsPath: path.join(tempPath, "wallets.json"),
    backupsPath: path.join(tempPath, "backups")
  };

  fs.writeFileSync(options.walletPath, `${JSON.stringify(makeTrackedWalletState([], []))}\n`);
  fs.writeFileSync(options.walletsPath, `${JSON.stringify([
    makeWalletConfig("main", "Existing", "0x1111111111111111111111111111111111111111")
  ])}\n`);

  try {
    const wallets = await readWallets(options);
    const state = await readWalletState(options);
    const migratedWallet = wallets.find((wallet) => wallet.address.toLowerCase() === walletAddress.toLowerCase());

    assert.ok(migratedWallet);
    assert.notEqual(migratedWallet.id, "main");
    assert.equal(state.wallets[0].walletId, migratedWallet.id);
  } finally {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }
});

test("wallet manager exposes the mismatch and possible-spam warning copy", () => {
  const appSource = fs.readFileSync(
    path.join(__dirname, "..", "public", "app.js"),
    "utf8"
  );
  const uiSource = fs.readFileSync(
    path.join(__dirname, "..", "public", "ui.js"),
    "utf8"
  );

  assert.match(uiSource, /Contract mismatch/);
  assert.match(uiSource, /Potential spam token/);
  assert.match(uiSource, /Advanced tracking/);
  assert.match(appSource, /contract-mismatch-row/);
  assert.match(appSource, /asset\.contractMismatch === true \|\| asset\.possibleSpam === true/);
  assert.match(appSource, /Full name/);
  assert.match(appSource, /Full contract address/);
  assert.match(appSource, /Selected portfolio asset \/ priced asset/);
  assert.match(uiSource, /Open in Blockscout/);
});
