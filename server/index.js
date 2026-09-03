require("dotenv").config();

const express = require("express");
const path = require("path");
const {
  readPortfolio,
  writePortfolio,
  addAsset,
  updateAssetAmount,
  addBuy,
  moveManualPosition,
  assignUnassignedManualPositionById,
  deleteAsset,
  getManualPositions,
  migratePortfolioManualPositions,
  unassignManualPositionsForWallet,
  normalizeAssetInput,
  parsePortfolioImport
} = require("./portfolio");
const {
  fetchPrices,
  searchCoins,
  searchCoinMarketCapCoins,
  getEthereumContractMetadataForAssets,
  getProviderHealth
} = require("./prices");
const { upsertDailySnapshot, getRecentHistory } = require("./history");
const {
  backupDataBeforeImport,
  backupPortfolioBeforeManualPositionsMigration,
  createManualBackup
} = require("./backup");
const {
  readWalletState,
  readWallets,
  writeWalletState,
  createWallet,
  updateWallet,
  deleteWallet,
  syncWallet,
  applyWalletAccounting,
  aggregateWalletAssets,
  selectWalletScope,
  trackWalletAsset,
  stopTrackingWalletAsset,
  getWalletPriceAssets,
  buildWalletView,
  assertTrackConfirmation,
  isTrackedMapping
} = require("./wallet");

const app = express();
const port = 3002;

app.set("query parser", "simple");

function isAllowedHost(host) {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

function apiRequestDenialReason(req) {
  if (req.get("Sec-Fetch-Site") === "cross-site") {
    return "cross-site API requests are not allowed";
  }

  const origin = req.get("Origin");
  if (!origin) {
    return null;
  }

  try {
    return new URL(origin).host === req.get("Host")
      ? null
      : "API request origin does not match host";
  } catch (_error) {
    return "invalid API request origin";
  }
}

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
  );
  if (!isAllowedHost(_req.get("Host"))) {
    return res.status(403).json({ error: "host is not allowed" });
  }

  next();
});

app.use("/api", (req, res, next) => {
  const denialReason = apiRequestDenialReason(req);
  if (denialReason) {
    return res.status(403).json({ error: denialReason });
  }

  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

let manualPositionsMigration = null;

async function ensureManualPositionsMigration() {
  if (!manualPositionsMigration) {
    manualPositionsMigration = (async () => {
      const currentPortfolio = await readPortfolio();
      const migration = migratePortfolioManualPositions(currentPortfolio);

      if (migration.migrated) {
        await backupPortfolioBeforeManualPositionsMigration(currentPortfolio);
        await writePortfolio(migration.portfolio);
      }
    })();
  }

  return manualPositionsMigration;
}

app.use("/api", async (_req, _res, next) => {
  try {
    await ensureManualPositionsMigration();
    next();
  } catch (error) {
    next(error);
  }
});

function requestedWalletId(req) {
  const value = String(req.query.wallet || "").trim();
  return value && value !== "all" ? value : null;
}

app.get("/api/portfolio", async (req, res) => {
  try {
    const walletId = requestedWalletId(req);
    const { response } = await loadPortfolioData({
      createSnapshot: !walletId,
      walletId
    });
    res.json(response);
  } catch (error) {
    res.status(error.message === "wallet not found" ? 404 : 500).json({
      error: error.message === "wallet not found" ? error.message : "Failed to load portfolio"
    });
  }
});

app.get("/api/history", async (_req, res) => {
  try {
    const history = await getRecentHistory();
    res.json({ history });
  } catch (_error) {
    res.status(500).json({ error: "Failed to load history" });
  }
});

app.get("/api/health/providers", (_req, res) => {
  res.json(getProviderHealth());
});

function escapeCsvValue(value) {
  if (value == null) {
    return "";
  }

  let stringValue = String(value);

  if (/^\s*[=+\-@]/.test(stringValue)) {
    stringValue = `'${stringValue}`;
  }

  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function rowsToCsv(headers, rows) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(","))
  ].join("\n");
}

