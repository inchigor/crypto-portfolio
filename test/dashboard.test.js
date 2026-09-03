const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const { portfolioPerformanceForRange, t } = require("../public/ui");
const {
  apiRequestDenialReason,
  app,
  buildPortfolioResponse,
  requestedWalletId
} = require("../server/index");

function requestApp(server, { method = "GET", path: requestPath = "/", headers = {} } = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port,
      method,
      path: requestPath,
      headers
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response));
    });
    request.on("error", reject);
    request.end();
  });
}

function priceResult(pricesById) {
  return {
    pricesById,
    updatedAt: "2026-01-01T00:00:00.000Z",
    error: null,
    priceSource: "cache",
    priceWarning: null
  };
}

test("top portfolio performance uses current-composition price weighting", () => {
  const portfolio = [
    { id: "one", name: "One", symbol: "ONE", coingeckoId: "one", amount: 1 },
    { id: "two", name: "Two", symbol: "TWO", coingeckoId: "two", amount: 1 }
  ];
  const { response } = buildPortfolioResponse(portfolio, priceResult({
    one: { currentPriceUsd: 100, change24h: 10, change7d: 20, change30d: 30 },
    two: { currentPriceUsd: 300, change24h: -2, change7d: 4, change30d: 8 }
  }));

  assert.equal(response.totals.change24h, 1);
  assert.equal(response.totals.change7d, 8);
  assert.equal(response.totals.change30d, 13.5);
  assert.equal(portfolioPerformanceForRange(response.totals, "24h"), 1);
});

test("performance range maps 24h, 7d and 30d to the matching weighted change", () => {
  const totals = { change24h: 1.25, change7d: -2.5, change30d: 9.75 };
  assert.equal(portfolioPerformanceForRange(totals, "24h"), 1.25);
  assert.equal(portfolioPerformanceForRange(totals, "7d"), -2.5);
  assert.equal(portfolioPerformanceForRange(totals, "30d"), 9.75);
  assert.equal(portfolioPerformanceForRange(totals, "all"), 1.25);
});

test("composition snapshots cannot be rendered as portfolio performance", () => {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(appSource, /portfolioPerformanceForRange\(totals, selectedDeltaRange\)/);
  assert.doesNotMatch(appSource, /function renderPortfolioDelta/);
  assert.doesNotMatch(appSource, /findComparisonSnapshot/);
});