function buildPortfolioResponse(portfolio, priceResult) {
  const { pricesById, updatedAt, error, priceSource, priceWarning } = priceResult;
  const assets = portfolio.filter((asset) => asset.isActive !== false).map((asset) => {
    const price = pricesById[asset.coingeckoId] || {};
    const currentPriceUsd = price.currentPriceUsd ?? null;
    const effectiveAmount = Object.hasOwn(asset, "effectiveAmount")
      ? asset.effectiveAmount
      : asset.amount;
    const totalPerCoinUsd =
      typeof currentPriceUsd === "number" && typeof effectiveAmount === "number"
        ? effectiveAmount * currentPriceUsd
        : null;

    return {
      ...asset,
      effectiveAmount,
      currentPriceUsd,
      totalPerCoinUsd,
      change24h: price.change24h ?? null,
      change7d: price.change7d ?? null,
      change30d: price.change30d ?? null
    };
  });

  const portfolioTotalUsd = assets.reduce(
    (sum, asset) => sum + (asset.totalPerCoinUsd ?? 0),
    0
  );

  const pricedAssets = assets.filter(
    (asset) => typeof asset.totalPerCoinUsd === "number" && asset.totalPerCoinUsd > 0
  );

  const allocation = pricedAssets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    symbol: asset.symbol,
    percentage:
      portfolioTotalUsd > 0 ? (asset.totalPerCoinUsd / portfolioTotalUsd) * 100 : 0
  }));

  function calculateWeightedChange(changeKey) {
    const assetsWithChange = pricedAssets.filter(
      (asset) => typeof asset[changeKey] === "number"
    );

    const totalValueWithChange = assetsWithChange.reduce(
      (sum, asset) => sum + asset.totalPerCoinUsd,
      0
    );

    if (!totalValueWithChange) {
      return null;
    }

    return assetsWithChange.reduce(
      (sum, asset) =>
        sum + (asset.totalPerCoinUsd / totalValueWithChange) * asset[changeKey],
      0
    );
  }

  return {
    assets,
    pricedAssets,
    portfolioTotalUsd,
    response: {
      assets,
      totals: {
        portfolioTotalUsd,
        numberOfAssets: assets.length,
        change24h: calculateWeightedChange("change24h"),
        change7d: calculateWeightedChange("change7d"),
        change30d: calculateWeightedChange("change30d")
      },
      allocation,
      lastPriceUpdateTime: updatedAt,
      priceError: error,
      priceSource,
      priceWarning
    }
  };
}

function manualPositionsForScope(asset, walletId = null) {
  const positions = getManualPositions(asset);
  return walletId
    ? positions.filter((position) => position.walletId === walletId)
    : positions;
}

function manualAmountForScope(asset, walletId = null) {
  return manualPositionsForScope(asset, walletId).reduce(
    (sum, position) => sum + position.amount,
    0
  );
}

function applyManualWalletScope(accountedPortfolio, walletId = null) {
  return accountedPortfolio
    .map((asset) => {
      const manualPositions = getManualPositions(asset);
      const scopedManualPositions = manualPositionsForScope(asset, walletId);
      const scopedManualAmount = manualAmountForScope(asset, walletId);
      const isScopedManualAsset = asset.accountingSource === "manual";

      return {
        ...asset,
        manualPositions,
        scopedManualPositions,
        scopedManualAmount,
        ...(isScopedManualAsset ? { effectiveAmount: scopedManualAmount } : {})
      };
    })
    .filter((asset) => {
      if (!walletId) return true;
      const hasScopedAutoAsset =
        asset.isEthereumTracked &&
        asset.walletBreakdown.some((entry) => entry.walletId === walletId);
      return hasScopedAutoAsset || asset.scopedManualAmount > 0;
    });
}

function buildManualWalletSummary(accountedPortfolio, wallets, pricesById) {
  const walletSummaries = new Map(
    wallets.map((wallet) => [wallet.id, {
      walletId: wallet.id,
      manualValueUsd: 0,
      manualAssets: 0
    }])
  );
  const unassigned = { manualValueUsd: 0, manualAssets: 0 };

  for (const asset of accountedPortfolio) {
    if (asset.accountingSource !== "manual" || asset.isActive === false) continue;
    const currentPriceUsd = pricesById[asset.coingeckoId]?.currentPriceUsd;

    for (const position of getManualPositions(asset)) {
      if (position.amount <= 0) continue;
      const summary = position.walletId
        ? walletSummaries.get(position.walletId)
        : unassigned;
      if (!summary) continue;

      summary.manualAssets += 1;
      if (typeof currentPriceUsd === "number") {
        summary.manualValueUsd += position.amount * currentPriceUsd;
      }
    }
  }

  return { walletSummaries, unassigned };
}