test("dashboard keeps only portfolio, prices and Ethereum summary cards", () => {
  const indexSource = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const styleSource = fs.readFileSync(path.join(__dirname, "..", "public", "style.css"), "utf8");

  assert.doesNotMatch(indexSource, /Portfolio performance/);
  assert.doesNotMatch(indexSource, /portfolioChange24h/);
  assert.doesNotMatch(indexSource, /Asset count/);
  assert.doesNotMatch(indexSource, /id="assetCount"/);
  assert.match(indexSource, /class="stat-card price-card"/);
  assert.match(indexSource, /id="priceProvider"/);
  assert.match(indexSource, /id="priceUpdated"/);
  assert.doesNotMatch(indexSource, /Price update/);
  assert.doesNotMatch(indexSource, /Price source/);
  assert.match(indexSource, /title="Refresh prices" aria-label="Refresh prices">Prices/);
  assert.match(indexSource, /title="Sync Ethereum wallet data" aria-label="Sync Ethereum wallet data">Sync/);
  assert.match(indexSource, /title="Manage Ethereum assets" aria-label="Manage Ethereum assets">Assets/);
  assert.match(appSource, /Stop tracking Ethereum asset/);
  assert.match(appSource, /title="Save amount" aria-label="Save amount"/);
  assert.match(appSource, /title="Add purchase" aria-label="Add purchase"/);
  assert.match(appSource, /target\.classList\.contains\("add-buy-button"\)/);
  assert.match(appSource, /t\("disconnect"\)/);
  assert.match(appSource, /t\("saveCompact"\)/);
  assert.match(appSource, /t\("addBuyCompact"\)/);
  assert.equal(t("disconnect"), "Stop");
  assert.equal(t("saveCompact"), "Save");
  assert.equal(t("addBuyCompact"), "+");
  assert.match(appSource, /function formatPriceUpdatedAt/);
  assert.match(appSource, /Price source: \$\{fullPriceSource\}/);
  assert.match(appSource, /Last price update: \$\{fullUpdatedAt\}/);
  assert.match(styleSource, /body\s*{\s*margin: 0;\s*font-size: 14px;/);
  assert.match(styleSource, /\.page\s*{[\s\S]*padding: 26px 0 38px;/);
  assert.match(styleSource, /\.stat-card\s*{[\s\S]*min-height: 96px;[\s\S]*padding: 14px;/);
  assert.match(styleSource, /\.price-card \.price-provider\s*{\s*font-size: 18px;/);
  assert.match(styleSource, /\.action-cell\s*{\s*min-width: 126px;/);
  assert.doesNotMatch(styleSource, /\.action-cell\s*{\s*min-width: 244px;/);
  assert.match(styleSource, /\.allocation-list\s*{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(styleSource, /\.allocation-column\s*{\s*display: grid;/);
  assert.match(styleSource, /@media \(max-width: 960px\)[\s\S]*\.allocation-list[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
  const allocationStyles = styleSource.slice(
    styleSource.indexOf(".allocation-list"),
    styleSource.indexOf(".history-chart")
  );
  assert.doesNotMatch(allocationStyles, /grid-auto-flow/);
  assert.match(styleSource, /@media \(max-width: 600px\)[\s\S]*td\.action-cell[\s\S]*position: sticky/);
});

test("history chart controls, tooltip and manual entry placement keep the dashboard focused", () => {
  const indexSource = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const styleSource = fs.readFileSync(path.join(__dirname, "..", "public", "style.css"), "utf8");

  assert.match(indexSource, /id="historyPeriodControls"/);
  assert.ok(indexSource.indexOf("Portfolio history") < indexSource.indexOf("<h2>Portfolio</h2>"));
  assert.ok(indexSource.indexOf("<h2>Portfolio</h2>") < indexSource.indexOf("Add or assign asset"));
  assert.ok(indexSource.indexOf("Add or assign asset") < indexSource.indexOf('id="walletsHeading"'));
  assert.ok(indexSource.indexOf('id="walletsHeading"') < indexSource.indexOf("Backups and export"));
  assert.ok(indexSource.indexOf('id="assetForm"') < indexSource.indexOf('id="errorBanner"'));
  assert.ok(indexSource.indexOf('id="errorBanner"') < indexSource.indexOf('id="selectedCoinLabel"'));
  assert.match(appSource, /availableHistoryPeriods\(history\)/);
  assert.match(appSource, /selectHistoryPeriod\(history, selectedHistoryPeriod\)/);
  assert.match(appSource, /chart-grid-line/);
  assert.match(appSource, /niceChartTicks\(minValue, maxValue\)/);
  assert.match(appSource, /formatUsdWhole\(tick.value\)/);
  assert.match(appSource, /maxLabels = window\.matchMedia\("\(max-width: 600px\)"\)\.matches \? 4 : 9/);
  assert.match(appSource, /chart-point/);
  assert.match(appSource, /chart-extreme-\$\{kind\}/);
  assert.match(appSource, /history-tooltip/);
  assert.match(appSource, /compactDesktopChart \? 248 : 286/);
  assert.match(styleSource, /\.chart-grid-line/);
  assert.match(styleSource, /\.chart-point/);
  assert.match(styleSource, /\.amount-input\s*{\s*width: 110px;\s*min-width: 110px;\s*height: 34px;/);
  assert.doesNotMatch(appSource, /manual-holding-select/);
  assert.match(appSource, /move-position-button/);
  assert.match(styleSource, /\.chart-extreme-min/);
  assert.match(styleSource, /\.chart-extreme-max/);
  assert.match(styleSource, /\.history-tooltip/);
  assert.match(styleSource, /\.history-chart\s*{\s*position: relative;\s*min-height: 248px;/);
  assert.match(styleSource, /@media \(max-width: 760px\)[\s\S]*\.history-chart\s*{\s*min-height: 286px;/);
  assert.match(styleSource, /@media \(max-width: 760px\)[\s\S]*\.wallet-scope-control\s*{\s*width: 100%;\s*grid-column: 1 \/ -1;/);
});

test("portfolio table defaults to persisted value sorting and exposes sortable asset weight", () => {
  const indexSource = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

  assert.match(indexSource, /data-sort-key="assetWeightPercent" data-sort-label="Weight"/);
  assert.match(appSource, /key: sortableKeys\.has\(storedSortKey\) \? storedSortKey : "totalPerCoinUsd"/);
  assert.match(appSource, /: "desc"/);
  assert.match(appSource, /localStorage\.setItem\("cryptoPortfolio\.sortKey", sortState\.key\)/);
  assert.match(appSource, /localStorage\.setItem\("cryptoPortfolio\.sortDirection", sortState\.direction\)/);
  assert.match(appSource, /textSortKeys\.has\(nextKey\) \? "asc" : "desc"/);
  assert.match(appSource, /assetWeightPercent:/);
  assert.match(appSource, /getSortedAssets\(getVisibleAssets\(assetsWithWeight\)\)/);
  assert.match(appSource, /asset\.assetWeightPercent\.toFixed\(1\)/);
  assert.match(appSource, /button\.textContent = `\$\{button\.dataset\.sortLabel\}/);
});

test("deprecated navigation, requests and API routes are absent", () => {
  const indexSource = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server", "index.js"), "utf8");
  const removedModule = "acti" + "vity";
  const removedRoute = "/api/" + removedModule;

  assert.doesNotMatch(indexSource, new RegExp(`Operations|${removedModule}View|sync${removedModule[0].toUpperCase()}${removedModule.slice(1)}Button`));
  assert.equal(appSource.includes(removedRoute), false);
  assert.equal(appSource.includes(`load${removedModule[0].toUpperCase()}${removedModule.slice(1)}`), false);
  assert.equal(serverSource.includes(removedRoute), false);
  assert.equal(serverSource.includes(`./${removedModule}`), false);
  assert.match(serverSource, /app\.use\("\/api", \(_req, res\) => \{/);
});

test("public candidate security controls protect local API requests and exports", async () => {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server", "index.js"), "utf8");
  const pricesSource = fs.readFileSync(path.join(__dirname, "..", "server", "prices.js"), "utf8");

  assert.match(serverSource, /Content-Security-Policy/);
  assert.match(serverSource, /express\.json\(\{ limit: "1mb" \}\)/);
  assert.equal(app.get("query parser"), "simple");
  assert.equal(requestedWalletId({ query: { wallet: "wallet-one" } }), "wallet-one");
  assert.equal(requestedWalletId({ query: { wallet: "all" } }), null);
  assert.match(serverSource, /Sec-Fetch-Site/);
  assert.match(serverSource, /isAllowedHost/);
  assert.match(serverSource, /\^\\s\*\[=\+\\-@\]/);
  assert.doesNotMatch(pricesSource, /KeyLength/);
  assert.match(appSource, /<strong>\$\{escapeHtml\(coin\.name\)\}<\/strong>/);
  assert.match(appSource, /<span>\$\{escapeHtml\(coin\.symbol\)\}<\/span>/);

  const sameOriginRequest = {
    get(name) {
      return { "Sec-Fetch-Site": "same-origin", Origin: "http://127.0.0.1:3002", Host: "127.0.0.1:3002" }[name];
    }
  };
  const curlLikeRequest = { get: () => undefined };
  assert.equal(apiRequestDenialReason(sameOriginRequest), null);
  assert.equal(apiRequestDenialReason(curlLikeRequest), null);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const allowedLoopback = await requestApp(server, {
      headers: { Host: "127.0.0.1:3002" }
    });
    const allowedLocalhost = await requestApp(server, {
      headers: { Host: "localhost:3002" }
    });
    const crossSiteGet = await requestApp(server, {
      path: "/api/health/providers",
      headers: { Host: "127.0.0.1:3002", "Sec-Fetch-Site": "cross-site" }
    });
    const crossSitePost = await requestApp(server, {
      method: "POST",
      path: "/api/health/providers",
      headers: { Host: "127.0.0.1:3002", "Sec-Fetch-Site": "cross-site" }
    });
    const invalidHost = await requestApp(server, {
      headers: { Host: "untrusted.example:3002" }
    });

    assert.equal(allowedLoopback.statusCode, 200);
    assert.equal(allowedLocalhost.statusCode, 200);
    assert.equal(crossSiteGet.statusCode, 403);
    assert.equal(crossSitePost.statusCode, 403);
    assert.equal(invalidHost.statusCode, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("wallet UI and API expose multi-wallet controls without exporting addresses", () => {
  const indexSource = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const styleSource = fs.readFileSync(path.join(__dirname, "..", "public", "style.css"), "utf8");
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server", "index.js"), "utf8");
  const backupSource = fs.readFileSync(path.join(__dirname, "..", "server", "backup.js"), "utf8");

  assert.match(indexSource, /id="walletForm"/);
  assert.match(indexSource, /id="walletNameInput"/);
  assert.match(indexSource, /id="walletTypeInput"/);
  assert.match(indexSource, /value="manual">Manual/);
  assert.match(indexSource, /id="walletChainInput"/);
  assert.match(indexSource, /id="walletAddressInput"/);
  assert.match(indexSource, /id="walletsList"/);
  assert.match(indexSource, /id="walletsCollapseButton"/);
  assert.match(indexSource, /id="walletsContent"/);
  assert.match(indexSource, /id="walletsCount"/);
  assert.match(indexSource, /id="walletScopeSelect"/);
  assert.match(indexSource, /id="walletScopeNote"/);
  assert.match(indexSource, /id="historyScopeNote"/);
  assert.match(indexSource, /id="manualAssetPanel"/);
  assert.match(appSource, /function walletSourceBadge/);
  assert.match(appSource, /Automatic · Ethereum · \$\{formatWalletCount\(breakdown\.length\)\}/);
  assert.match(appSource, /walletBreakdownTitle/);
  assert.match(appSource, /fetch\("\/api\/wallets"/);
  assert.match(appSource, /portfolioWalletScope/);
  assert.match(serverSource, /Wallet view includes on-chain and assigned manual assets/);
  assert.match(appSource, /wallet-view-button/);
  assert.match(appSource, /wallet-sync-button/);
  assert.match(appSource, /wallet-menu-button/);
  assert.match(appSource, /wallet-overflow-menu/);
  assert.match(appSource, /cryptoPortfolio\.walletsCollapsed/);
  assert.match(appSource, /function updateWalletsCollapse/);
  assert.match(appSource, /wallet\.type === "evm"/);
  assert.match(appSource, /function updateWalletTypeFields/);
  assert.match(appSource, /Rename/);
  assert.match(appSource, /Disable/);
  assert.match(appSource, /Delete/);
  assert.match(indexSource, /Wallets/);
  assert.match(indexSource, /Logical storage locations and Ethereum\/EVM connections/);
  assert.match(indexSource, /Show small and zero balances/);
  assert.match(indexSource, /Value change for the selected period/);
  assert.match(appSource, /showTinyAssets/);
  assert.match(appSource, /function isTinyOrZeroAsset/);
  assert.match(appSource, /allocationLimit = 12/);
  assert.match(appSource, /Show all/);
  assert.match(appSource, /Other/);
  assert.match(styleSource, /\.wallet-list-row/);
  assert.match(styleSource, /\.wallet-overflow-menu/);
  assert.match(styleSource, /\.page \{[\s\S]*width: min\(1560px, calc\(100% - 48px\)\)/);
  assert.match(styleSource, /@media \(min-width: 1100px\)[\s\S]*\.action-cell/);
  assert.match(styleSource, /@media \(max-width: 960px\)[\s\S]*\.page \{/);
  assert.match(styleSource, /\.wallet-scope-control select[\s\S]*border-radius: 999px/);
  assert.match(styleSource, /@media \(max-width: 600px\)[\s\S]*\.wallet-list-row/);
  assert.match(serverSource, /app\.get\("\/api\/wallets"/);
  assert.match(serverSource, /app\.post\("\/api\/wallets"/);
  assert.match(serverSource, /app\.patch\("\/api\/wallets\/:id"/);
  assert.match(serverSource, /app\.delete\("\/api\/wallets\/:id"/);
  assert.match(serverSource, /app\.post\("\/api\/wallets\/:id\/sync"/);
  assert.match(serverSource, /selectWalletScope/);
  assert.match(serverSource, /version: 4,[\s\S]*portfolio/);
  assert.doesNotMatch(serverSource, /portfolio,\s*wallet\s*\n\s*}\s*;/);
  assert.match(backupSource, /wallets-\$\{timestamp\}\.json/);
});