function applyManualWalletTotals(walletView, manualSummary) {
  const wallets = walletView.wallets.map((wallet) => {
    const manual = manualSummary.walletSummaries.get(wallet.id) || {
      manualValueUsd: 0,
      manualAssets: 0
    };
    const onChainValueUsd = wallet.walletValueUsd || 0;
    return {
      ...wallet,
      onChainValueUsd,
      manualValueUsd: manual.manualValueUsd,
      manualAssets: manual.manualAssets,
      totalValueUsd: onChainValueUsd + manual.manualValueUsd
    };
  });
  const manualValueUsd = wallets.reduce((sum, wallet) => sum + wallet.manualValueUsd, 0)
    + manualSummary.unassigned.manualValueUsd;

  return {
    ...walletView,
    wallets,
    onChainValueUsd: walletView.trackedEthereumValueUsd,
    manualValueUsd,
    totalValueUsd: walletView.trackedEthereumValueUsd + manualValueUsd,
    manualAssets: wallets.reduce((sum, wallet) => sum + wallet.manualAssets, 0)
      + manualSummary.unassigned.manualAssets,
    unassignedManual: manualSummary.unassigned
  };
}

function assertManualWalletReference(walletId, wallets) {
  if (walletId == null || walletId === "") return;
  if (!wallets.some((wallet) => wallet.id === String(walletId).trim().toLowerCase())) {
    throw new Error("manual position wallet not found");
  }
}

async function loadPortfolioData({ createSnapshot, walletId = null }) {
  const [portfolio, walletState, wallets] = await Promise.all([
    readPortfolio(),
    readWalletState(),
    readWallets()
  ]);
  const scopedWallets = selectWalletScope(wallets, walletId);
  const accountedPortfolio = applyWalletAccounting(portfolio, walletState, scopedWallets);
  const scopedPortfolio = applyManualWalletScope(accountedPortfolio, walletId);
  const [priceResult, contractResult] = await Promise.all([
    fetchPrices(getWalletPriceAssets(portfolio, walletState)),
    getEthereumContractMetadataForAssets(portfolio)
  ]);
  const { pricedAssets, portfolioTotalUsd, response } = buildPortfolioResponse(
    scopedPortfolio,
    priceResult
  );
  const walletView = buildWalletView(
    walletState,
    portfolio,
    priceResult.pricesById,
    contractResult.contractsByAssetId,
    wallets
  );
  const allAccountedPortfolio = applyWalletAccounting(portfolio, walletState, wallets);
  const manualSummary = buildManualWalletSummary(
    allAccountedPortfolio,
    wallets,
    priceResult.pricesById
  );
  response.wallet = applyManualWalletTotals(walletView, manualSummary);
  const scopedWallet = walletId
    ? buildWalletView(
        walletState,
        portfolio,
        priceResult.pricesById,
        contractResult.contractsByAssetId,
        scopedWallets
      )
    : response.wallet;
  const selectedWallet = walletId
    ? wallets.find((wallet) => wallet.id === walletId)
    : null;
  response.scope = {
    id: walletId || "all",
    walletOnly: Boolean(walletId),
    walletName: selectedWallet?.name || null,
    onChainValueUsd: scopedWallet.trackedEthereumValueUsd,
    manualValueUsd: walletId
      ? (manualSummary.walletSummaries.get(walletId)?.manualValueUsd || 0)
      : response.wallet.manualValueUsd,
    walletValueUsd: portfolioTotalUsd,
    totalValueUsd: portfolioTotalUsd,
    trackedAssets: scopedWallet.trackedAssets,
    pricedAssets: scopedWallet.pricedTrackedAssets,
    unpricedAssets: scopedWallet.unpricedTrackedAssets,
    manualAssets: walletId
      ? (manualSummary.walletSummaries.get(walletId)?.manualAssets || 0)
      : response.wallet.manualAssets,
    unassignedManual: walletId ? null : manualSummary.unassigned,
    message: walletId ? "Wallet view includes on-chain and assigned manual assets." : null
  };

  if (
    createSnapshot &&
    !walletId &&
    (
      response.priceSource === "coingecko-live" ||
      response.priceSource === "cache" ||
      response.priceSource === "coinmarketcap-live"
    ) &&
    portfolioTotalUsd > 0
  ) {
    await upsertDailySnapshot(
      portfolioTotalUsd,
      pricedAssets.map((asset) => ({
        id: asset.id,
        symbol: asset.symbol,
        totalUsd: asset.totalPerCoinUsd
      }))
    );
  }

  return {
    portfolio,
    walletState,
    response
  };
}

app.get("/api/wallet", async (_req, res) => {
  try {
    const { response } = await loadPortfolioData({ createSnapshot: false });
    res.json(response.wallet);
  } catch (_error) {
    res.status(500).json({ error: "Failed to load wallet data" });
  }
});

app.get("/api/wallets", async (_req, res) => {
  try {
    res.json(await readWallets());
  } catch (_error) {
    res.status(500).json({ error: "Failed to load wallets" });
  }
});

app.post("/api/wallets", async (req, res) => {
  try {
    const wallet = await createWallet(req.body);
    const { response } = await loadPortfolioData({ createSnapshot: false });
    res.status(201).json({ wallet, portfolio: response });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch("/api/wallets/:id", async (req, res) => {
  try {
    const wallet = await updateWallet(req.params.id, req.body);
    if (!wallet) return res.status(404).json({ error: "wallet not found" });
    const { response } = await loadPortfolioData({ createSnapshot: false });
    res.json({ wallet, portfolio: response });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/wallets/:id", async (req, res) => {
  try {
    const currentPortfolio = await readPortfolio();
    const deleted = await deleteWallet(req.params.id);
    if (!deleted) return res.status(404).json({ error: "wallet not found" });
    const reassigned = unassignManualPositionsForWallet(currentPortfolio, req.params.id);
    if (reassigned.changed) await writePortfolio(reassigned.portfolio);
    const { response } = await loadPortfolioData({ createSnapshot: false });
    res.json({ removed: true, manualPositionsUnassigned: reassigned.changed, portfolio: response });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

async function respondAfterWalletSync(res, syncResult) {
  const { response } = await loadPortfolioData({
    createSnapshot: syncResult.errors.length === 0
  });
  res.status(syncResult.errors.length ? 207 : 200).json({
    message: syncResult.errors.length ? "Wallet sync completed with errors" : "Wallet synced",
    partial: syncResult.errors.length > 0,
    errors: syncResult.errors,
    portfolio: response,
    wallet: response.wallet
  });
}

app.post("/api/wallet/sync", async (_req, res) => {
  try {
    await respondAfterWalletSync(res, await syncWallet());
  } catch (error) {
    try {
      const { response } = await loadPortfolioData({ createSnapshot: false });
      return res.status(502).json({
        error: error.message,
        wallet: response.wallet
      });
    } catch (_readError) {
      return res.status(502).json({ error: error.message });
    }
  }
});

app.post("/api/wallets/:id/sync", async (req, res) => {
  try {
    await respondAfterWalletSync(res, await syncWallet({ walletId: req.params.id }));
  } catch (error) {
    try {
      const { response } = await loadPortfolioData({ createSnapshot: false });
      return res.status(error.message === "wallet not found" ? 404 : 502).json({
        error: error.message,
        wallet: response.wallet
      });
    } catch (_readError) {
      return res.status(502).json({ error: error.message });
    }
  }
});

app.put("/api/wallet/mapping", async (req, res) => {
  void req;
  res.status(410).json({
    error: "Use explicit Track or Stop tracking actions"
  });
});

app.post("/api/wallet/track", async (req, res) => {
  let createdAsset = null;
  let trackingApplied = false;

  try {
    let portfolio = await readPortfolio();
    let portfolioAssetId = String(req.body.portfolioAssetId || "");
    const creatingNewAsset = !portfolioAssetId && Boolean(req.body.newPortfolioAsset);
    const [walletState, wallets] = await Promise.all([readWalletState(), readWallets()]);
    const walletAsset = aggregateWalletAssets(walletState, wallets).assets.find(
      (asset) => asset.id === String(req.body.walletAssetId || "")
    );
    let selectedPortfolioAsset = portfolio.find((asset) => asset.id === portfolioAssetId) || null;

    if (!walletAsset) {
      throw new Error("wallet asset not found");
    }

    if (creatingNewAsset) {
      selectedPortfolioAsset = normalizeAssetInput({
        ...req.body.newPortfolioAsset,
        amount: 0
      });
      portfolioAssetId = selectedPortfolioAsset.id;
    }

    if (!selectedPortfolioAsset) {
      throw new Error("portfolio asset not found");
    }

    const contractResult = await getEthereumContractMetadataForAssets([
      selectedPortfolioAsset
    ]);
    const verification = assertTrackConfirmation(
      walletAsset,
      selectedPortfolioAsset,
      contractResult.contractsByAssetId[selectedPortfolioAsset.id] || null,
      req.body.advancedConfirmation
    );

    if (creatingNewAsset) {
      createdAsset = await addAsset({
        ...req.body.newPortfolioAsset,
        amount: 0
      });
      portfolioAssetId = createdAsset.id;
      portfolio = await readPortfolio();
    }

    await trackWalletAsset(
      {
        walletAssetId: req.body.walletAssetId,
        portfolioAssetId
      },
      portfolio
    );
    trackingApplied = true;
    const { response } = await loadPortfolioData({ createSnapshot: true });
    res.json({
      message: "Ethereum asset tracked",
      portfolio: response,
      wallet: response.wallet,
      verification
    });
  } catch (error) {
    if (createdAsset && !trackingApplied) {
      await deleteAsset(createdAsset.id).catch(() => {});
    }
    res.status(error.code === "ADVANCED_TRACK_REQUIRED" ? 409 : 400).json({
      error: error.message,
      verification: error.verification || null
    });
  }
});

app.post("/api/wallet/stop-tracking", async (req, res) => {
  try {
    await stopTrackingWalletAsset(req.body.walletAssetId);
    const { response } = await loadPortfolioData({ createSnapshot: true });
    res.json({
      message: "Ethereum asset tracking stopped",
      portfolio: response,
      wallet: response.wallet
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/search", async (req, res) => {
  const cmcSearch = await searchCoinMarketCapCoins(req.query.query);

  if (cmcSearch.coins.length || !cmcSearch.error) {
    return res.json(cmcSearch);
  }

  const { coins, error } = await searchCoins(req.query.query);

  res.json({
    coins,
    error
  });
});

app.get("/api/export/portfolio.json", async (_req, res) => {
  try {
    const portfolio = await readPortfolio();
    const exportPackage = {
      version: 4,
      exportedAt: new Date().toISOString(),
      portfolio
    };
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", 'attachment; filename="portfolio.json"');
    res.send(`${JSON.stringify(exportPackage, null, 2)}\n`);
  } catch (_error) {
    res.status(500).json({ error: "Failed to export portfolio" });
  }
});

app.get("/api/export/portfolio.csv", async (_req, res) => {
  try {
    const { response } = await loadPortfolioData({ createSnapshot: false });
    const assets = response.assets;
    const headers = [
      "name",
      "symbol",
      "manualAmount",
      "walletAmount",
      "effectiveAmount",
      "accountingSource",
      "walletMode",
      "currentPriceUsd",
      "totalPerCoinUsd",
      "change24h",
      "change7d",
      "change30d"
    ];
    const csv = rowsToCsv(headers, assets);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="portfolio.csv"');
    res.send(`${csv}\n`);
  } catch (_error) {
    res.status(500).json({ error: "Failed to export portfolio CSV" });
  }
});

app.get("/api/export/history.csv", async (_req, res) => {
  try {
    const history = await getRecentHistory();
    const headers = ["date", "totalUsd", "assetsCount"];
    const rows = history.map((snapshot) => ({
      date: snapshot.date,
      totalUsd: snapshot.totalUsd,
      assetsCount: snapshot.assets.length
    }));
    const csv = rowsToCsv(headers, rows);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="history.csv"');
    res.send(`${csv}\n`);
  } catch (_error) {
    res.status(500).json({ error: "Failed to export history CSV" });
  }
});

app.post("/api/import/portfolio", async (req, res) => {
  try {
    const imported = parsePortfolioImport(req.body);
    const [currentPortfolio, currentWallet, currentWallets] = await Promise.all([
      readPortfolio(),
      readWalletState(),
      readWallets()
    ]);
    const importedPortfolioIds = new Set(imported.portfolio.map((asset) => asset.id));
    const legacyWallet = {
      ...currentWallet,
      mappings: currentWallet.mappings.filter((mapping) =>
        importedPortfolioIds.has(mapping.portfolioAssetId)
      )
    };

    await backupDataBeforeImport(currentPortfolio, currentWallet, currentWallets);
    await writePortfolio(imported.portfolio);
    await writeWalletState(legacyWallet);
    res.json({
      message: "Portfolio imported",
      assetsCount: imported.portfolio.length,
      format: imported.format
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/backup", async (_req, res) => {
  try {
    const files = await createManualBackup();
    res.json({ files });
  } catch (_error) {
    res.status(500).json({ error: "Failed to create backup" });
  }
});

app.post("/api/portfolio", async (req, res) => {
  try {
    assertManualWalletReference(req.body.walletId, await readWallets());
    const asset = await addAsset(req.body);
    res.status(201).json(asset);
  } catch (error) {
    if (error.message === "asset already exists") {
      const [portfolio, requestedAsset] = await Promise.all([
        readPortfolio(),
        Promise.resolve(normalizeAssetInput(req.body))
      ]);
      const existing = portfolio.find(
        (asset) => asset.id === requestedAsset.id || asset.coingeckoId === requestedAsset.coingeckoId
      );
      const unassignedAmount = existing
        ? getManualPositions(existing).find((position) => position.walletId === null)?.amount || 0
        : 0;
      return res.status(409).json({
        error: "asset already exists",
        code: unassignedAmount > 0 ? "MANUAL_ASSIGNMENT_AVAILABLE" : "ASSET_ALREADY_ASSIGNED",
        asset: existing
          ? { id: existing.id, name: existing.name, symbol: existing.symbol, unassignedAmount }
          : null
      });
    }
    res.status(400).json({ error: error.message });
  }
});

async function assertManualPortfolioActionAllowed(portfolioAssetId) {
  const walletState = await readWalletState();
  const mapping = walletState.mappings.find(
    (candidate) => candidate.portfolioAssetId === portfolioAssetId
  );

  if (mapping && isTrackedMapping(mapping)) {
    throw new Error("Stop Ethereum tracking before changing the manual amount");
  }

  if (mapping?.status === "stopped") {
    throw new Error("This asset is stopped and excluded from the portfolio");
  }
}

app.patch("/api/portfolio/:id", async (req, res) => {
  try {
    await assertManualPortfolioActionAllowed(req.params.id);
    assertManualWalletReference(req.body.walletId, await readWallets());
    const asset = await updateAssetAmount(req.params.id, req.body.amount, req.body.walletId);

    if (!asset) {
      return res.status(404).json({ error: "asset not found" });
    }

    res.json(asset);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/portfolio/:id/add-buy", async (req, res) => {
  try {
    await assertManualPortfolioActionAllowed(req.params.id);
    assertManualWalletReference(req.body.walletId, await readWallets());
    const asset = await addBuy(req.params.id, req.body.amount, req.body.walletId);

    if (!asset) {
      return res.status(404).json({ error: "asset not found" });
    }

    res.json(asset);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/portfolio/:id/move", async (req, res) => {
  try {
    await assertManualPortfolioActionAllowed(req.params.id);
    const wallets = await readWallets();
    assertManualWalletReference(req.body.fromWalletId, wallets);
    assertManualWalletReference(req.body.toWalletId, wallets);
    const asset = await moveManualPosition(
      req.params.id,
      req.body.fromWalletId,
      req.body.toWalletId,
      req.body.amount
    );

    if (!asset) return res.status(404).json({ error: "asset not found" });
    res.json(asset);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/portfolio/:id/assign-unassigned", async (req, res) => {
  try {
    await assertManualPortfolioActionAllowed(req.params.id);
    assertManualWalletReference(req.body.walletId, await readWallets());
    if (req.body.walletId == null || req.body.walletId === "") {
      throw new Error("a destination wallet is required");
    }
    const asset = await assignUnassignedManualPositionById(
      req.params.id,
      req.body.walletId,
      req.body.amount
    );
    if (!asset) return res.status(404).json({ error: "asset not found" });
    res.json(asset);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/portfolio/:id", async (req, res) => {
  try {
    await assertManualPortfolioActionAllowed(req.params.id);
    const deleted = await deleteAsset(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: "asset not found" });
    }

    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.use((error, _req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ error: "invalid JSON body" });
  }

  next(error);
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

if (require.main === module) {
  app.listen(port, "127.0.0.1", () => {
    console.log(`Crypto Portfolio is running at http://127.0.0.1:${port}`);
  });
}

module.exports = {
  app,
  apiRequestDenialReason,
  buildPortfolioResponse,
  applyManualWalletScope,
  buildManualWalletSummary,
  isAllowedHost,
  requestedWalletId
};
