const portfolioBody = document.getElementById("portfolioBody");
const portfolioTotal = document.getElementById("portfolioTotal");
const portfolioDelta = document.getElementById("portfolioDelta");
const deltaRangeSelect = document.getElementById("deltaRangeSelect");
const priceProvider = document.getElementById("priceProvider");
const priceUpdated = document.getElementById("priceUpdated");
const priceWarning = document.getElementById("priceWarning");
const assetForm = document.getElementById("assetForm");
const refreshButton = document.getElementById("refreshButton");
const syncWalletButton = document.getElementById("syncWalletButton");
const walletValue = document.getElementById("walletValue");
const walletValueMeta = document.getElementById("walletValueMeta");
const walletWarning = document.getElementById("walletWarning");
const walletAddressLink = document.getElementById("walletAddressLink");
const walletStatus = document.getElementById("walletStatus");
const walletLastSync = document.getElementById("walletLastSync");
const walletTrackedCount = document.getElementById("walletTrackedCount");
const walletPricingCount = document.getElementById("walletPricingCount");
const manageWalletButton = document.getElementById("manageWalletButton");
const walletForm = document.getElementById("walletForm");
const walletNameInput = document.getElementById("walletNameInput");
const walletAddressInput = document.getElementById("walletAddressInput");
const walletTypeInput = document.getElementById("walletTypeInput");
const walletChainInput = document.getElementById("walletChainInput");
const walletAddressField = document.getElementById("walletAddressField");
const walletChainField = document.getElementById("walletChainField");
const walletsList = document.getElementById("walletsList");
const walletsMessage = document.getElementById("walletsMessage");
const walletsContent = document.getElementById("walletsContent");
const walletsCount = document.getElementById("walletsCount");
const walletsCollapseButton = document.getElementById("walletsCollapseButton");
const walletScopeSelect = document.getElementById("walletScopeSelect");
const walletScopeNote = document.getElementById("walletScopeNote");
const historyScopeNote = document.getElementById("historyScopeNote");
const manualAssetPanel = document.getElementById("manualAssetPanel");
const manualWalletSelect = document.getElementById("manualWalletSelect");
const walletManagerDialog = document.getElementById("walletManagerDialog");
const closeWalletManagerButton = document.getElementById("closeWalletManagerButton");
const trackedAssetCount = document.getElementById("trackedAssetCount");
const trackedAssetsList = document.getElementById("trackedAssetsList");
const suggestedAssetCount = document.getElementById("suggestedAssetCount");
const suggestedAssetsList = document.getElementById("suggestedAssetsList");
const otherDiscoveredTokenCount = document.getElementById("otherDiscoveredTokenCount");
const otherDiscoveredTokensList = document.getElementById("otherDiscoveredTokensList");
const discoveredTokenSearch = document.getElementById("discoveredTokenSearch");
const trackAssetDialog = document.getElementById("trackAssetDialog");
const closeTrackDialogButton = document.getElementById("closeTrackDialogButton");
const cancelTrackButton = document.getElementById("cancelTrackButton");
const trackAssetIdentity = document.getElementById("trackAssetIdentity");
const trackPortfolioAssetSelect = document.getElementById("trackPortfolioAssetSelect");
const trackPriceSearch = document.getElementById("trackPriceSearch");
const trackSearchResults = document.getElementById("trackSearchResults");
const trackSelection = document.getElementById("trackSelection");
const trackVerificationWarning = document.getElementById("trackVerificationWarning");
const advancedTrackConfirmationLabel = document.getElementById("advancedTrackConfirmationLabel");
const advancedTrackConfirmation = document.getElementById("advancedTrackConfirmation");
const trackError = document.getElementById("trackError");
const confirmTrackButton = document.getElementById("confirmTrackButton");
const errorBanner = document.getElementById("errorBanner");
const allocationList = document.getElementById("allocationList");
const allocationToggleButton = document.getElementById("allocationToggleButton");
const showTinyAssetsToggle = document.getElementById("showTinyAssetsToggle");
const historyChart = document.getElementById("historyChart");
const historyPeriodControls = document.getElementById("historyPeriodControls");
const exportPortfolioJsonButton = document.getElementById("exportPortfolioJsonButton");
const importPortfolioButton = document.getElementById("importPortfolioButton");
const importPortfolioInput = document.getElementById("importPortfolioInput");
const exportPortfolioCsvButton = document.getElementById("exportPortfolioCsvButton");
const exportHistoryCsvButton = document.getElementById("exportHistoryCsvButton");
const backupNowButton = document.getElementById("backupNowButton");
const utilityMessage = document.getElementById("utilityMessage");
const themeSelect = document.getElementById("themeSelect");
const coinSearchInput = document.getElementById("coinSearchInput");
const quickAmountInput = document.getElementById("quickAmountInput");
const selectedCoinLabel = document.getElementById("selectedCoinLabel");
const assignmentPrompt = document.getElementById("assignmentPrompt");
const manualEntryToggle = document.getElementById("manualEntryToggle");
const manualEntryFields = document.getElementById("manualEntryFields");
const nameInput = document.getElementById("nameInput");
const symbolInput = document.getElementById("symbolInput");
const coingeckoIdInput = document.getElementById("coingeckoIdInput");
const cmcIdInput = document.getElementById("cmcIdInput");
const searchResults = document.getElementById("searchResults");
const searchHint = document.getElementById("searchHint");
const sortButtons = document.querySelectorAll(".sort-button");
const {
  t,
  formatDate: formatRussianDate,
  formatTokenAmount,
  formatWalletAmount,
  availableHistoryPeriods,
  selectHistoryPeriod,
  splitForColumns,
  niceChartTicks,
  portfolioPerformanceForRange
} = window.PortfolioUi;

let latestPortfolioData = null;
let latestHistoryData = [];
let selectedHistoryPeriod = "1M";
const sortableKeys = new Set([
  "name",
  "symbol",
  "amount",
  "currentPriceUsd",
  "totalPerCoinUsd",
  "assetWeightPercent",
  "change24h",
  "change7d",
  "change30d"
]);
const textSortKeys = new Set(["name", "symbol"]);
const storedSortKey = localStorage.getItem("cryptoPortfolio.sortKey");
const storedSortDirection = localStorage.getItem("cryptoPortfolio.sortDirection");
let sortState = {
  key: sortableKeys.has(storedSortKey) ? storedSortKey : "totalPerCoinUsd",
  direction: ["asc", "desc"].includes(storedSortDirection)
    ? storedSortDirection
    : "desc"
};
let searchTimeoutId = null;
let lastSearchRequestId = 0;
let selectedCoin = null;
let manualEntryMode = false;
let pendingTrackWalletAsset = null;
let selectedTrackCoin = null;
let currentTrackVerification = null;
let trackSearchTimeoutId = null;
let trackSearchRequestId = 0;
let selectedDeltaRange = ["24h", "7d", "30d"].includes(localStorage.getItem("portfolioDeltaRange"))
  ? localStorage.getItem("portfolioDeltaRange")
  : "24h";
let selectedWalletScope = localStorage.getItem("portfolioWalletScope") || "all";
let showTinyAssets = localStorage.getItem("showTinyAssets") === "true";
let allocationExpanded = false;
let configuredWallets = [];
let pendingAssignment = null;
let walletsCollapsed = localStorage.getItem("cryptoPortfolio.walletsCollapsed") === "true";
let walletsCollapseStateInitialized = localStorage.getItem("cryptoPortfolio.walletsCollapsed") !== null;

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

const usdWholeFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function formatUsd(value) {
  return typeof value === "number" ? usdFormatter.format(value) : "—";
}

function formatUsdWhole(value) {
  return typeof value === "number" ? usdWholeFormatter.format(value) : "—";
}

function formatPercent(value) {
  return typeof value === "number" ? `${value.toFixed(2)}%` : "—";
}

function percentClass(value) {
  if (typeof value !== "number") return "";
  return value >= 0 ? "positive" : "negative";
}

function formatDate(value) {
  return formatRussianDate(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortAddress(value) {
  if (!value) return "—";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function pluralizeEnglish(value, one, few, many) {
  const count = Math.abs(Number(value)) % 100;
  const lastDigit = count % 10;
  if (count > 10 && count < 20) return many;
  if (lastDigit > 1 && lastDigit < 5) return few;
  if (lastDigit === 1) return one;
  return many;
}

function formatWalletCount(value) {
  return `${value} ${value === 1 ? "wallet" : "wallets"}`;
}

function formatAssetCount(value) {
  return `${value} ${value === 1 ? "asset" : "assets"}`;
}

function walletBreakdownTitle(asset) {
  const breakdown = Array.isArray(asset.walletBreakdown) ? asset.walletBreakdown : [];
  return breakdown
    .map((entry) => `${entry.walletName}: ${entry.normalizedBalance} ${asset.symbol}`)
    .join("\n");
}

function walletSourceBadge(asset) {
  const breakdown = Array.isArray(asset.walletBreakdown) ? asset.walletBreakdown : [];
  const label = breakdown.length > 1
    ? `Automatic · Ethereum · ${formatWalletCount(breakdown.length)}`
    : breakdown.length === 1
      ? `Automatic · Ethereum · ${breakdown[0].walletName}`
      : t("ethereumWallet");
  const title = walletBreakdownTitle(asset);
  return `<span class="source-badge ethereum-source wallet-breakdown"${title ? ` title="${escapeHtml(title)}"` : ""}>${escapeHtml(label)}</span>`;
}

function getManualPositions(asset) {
  return Array.isArray(asset.manualPositions) && asset.manualPositions.length
    ? asset.manualPositions
    : [{ walletId: null, amount: asset.amount }];
}

function manualWalletName(walletId) {
  if (!walletId) return "Unassigned";
  return configuredWallets.find((wallet) => wallet.id === walletId)?.name || "Unassigned";
}

function manualWalletOptions(selectedWalletId) {
  return [
    `<option value=""${!selectedWalletId ? " selected" : ""}>Unassigned</option>`,
    ...configuredWallets.map((wallet) => `<option value="${escapeHtml(wallet.id)}"${wallet.id === selectedWalletId ? " selected" : ""}>${escapeHtml(wallet.name)}</option>`)
  ].join("");
}

function manualBreakdownTitle(asset) {
  return getManualPositions(asset)
    .map((position) => `${manualWalletName(position.walletId)}: ${position.amount} ${asset.symbol}`)
    .join("\n");
}

function selectedManualPosition(asset) {
  const positions = getManualPositions(asset);
  const preferredWalletId = selectedWalletScope !== "all" ? selectedWalletScope : null;
  return positions.find((position) => position.walletId === preferredWalletId) || positions[0];
}

function showWalletsMessage(message, type = "success") {
  walletsMessage.textContent = message || "";
  walletsMessage.dataset.type = type;
  walletsMessage.classList.toggle("hidden", !message);
}

function closeWalletActionMenus(except = null) {
  for (const menu of document.querySelectorAll(".wallet-overflow-menu")) {
    if (menu === except) continue;
    menu.classList.add("hidden");
    menu.previousElementSibling?.setAttribute("aria-expanded", "false");
  }
}

function renderWalletScopeSelector(wallet = {}, scope = {}) {
  const wallets = Array.isArray(wallet.wallets) ? wallet.wallets : [];
  configuredWallets = wallets;
  const options = [
    { id: "all", name: `All wallets · ${wallets.length}` },
    ...wallets.map((item) => ({ id: item.id, name: item.name }))
  ];
  const requestedId = scope.id || selectedWalletScope;
  selectedWalletScope = options.some((item) => item.id === requestedId) ? requestedId : "all";
  walletScopeSelect.innerHTML = options
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
    .join("");
  walletScopeSelect.value = selectedWalletScope;

  const walletOnly = Boolean(scope.walletOnly);
  const unassignedManual = scope.unassignedManual;
  walletScopeNote.textContent = walletOnly
    ? "This view shows the wallet's on-chain and assigned manual assets."
    : unassignedManual?.manualAssets
      ? `Unassigned: ${formatAssetCount(unassignedManual.manualAssets)} · ${formatUsd(unassignedManual.manualValueUsd)}`
      : "";
  walletScopeNote.classList.toggle("hidden", !walletOnly && !unassignedManual?.manualAssets);
  historyScopeNote.classList.toggle("hidden", !walletOnly);
  manualAssetPanel.classList.remove("hidden");

  const currentSelection = manualWalletSelect.value;
  manualWalletSelect.innerHTML = manualWalletOptions(currentSelection);
  if (currentSelection && configuredWallets.some((wallet) => wallet.id === currentSelection)) {
    manualWalletSelect.value = currentSelection;
  }
}

function renderWallets(wallets = [], walletSummary = {}, scope = {}) {
  updateWalletsCollapse(wallets);
  walletsList.innerHTML = "";

  if (!wallets.length) {
    walletsList.innerHTML = '<p class="muted-copy">No wallets have been added yet.</p>';
    return;
  }

  const summary = document.createElement("div");
  summary.className = "wallets-overview";
  summary.innerHTML = `
    <strong>All active wallets</strong>
    <span>${formatUsd(walletSummary.totalValueUsd ?? walletSummary.trackedEthereumValueUsd)}</span>
    <small>${formatWalletCount(walletSummary.enabledWallets || 0)} · ${walletSummary.uniqueAssets || 0} on-chain ${formatAssetCount(walletSummary.uniqueAssets || 0).replace(/^\d+\s/, "")}</small>
  `;
  walletsList.appendChild(summary);

  for (const wallet of wallets) {
    const row = document.createElement("article");
    const isEvm = wallet.type === "evm";
    const addressUrl = isEvm ? (wallet.addressUrl || `https://etherscan.io/address/${wallet.address}`) : null;
    row.className = "wallet-list-row";
    row.innerHTML = `
      <div class="wallet-list-name">
        <strong>${escapeHtml(wallet.name)}</strong>
        <small>${isEvm ? `On-chain ${formatUsd(wallet.onChainValueUsd ?? wallet.walletValueUsd)} · ` : ""}Manual ${formatUsd(wallet.manualValueUsd || 0)} · Total ${formatUsd(wallet.totalValueUsd ?? wallet.walletValueUsd)}</small>
      </div>
      ${isEvm ? `<a class="address-link wallet-list-address" href="${escapeHtml(addressUrl)}" target="_blank" rel="noreferrer" title="${escapeHtml(wallet.address)}">${escapeHtml(shortAddress(wallet.address))}</a>` : `<span class="wallet-list-address">Manual · ${escapeHtml(wallet.chain)}</span>`}
      <div class="wallet-list-sync">
        <span class="status-badge" data-status="${wallet.stale ? "stale" : wallet.lastSuccessfulSyncAt ? "synced" : "idle"}">${isEvm ? (wallet.stale ? "Sync error" : wallet.enabled ? "Enabled" : "Disabled") : "Manual"}</span>
        <small title="${escapeHtml(wallet.lastSuccessfulSyncAt || "Manual accounting")}">${isEvm && wallet.lastSuccessfulSyncAt ? `Updated ${escapeHtml(formatDate(wallet.lastSuccessfulSyncAt))}` : `${formatAssetCount(wallet.manualAssets || 0)} manually`}</small>
        ${wallet.stale && wallet.lastError ? `<small class="wallet-card-error" title="${escapeHtml(wallet.lastError)}">${escapeHtml(wallet.lastError)}</small>` : ""}
      </div>
      <div class="wallet-list-actions">
        <button type="button" class="wallet-view-button ghost-button" data-wallet-id="${escapeHtml(wallet.id)}" title="Open wallet assets" aria-label="Open wallet assets">Open</button>
        ${isEvm ? `<button type="button" class="wallet-sync-button ghost-button" data-wallet-id="${escapeHtml(wallet.id)}" title="Sync this wallet" aria-label="Sync this wallet">Sync</button>` : ""}
        <div class="wallet-more-actions">
          <button type="button" class="wallet-menu-button ghost-button" data-wallet-id="${escapeHtml(wallet.id)}" title="Other actions" aria-label="Other actions" aria-haspopup="menu" aria-expanded="false">⋯</button>
          <div class="wallet-overflow-menu hidden" role="menu">
            <button type="button" class="wallet-edit-button ghost-button" data-wallet-id="${escapeHtml(wallet.id)}" role="menuitem" title="Rename wallet" aria-label="Rename wallet">Rename</button>
            ${isEvm ? `<button type="button" class="wallet-toggle-button ghost-button" data-wallet-id="${escapeHtml(wallet.id)}" data-enabled="${wallet.enabled}" role="menuitem" title="${wallet.enabled ? "Disable wallet" : "Enable wallet"}" aria-label="${wallet.enabled ? "Disable wallet" : "Enable wallet"}">${wallet.enabled ? "Disable" : "Enable"}</button>` : ""}
            <button type="button" class="wallet-remove-button" data-wallet-id="${escapeHtml(wallet.id)}" data-wallet-name="${escapeHtml(wallet.name)}" role="menuitem" title="Delete wallet" aria-label="Delete wallet">Delete</button>
          </div>
        </div>
      </div>
    `;
    walletsList.appendChild(row);
  }
}

function updateWalletsCollapse(wallets = []) {
  const hasWallets = wallets.length > 0;
  if (!walletsCollapseStateInitialized) {
    walletsCollapsed = hasWallets;
    walletsCollapseStateInitialized = true;
  }

  if (!hasWallets) walletsCollapsed = false;

  walletsCount.textContent = hasWallets ? `· ${wallets.length}` : "";
  walletsContent.classList.toggle("hidden", walletsCollapsed);
  walletsCollapseButton.classList.toggle("hidden", !hasWallets);
  walletsCollapseButton.textContent = walletsCollapsed ? "Expand" : "Collapse";
  walletsCollapseButton.title = walletsCollapsed ? "Expand wallet controls" : "Collapse wallet controls";
  walletsCollapseButton.setAttribute("aria-label", walletsCollapseButton.title);
  walletsCollapseButton.setAttribute("aria-expanded", String(!walletsCollapsed));
}

function applyWalletMutationPortfolio(data) {
  if (data.portfolio) {
    if (selectedWalletScope !== "all") {
      void loadPortfolio({ loadHistoryData: false });
    } else {
      latestPortfolioData = data.portfolio;
      renderPortfolio(data.portfolio);
    }
  } else if (data.wallets) {
    renderWallets(data.wallets);
  }
}

async function addWallet(event) {
  event.preventDefault();
  showWalletsMessage("");
  const walletType = walletTypeInput.value;

  try {
    const response = await fetch("/api/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: walletNameInput.value, type: walletType, chain: walletType === "evm" ? "ethereum" : walletChainInput.value, address: walletType === "evm" ? walletAddressInput.value : null })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to add wallet");

    walletForm.reset();
    applyWalletMutationPortfolio(data);
    updateWalletTypeFields();
    showWalletsMessage(walletType === "evm" ? "Wallet added. Sync it to load balances." : "Manual wallet added.");
  } catch (error) {
    showWalletsMessage(error.message, "error");
  }
}

function updateWalletTypeFields() {
  const isEvm = walletTypeInput.value === "evm";
  walletAddressField.classList.toggle("hidden", !isEvm);
  walletChainField.classList.toggle("hidden", isEvm);
  walletAddressInput.required = isEvm;
}

async function updateConfiguredWallet(walletId, changes) {
  const response = await fetch(`/api/wallets/${encodeURIComponent(walletId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to update wallet");
  applyWalletMutationPortfolio(data);
}

async function removeConfiguredWallet(walletId, name) {
  if (!window.confirm(`Delete “${name}”? Manual assets will remain unchanged.`)) return;

  try {
    const response = await fetch(`/api/wallets/${encodeURIComponent(walletId)}`, {
      method: "DELETE"
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to delete wallet");
    applyWalletMutationPortfolio(data);
    showWalletsMessage("Wallet deleted. Manual assets remain unchanged.");
  } catch (error) {
    showWalletsMessage(error.message, "error");
  }
}

function formatTokenBalance(value) {
  return formatTokenAmount(value).display;
}

function formatWalletBalance(value) {
  return formatWalletAmount(value).display;
}

function formatPriceSource(value) {
  if (value === "coinmarketcap-live") return t("priceSourceCmc");
  if (value === "coingecko-live") return t("priceSourceCoingecko");
  if (value === "cache" || value === "stale-cache") return t("priceSourceCache");
  return t("priceSourceNone");
}

function formatPriceProvider(value) {
  if (value === "coinmarketcap-live") return "CoinMarketCap";
  if (value === "coingecko-live") return "CoinGecko";
  if (value === "cache" || value === "stale-cache") return "Cached";
  return t("priceSourceNone");
}

function formatPriceUpdatedAt(value) {
  const updatedAt = new Date(value);
  if (Number.isNaN(updatedAt.getTime())) return t("noData");

  const now = new Date();
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(updatedAt);
  const isToday = updatedAt.getFullYear() === now.getFullYear()
    && updatedAt.getMonth() === now.getMonth()
    && updatedAt.getDate() === now.getDate();

  if (isToday) return `Updated today, ${time}`;

  const date = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short"
  }).format(updatedAt).replace(/\.$/, "");
  return `${date}, ${time}`;
}

function localizeError(message) {
    const knownMessages = {
    "Failed to load portfolio": "Failed to load portfolio.",
    "Failed to load history": "Failed to load history.",
    "Wallet sync failed": "Failed to update wallet.",
    "Failed to add asset": "Failed to add asset.",
    "Failed to update amount": "Failed to update amount.",
    "Failed to delete asset": "Failed to delete asset.",
    "Failed to add buy": "Failed to add purchase.",
    "Failed to import portfolio": "Failed to import portfolio.",
    "Failed to create backup": "Failed to create backup.",
    "Invalid JSON file": "Invalid JSON file."
  };
  return knownMessages[String(message || "")] || `Operation failed: ${String(message || t("unknownError"))}`;
}

function clearAssignmentPrompt() {
  pendingAssignment = null;
  assignmentPrompt.innerHTML = "";
  assignmentPrompt.classList.add("hidden");
}

function clearManualAssetForm() {
  assetForm.reset();
  manualEntryFields.querySelectorAll("input").forEach((input) => {
    input.value = "";
  });
  selectedCoin = null;
  selectedCoinLabel.textContent = "";
  selectedCoinLabel.classList.add("hidden");
  clearSearchResults();
  showSearchHint("");
  clearAssignmentPrompt();
}

function showAssignmentPrompt(asset, walletId, amount) {
  const walletName = manualWalletName(walletId);
  pendingAssignment = { assetId: asset.id, walletId, amount };
  assignmentPrompt.innerHTML = `
    <span>${escapeHtml(`${asset.name} is already in the portfolio: ${amount} ${asset.symbol} is unassigned.`)}</span>
    <button type="button" class="assign-existing-button" title="Assign the existing manual asset to the selected wallet">Assign ${escapeHtml(walletName)}</button>
  `;
  assignmentPrompt.classList.remove("hidden");
}

function showError(message) {
  if (!message) {
    errorBanner.textContent = "";
    errorBanner.classList.add("hidden");
    return;
  }

  errorBanner.textContent = localizeError(message);
  errorBanner.classList.remove("hidden");
}

function showPriceWarning(message) {
  priceWarning.textContent = message ? t("priceProvidersUnavailable") : "";
  priceWarning.classList.toggle("hidden", !message);
}

function showWalletWarning(message) {
  walletWarning.textContent = message ? localizeError(message) : "";
  walletWarning.classList.toggle("hidden", !message);
}

function walletContractLink(asset, wallet) {
  const href = asset.contractUrl || wallet.walletUrl;
  const label = asset.type === "native" ? t("nativeEth") : shortAddress(asset.contractAddress);
  return `<a class="address-link contract-address" href="${escapeHtml(href)}" target="_blank" rel="noreferrer" title="${escapeHtml(asset.contractAddress || wallet.address)}">${escapeHtml(label)}</a>`;
}

function renderTrackedAssets(wallet) {
  trackedAssetsList.innerHTML = "";
  trackedAssetCount.textContent = String(wallet.matchedAssets.length);

  if (!wallet.matchedAssets.length) {
    trackedAssetsList.innerHTML = `<p class="muted-copy">${escapeHtml(t("noTrackedEthereumAssets"))}</p>`;
    return;
  }

  for (const asset of wallet.matchedAssets) {
    const item = document.createElement("article");
    item.className = "wallet-asset-row";
    item.innerHTML = `
      <div class="wallet-asset-name">
        <strong>${escapeHtml(asset.portfolioAsset?.name || asset.name)}</strong>
        <span>${escapeHtml(asset.symbol)}</span>
      </div>
      <div><small>${escapeHtml(t("balance"))}</small><strong title="${escapeHtml(asset.normalizedBalance)}">${escapeHtml(formatWalletBalance(asset.normalizedBalance))}</strong></div>
      <div><small>${escapeHtml(t("price"))}</small><strong>${formatUsd(asset.currentPriceUsd)}</strong></div>
      <div><small>${escapeHtml(t("value"))}</small><strong>${formatUsd(asset.walletAssetValueUsd)}</strong></div>
      <div><small>${escapeHtml(t("contract"))}</small>${walletContractLink(asset, wallet)}</div>
      <div class="wallet-row-action">
        <span class="source-badge ethereum-source">${escapeHtml(t("ethereumWallet"))}</span>
        <span class="pricing-badge ${asset.currentPriceUsd == null ? "unpriced" : "priced"}">${escapeHtml(asset.currentPriceUsd == null ? t("unpriced") : t("priced"))}</span>
        <button class="stop-tracking-button ghost-button" type="button" data-wallet-asset-id="${escapeHtml(asset.id)}">${escapeHtml(t("stopTracking"))}</button>
      </div>
    `;
    trackedAssetsList.appendChild(item);
  }
}

function renderDiscoveredList(container, assets, wallet, emptyMessage) {
  container.innerHTML = "";

  if (!assets.length) {
    container.innerHTML = `<p class="muted-copy">${escapeHtml(emptyMessage)}</p>`;
    return;
  }

  for (const asset of assets) {
    const item = document.createElement("article");
    const hasContractMismatch =
      asset.contractMismatch === true || asset.possibleSpam === true;
    item.className = `wallet-asset-row discovered-asset-row${hasContractMismatch ? " contract-mismatch-row" : ""}`;
    item.dataset.contractStatus = hasContractMismatch
      ? "mismatch"
      : asset.contractVerified
        ? "verified"
        : "unverified";
    item.dataset.contractAddress = (asset.contractAddress || "native").toLowerCase();
    const suggestion = asset.suggestedPortfolioAsset && !hasContractMismatch
      ? `<small class="mapping-suggestion">${escapeHtml(t("exactMatch"))}: ${escapeHtml(asset.suggestedPortfolioAsset.name)} (${escapeHtml(asset.suggestedPortfolioAsset.symbol)})</small>`
      : "";
    const stateLabel = asset.trackingStatus === "stopped" ? t("previouslyStopped") : t("discovered");
    const verificationBadge = hasContractMismatch
      ? `<span class="risk-badge">${escapeHtml(t("contractMismatch"))}</span><strong class="spam-warning">${escapeHtml(t("possibleSpam"))}</strong>`
      : asset.contractVerified
        ? `<span class="pricing-badge priced">${escapeHtml(asset.type === "native" ? t("nativeEth") : t("exactContract"))}</span>`
        : `<span class="pricing-badge unpriced">${escapeHtml(t("contractUnverified"))}</span>`;
    const requiresAdvancedTrack =
      hasContractMismatch || asset.requiresAdvancedConfirmation === true;
    item.innerHTML = `
      <div class="wallet-asset-name">
        <strong>${escapeHtml(asset.name)}</strong>
        <span>${escapeHtml(asset.symbol)}</span>
        ${suggestion}
        ${verificationBadge}
      </div>
      <div><small>${escapeHtml(t("balance"))}</small><strong title="${escapeHtml(asset.normalizedBalance)}">${escapeHtml(formatWalletBalance(asset.normalizedBalance))}</strong></div>
      <div><small>${escapeHtml(t("contract"))}</small>${walletContractLink(asset, wallet)}</div>
      <div class="wallet-row-action">
        <span class="source-badge">${stateLabel}</span>
        <button class="track-wallet-asset-button ${requiresAdvancedTrack ? "ghost-button" : ""}" type="button" data-wallet-asset-id="${escapeHtml(asset.id)}">${escapeHtml(requiresAdvancedTrack ? t("advancedTrack") : t("track"))}</button>
      </div>
    `;
    container.appendChild(item);
  }
}

function renderDiscoveredAssets(wallet) {
  const query = discoveredTokenSearch.value.trim().toLowerCase();
  const otherAssets = wallet.otherDiscoveredTokens.filter((asset) => {
    const haystack = `${asset.name} ${asset.symbol} ${asset.contractAddress || "native eth"}`.toLowerCase();
    return !query || haystack.includes(query);
  });

  suggestedAssetCount.textContent = String(wallet.suggestedAssets.length);
  otherDiscoveredTokenCount.textContent = String(wallet.otherDiscoveredTokens.length);
  renderDiscoveredList(
    suggestedAssetsList,
    wallet.suggestedAssets,
    wallet,
    t("noVerifiedSuggestions")
  );
  renderDiscoveredList(
    otherDiscoveredTokensList,
    otherAssets,
    wallet,
    query ? t("noMatchingTokens") : t("noOtherTokens")
  );
}

function renderWallet(wallet, scope = {}) {
  if (!wallet) {
    walletValue.textContent = "—";
    walletValueMeta.textContent = t("noWalletData");
    walletStatus.textContent = t("walletUnavailable");
    walletLastSync.textContent = "—";
    walletTrackedCount.textContent = "0";
    walletPricingCount.textContent = `0 ${t("priced").toLowerCase()} · 0 ${t("unpriced").toLowerCase()}`;
    trackedAssetsList.innerHTML = `<p class="muted-copy">${escapeHtml(t("noWalletData"))}</p>`;
    suggestedAssetCount.textContent = "0";
    suggestedAssetsList.innerHTML = "";
    otherDiscoveredTokenCount.textContent = "0";
    otherDiscoveredTokensList.innerHTML = "";
    renderWallets([]);
    return;
  }

  const displayValueUsd = scope.walletOnly ? scope.totalValueUsd : wallet.totalValueUsd ?? wallet.trackedEthereumValueUsd;
  const displayTrackedAssets = scope.walletOnly ? scope.trackedAssets : wallet.trackedAssets;
  const displayPricedAssets = scope.walletOnly ? scope.pricedAssets : wallet.pricedTrackedAssets;
  const displayUnpricedAssets = scope.walletOnly ? scope.unpricedAssets : wallet.unpricedTrackedAssets;
  walletValue.textContent = formatUsd(displayValueUsd);
  walletValueMeta.textContent = displayTrackedAssets
    ? scope.walletOnly
      ? `${scope.walletName || "Wallet"} · ${formatAssetCount(displayTrackedAssets)}`
      : `${formatWalletCount(wallet.enabledWallets || 0)} · ${formatAssetCount(displayTrackedAssets)}`
    : scope.manualAssets ? `${scope.walletOnly ? scope.walletName : "All wallets"} · ${formatAssetCount(scope.manualAssets)} manually` : t("noTrackedAssets");
  walletTrackedCount.textContent = String(displayTrackedAssets || 0);
  walletPricingCount.textContent = `${displayPricedAssets || 0} ${t("priced").toLowerCase()} · ${displayUnpricedAssets || 0} ${t("unpriced").toLowerCase()}`;
  walletLastSync.textContent = formatDate(wallet.lastSuccessfulSyncAt);
  walletStatus.textContent = wallet.stale
    ? t("walletStale")
    : wallet.lastSuccessfulSyncAt
      ? t("walletSynced")
      : t("walletNotSynced");
  walletStatus.dataset.status = wallet.stale
    ? "stale"
    : wallet.lastSuccessfulSyncAt
      ? "synced"
      : "idle";
  showWalletWarning("");

  const selectedWallet = scope.walletOnly
    ? wallet.wallets?.find((item) => item.id === scope.id)
    : null;
  const enabledWallet = selectedWallet || wallet.wallets?.find((item) => item.enabled);
  if ((scope.walletOnly || wallet.enabledWallets === 1) && enabledWallet?.addressUrl) {
    walletAddressLink.href = enabledWallet.addressUrl;
    walletAddressLink.textContent = shortAddress(enabledWallet.address);
    walletAddressLink.title = enabledWallet.address;
    walletAddressLink.classList.remove("hidden");
  } else {
    walletAddressLink.removeAttribute("href");
    walletAddressLink.textContent = wallet.totalWallets
      ? `${formatWalletCount(wallet.enabledWallets)} enabled`
      : t("walletNotConfigured");
  }
  renderTrackedAssets(wallet);
  renderDiscoveredAssets(wallet);
  renderWallets(wallet.wallets, wallet, scope);
}

function showUtilityMessage(message, type = "success") {
  utilityMessage.textContent = message || "";
  utilityMessage.classList.toggle("hidden", !message);
  utilityMessage.dataset.type = type;
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function downloadFromEndpoint(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function renderPortfolioPerformance(totals) {
  const performance = portfolioPerformanceForRange(totals, selectedDeltaRange);
  portfolioDelta.textContent = typeof performance === "number"
    ? `${performance > 0 ? "+" : ""}${formatPercent(performance)}`
    : "—";
  portfolioDelta.className = `portfolio-delta ${percentClass(performance) || "neutral"}`;
}

function renderAllocation(allocation) {
  allocationList.innerHTML = "";

  if (!allocation.length) {
    allocationToggleButton.classList.add("hidden");
    allocationList.innerHTML = `<p class="muted-copy">${escapeHtml(t("noPricedAssets"))}</p>`;
    return;
  }

  const sortedAllocation = [...allocation].sort((a, b) => b.percentage - a.percentage);
  const allocationLimit = 12;
  const hiddenItems = sortedAllocation.slice(allocationLimit);
  const compactAllocation = hiddenItems.length
    ? [
        ...sortedAllocation.slice(0, allocationLimit),
        {
          id: "allocation-other",
          name: "Other",
          symbol: "Other",
          percentage: hiddenItems.reduce((sum, item) => sum + item.percentage, 0)
        }
      ]
    : sortedAllocation;
  const visibleAllocation = allocationExpanded ? sortedAllocation : compactAllocation;
  const columns = splitForColumns(visibleAllocation);

  allocationToggleButton.classList.toggle("hidden", hiddenItems.length === 0);
  allocationToggleButton.textContent = allocationExpanded ? "Collapse" : "Show all";
  allocationToggleButton.setAttribute("aria-expanded", String(allocationExpanded));

  for (const columnItems of columns) {
    const column = document.createElement("div");
    column.className = "allocation-column";

    for (const item of columnItems) {
      const row = document.createElement("div");
      row.className = "allocation-row";
      row.innerHTML = `
        <span>${escapeHtml(item.symbol)}</span>
        <strong>${item.percentage.toFixed(1)}%</strong>
        <div class="allocation-track">
          <div class="allocation-fill" style="width: ${item.percentage}%"></div>
        </div>
      `;
      column.appendChild(row);
    }

    allocationList.appendChild(column);
  }
}

function compareValues(a, b, key) {
  const firstValue = key === "amount" ? a.effectiveAmount : a[key];
  const secondValue = key === "amount" ? b.effectiveAmount : b[key];

  if (typeof firstValue === "string" && typeof secondValue === "string") {
    return firstValue.localeCompare(secondValue);
  }

  if (firstValue == null && secondValue == null) return 0;
  if (firstValue == null) return 1;
  if (secondValue == null) return -1;
  return firstValue - secondValue;
}

function getSortedAssets(assets) {
  return [...assets].sort((a, b) => {
    const firstValue = sortState.key === "amount" ? a.effectiveAmount : a[sortState.key];
    const secondValue = sortState.key === "amount" ? b.effectiveAmount : b[sortState.key];

    if (firstValue == null && secondValue != null) return 1;
    if (firstValue != null && secondValue == null) return -1;

    const comparison = compareValues(a, b, sortState.key);
    return sortState.direction === "asc" ? comparison : -comparison;
  });
}

function isTinyOrZeroAsset(asset) {
  const amount = Number(asset.effectiveAmount ?? asset.amount);
  if (Number.isFinite(amount) && amount <= 0) return true;
  return typeof asset.totalPerCoinUsd === "number" && asset.totalPerCoinUsd < 0.1;
}

function getVisibleAssets(assets) {
  return showTinyAssets ? assets : assets.filter((asset) => !isTinyOrZeroAsset(asset));
}

function updateSortButtons() {
  for (const button of sortButtons) {
    const isActive = button.dataset.sortKey === sortState.key;
    button.classList.toggle("active", isActive);
    button.dataset.direction = isActive ? sortState.direction : "";
    button.textContent = `${button.dataset.sortLabel}${isActive ? ` ${sortState.direction === "asc" ? "↑" : "↓"}` : ""}`;
  }
}

function persistSortState() {
  localStorage.setItem("cryptoPortfolio.sortKey", sortState.key);
  localStorage.setItem("cryptoPortfolio.sortDirection", sortState.direction);
}

function renderPortfolio(data) {
  portfolioTotal.textContent = formatUsd(data.totals.portfolioTotalUsd);
  const fullPriceSource = formatPriceSource(data.priceSource);
  const fullUpdatedAt = formatDate(data.lastPriceUpdateTime);
  priceProvider.textContent = formatPriceProvider(data.priceSource);
  priceProvider.title = fullPriceSource;
  priceProvider.setAttribute("aria-label", `Price source: ${fullPriceSource}`);
  priceUpdated.textContent = formatPriceUpdatedAt(data.lastPriceUpdateTime);
  priceUpdated.title = fullUpdatedAt;
  priceUpdated.setAttribute("aria-label", `Last price update: ${fullUpdatedAt}`);
  showPriceWarning(data.priceWarning);
  showError(data.priceError ? t("priceProvidersUnavailable") : "");
  renderPortfolioPerformance(data.totals);
  renderAllocation(data.allocation);
  renderWalletScopeSelector(data.wallet, data.scope);
  renderWallet(data.wallet, data.scope);
  showTinyAssetsToggle.checked = showTinyAssets;
  updateSortButtons();

  portfolioBody.innerHTML = "";

  const assetsWithWeight = data.assets.map((asset) => ({
    ...asset,
    assetWeightPercent:
      typeof asset.totalPerCoinUsd === "number" && data.totals.portfolioTotalUsd > 0
        ? (asset.totalPerCoinUsd / data.totals.portfolioTotalUsd) * 100
        : null
  }));
  const visibleAssets = getSortedAssets(getVisibleAssets(assetsWithWeight));
  if (!visibleAssets.length) {
    portfolioBody.innerHTML = '<tr><td colspan="10" class="muted-copy">No assets match the current filter.</td></tr>';
    return;
  }

  for (const asset of visibleAssets) {
    const row = document.createElement("tr");
    const tracked = asset.isEthereumTracked;
    const manualPosition = tracked ? null : selectedManualPosition(asset);
    const amountCell = tracked
      ? `
          <strong title="${escapeHtml(asset.walletAmount)}">${escapeHtml(formatWalletBalance(asset.effectiveAmount))}</strong>
          <small class="amount-meta">${walletSourceBadge(asset)}${asset.walletStale ? `<span class="pricing-badge unpriced">${escapeHtml(t("walletStale"))}</span>` : ""}</small>
        `
      : `
          <input
            class="amount-input"
            type="number"
            min="0"
            step="any"
            value="${escapeHtml(manualPosition.amount)}"
            data-id="${escapeHtml(asset.id)}"
            data-wallet-id="${escapeHtml(manualPosition.walletId || "")}"
          />
          <small class="amount-meta"><span class="source-badge" title="${escapeHtml(manualBreakdownTitle(asset))}">Manual · ${escapeHtml(manualWalletName(manualPosition.walletId))}</span></small>
        `;
    const actions = tracked
      ? `<div class="actions"><button class="stop-tracking-button ghost-button" data-id="${escapeHtml(asset.id)}" data-wallet-asset-id="${escapeHtml(asset.walletAssetId)}" title="Stop tracking Ethereum asset" aria-label="Stop tracking Ethereum asset">${escapeHtml(t("disconnect"))}</button></div>`
      : `
          <div class="actions">
            <button class="save-button" data-id="${escapeHtml(asset.id)}" title="Save amount" aria-label="Save amount">${escapeHtml(t("saveCompact"))}</button>
            <button class="add-buy-button ghost-button" data-id="${escapeHtml(asset.id)}" title="Add purchase" aria-label="Add purchase">${escapeHtml(t("addBuyCompact"))}</button>
            <button class="move-position-button ghost-button" data-id="${escapeHtml(asset.id)}" title="Move or split manual position" aria-label="Move or split manual position">Move</button>
            <button class="delete-button" data-id="${escapeHtml(asset.id)}" title="Delete manual asset" aria-label="Delete manual asset">${escapeHtml(t("delete"))}</button>
          </div>
          <div class="add-buy-form hidden" data-id="${escapeHtml(asset.id)}">
            <input class="buy-amount-input" type="number" min="0" step="any" placeholder="Amount to add" />
            <select class="buy-wallet-select">${manualWalletOptions(manualPosition.walletId)}</select>
            <button class="confirm-buy-button" data-id="${escapeHtml(asset.id)}">${escapeHtml(t("confirm"))}</button>
            <button class="cancel-buy-button ghost-button" data-id="${escapeHtml(asset.id)}">${escapeHtml(t("cancel"))}</button>
          </div>
          <div class="move-position-form hidden" data-id="${escapeHtml(asset.id)}" data-from-wallet-id="${escapeHtml(manualPosition.walletId || "")}">
            <input class="move-amount-input" type="number" min="0" step="any" placeholder="Amount to move" />
            <select class="move-wallet-select">${manualWalletOptions("")}</select>
            <button class="confirm-move-button" data-id="${escapeHtml(asset.id)}">Move</button>
            <button class="cancel-move-button ghost-button" data-id="${escapeHtml(asset.id)}">Cancel</button>
          </div>
        `;

    row.innerHTML = `
      <td>${escapeHtml(asset.name)}</td>
      <td>${escapeHtml(asset.symbol)}</td>
      <td>${amountCell}</td>
      <td>${formatUsd(asset.currentPriceUsd)}</td>
      <td>${formatUsd(asset.totalPerCoinUsd)}</td>
      <td>${typeof asset.assetWeightPercent === "number" ? `${asset.assetWeightPercent.toFixed(1)}%` : "—"}</td>
      <td class="${percentClass(asset.change24h)}">${formatPercent(asset.change24h)}</td>
      <td class="${percentClass(asset.change7d)}">${formatPercent(asset.change7d)}</td>
      <td class="${percentClass(asset.change30d)}">${formatPercent(asset.change30d)}</td>
      <td class="action-cell">${actions}</td>
    `;

    portfolioBody.appendChild(row);
  }
}

async function loadPortfolio({ loadHistoryData = true } = {}) {
  setRefreshLoading(true);

  try {
    const query = selectedWalletScope !== "all"
      ? `?wallet=${encodeURIComponent(selectedWalletScope)}`
      : "";
    const response = await fetch(`/api/portfolio${query}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load portfolio");
    }

    latestPortfolioData = data;
    renderPortfolio(data);
    if (loadHistoryData) await loadHistory();
  } catch (error) {
    showError(error.message);
  } finally {
    setRefreshLoading(false);
  }
}

function formatHistoryDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(date);
}

function renderHistoryPeriodControls(history) {
  const periods = availableHistoryPeriods(history);
  if (!periods.includes(selectedHistoryPeriod)) {
    selectedHistoryPeriod = periods.includes("1M") ? "1M" : "ALL";
  }

  historyPeriodControls.innerHTML = periods
    .map((period) => `
      <button
        type="button"
        class="history-period-button${period === selectedHistoryPeriod ? " active" : ""}"
        data-history-period="${period}"
        aria-pressed="${period === selectedHistoryPeriod}"
      >${period}</button>
    `)
    .join("");
}

function historyTickIndexes(length) {
  const maxLabels = window.matchMedia("(max-width: 600px)").matches ? 4 : 9;
  const ticks = Math.min(maxLabels, length);
  return Array.from({ length: ticks }, (_value, index) =>
    Math.round((index / (ticks - 1 || 1)) * (length - 1))
  );
}

function showHistoryTooltip(point) {
  const tooltip = historyChart.querySelector(".history-tooltip");
  if (!tooltip) return;

  const value = Number(point.dataset.value);
  tooltip.innerHTML = `<strong>${escapeHtml(formatHistoryDate(point.dataset.date))}</strong><span>${escapeHtml(formatUsd(value))}</span>`;
  tooltip.style.left = `${point.dataset.x}%`;
  tooltip.style.top = `${point.dataset.y}%`;
  tooltip.classList.remove("hidden");
}

function hideHistoryTooltip() {
  historyChart.querySelector(".history-tooltip")?.classList.add("hidden");
}

function renderHistory(history) {
  renderHistoryPeriodControls(history);
  const selectedHistory = selectHistoryPeriod(history, selectedHistoryPeriod);

  if (selectedHistory.length < 2) {
    historyChart.innerHTML =
      `<p class="muted-copy">${escapeHtml(t("historyNotEnough"))}</p>`;
    return;
  }

  const width = 820;
  const compactDesktopChart = !window.matchMedia("(max-width: 760px)").matches;
  const height = compactDesktopChart ? 248 : 286;
  const padding = { top: 18, right: 24, bottom: 42, left: 78 };
  const values = selectedHistory.map((item) => item.totalUsd);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const scale = niceChartTicks(minValue, maxValue);
  const scaleMin = scale.min;
  const scaleMax = scale.max;
  const scaleRange = scaleMax - scaleMin;
  const startTime = new Date(`${selectedHistory[0].date}T00:00:00Z`).getTime();
  const endTime = new Date(`${selectedHistory.at(-1).date}T00:00:00Z`).getTime();
  const timeRange = endTime - startTime || 1;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const points = selectedHistory.map((item) => {
    const time = new Date(`${item.date}T00:00:00Z`).getTime();
    const x = padding.left + ((time - startTime) / timeRange) * plotWidth;
    const y = padding.top + (1 - (item.totalUsd - scaleMin) / scaleRange) * plotHeight;
    return { ...item, x, y };
  });
  const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const minPoint = points.find((point) => point.totalUsd === minValue);
  const maxPoint = points.find((point) => point.totalUsd === maxValue);
  const extremes = [
    { point: minPoint, kind: "min", label: "Minimum" },
    { point: maxPoint, kind: "max", label: "Maximum" }
  ].filter(({ point }, index, entries) =>
    entries.findIndex((entry) => entry.point === point) === index
  );
  const yTicks = [...scale.ticks].reverse().map((value) => ({
    value,
    y: padding.top + (1 - (value - scaleMin) / scaleRange) * plotHeight
  }));

  historyChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Portfolio value over time">
      ${yTicks
        .map(
          (tick) => `
            <line x1="${padding.left}" y1="${tick.y}" x2="${width - padding.right}" y2="${tick.y}" class="chart-grid-line"></line>
            <text x="${padding.left - 10}" y="${tick.y + 4}" class="chart-label" text-anchor="end">${formatUsdWhole(tick.value)}</text>
          `
        )
        .join("")}
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" class="chart-axis"></line>
      <polyline points="${polylinePoints}" class="chart-line"></polyline>
      ${points
        .map(
          (point) => `<circle cx="${point.x}" cy="${point.y}" r="2" class="chart-point"></circle>`
        )
        .join("")}
      ${extremes
        .map(
          ({ point, kind, label }) => `
            <circle cx="${point.x}" cy="${point.y}" r="5" class="chart-extreme chart-extreme-${kind}">
              <title>${label}: ${formatHistoryDate(point.date)}, ${formatUsd(point.totalUsd)}</title>
            </circle>
          `
        )
        .join("")}
      ${points
        .map(
          (point) => `
            <circle
              cx="${point.x}"
              cy="${point.y}"
              r="14"
              class="chart-hit-area"
              data-date="${escapeHtml(point.date)}"
              data-value="${point.totalUsd}"
              data-x="${(point.x / width) * 100}"
              data-y="${(point.y / height) * 100}"
              aria-label="${escapeHtml(`${formatHistoryDate(point.date)}: ${formatUsd(point.totalUsd)}`)}"
            ></circle>
          `
        )
        .join("")}
      ${historyTickIndexes(points.length)
        .map((index) => {
          const point = points[index];
          return `<text x="${point.x}" y="${height - 14}" class="chart-label chart-date-label" text-anchor="middle">${formatHistoryDate(point.date)}</text>`;
        })
        .join("")}
    </svg>
    <div class="history-tooltip hidden" role="tooltip"></div>
  `;

  for (const point of historyChart.querySelectorAll(".chart-hit-area")) {
    point.addEventListener("pointerenter", () => showHistoryTooltip(point));
    point.addEventListener("pointerleave", hideHistoryTooltip);
    point.addEventListener("click", () => showHistoryTooltip(point));
  }
}

async function loadHistory() {
  try {
    const response = await fetch("/api/history");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load history");
    }

    latestHistoryData = data.history || [];
    renderHistory(latestHistoryData);
  } catch (_error) {
    historyChart.innerHTML = `<p class="muted-copy">${escapeHtml(t("historyUnavailable"))}</p>`;
    latestHistoryData = [];
  }
}

function setRefreshLoading(isLoading) {
  refreshButton.disabled = isLoading;
  refreshButton.textContent = isLoading ? t("refreshing") : "Prices";
}

function setWalletSyncLoading(isLoading) {
  syncWalletButton.disabled = isLoading;
  syncWalletButton.textContent = isLoading ? t("syncing") : "Sync";
}

async function syncEthereumWallet() {
  setWalletSyncLoading(true);
  showWalletWarning("");

  try {
    const response = await fetch("/api/wallet/sync", {
      method: "POST"
    });
    const data = await response.json();

    if (!response.ok) {
      if (data.wallet) {
        if (latestPortfolioData) {
          latestPortfolioData = { ...latestPortfolioData, wallet: data.wallet };
        }
        renderWallet(data.wallet);
      }

      throw new Error(data.error || "Wallet sync failed");
    }

    if (selectedWalletScope !== "all") {
      await loadPortfolio();
    } else {
      latestPortfolioData = data.portfolio;
      renderPortfolio(data.portfolio);
      await loadHistory();
    }
  } catch (error) {
    showWalletWarning(error.message || t("walletSyncFailed"));
  } finally {
    setWalletSyncLoading(false);
  }
}

async function syncConfiguredWallet(walletId, button) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Syncing…";
  showWalletsMessage("");

  try {
    const response = await fetch(`/api/wallets/${encodeURIComponent(walletId)}/sync`, {
      method: "POST"
    });
    const data = await response.json();
    if (!response.ok) {
      if (data.wallet && latestPortfolioData) {
        latestPortfolioData = { ...latestPortfolioData, wallet: data.wallet };
        renderWallet(data.wallet, latestPortfolioData.scope);
      }
      throw new Error(data.error || "Wallet sync failed");
    }

    if (selectedWalletScope !== "all") {
      await loadPortfolio({ loadHistoryData: !data.partial });
    } else {
      latestPortfolioData = data.portfolio;
      renderPortfolio(data.portfolio);
      if (!data.partial) await loadHistory();
    }
  } catch (error) {
    showWalletsMessage(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function closeTrackDialog({ reopenManager = true } = {}) {
  trackAssetDialog.close();
  pendingTrackWalletAsset = null;
  selectedTrackCoin = null;
  currentTrackVerification = null;

  if (reopenManager && latestPortfolioData?.wallet) {
    walletManagerDialog.showModal();
  }
}

function getSelectedTrackAsset() {
  if (selectedTrackCoin) {
    return selectedTrackCoin;
  }

  return latestPortfolioData?.wallet?.portfolioOptions.find(
    (option) => option.id === trackPortfolioAssetSelect.value
  ) || null;
}

function getClientTrackVerification(walletAsset, selectedAsset) {
  if (!selectedAsset) {
    return null;
  }

  if (walletAsset.type === "native") {
    const contractVerified =
      Number(selectedAsset.cmcId) === 1027 || selectedAsset.coingeckoId === "ethereum";
    return {
      contractVerified,
      contractMismatch: false,
      requiresAdvancedConfirmation: !contractVerified
    };
  }

  const providerContract = String(
    selectedAsset.ethereumContract?.contractAddress || ""
  ).toLowerCase();
  const walletContract = String(walletAsset.contractAddress || "").toLowerCase();
  const contractVerified =
    selectedAsset.ethereumContract?.chainId === 1 && providerContract === walletContract;
  const contractMismatch = Boolean(
    providerContract &&
    providerContract !== walletContract &&
    String(selectedAsset.symbol || "").toUpperCase() === walletAsset.symbol
  );

  return {
    contractVerified,
    contractMismatch,
    requiresAdvancedConfirmation: !contractVerified
  };
}

function updateTrackConfirmation() {
  if (!pendingTrackWalletAsset) return;

  const selectedAsset = getSelectedTrackAsset();
  currentTrackVerification = getClientTrackVerification(
    pendingTrackWalletAsset,
    selectedAsset
  );
  const contractLabel = pendingTrackWalletAsset.type === "native"
    ? t("nativeEth")
    : pendingTrackWalletAsset.contractAddress;
  const selectedLabel = selectedAsset
    ? `${selectedAsset.name} (${selectedAsset.symbol})`
    : "Not selected";
  const blockscoutLink = pendingTrackWalletAsset.blockscoutUrl
    ? `<a class="address-link" href="${escapeHtml(pendingTrackWalletAsset.blockscoutUrl)}" target="_blank" rel="noreferrer">${escapeHtml(t("openInBlockscout"))}</a>`
    : "";

  trackAssetIdentity.innerHTML = `
    <div><small>Full name</small><strong>${escapeHtml(pendingTrackWalletAsset.name)}</strong></div>
    <div><small>Symbol</small><strong>${escapeHtml(pendingTrackWalletAsset.symbol)}</strong></div>
    <div><small>Full contract address</small><strong class="full-contract-address">${escapeHtml(contractLabel)}</strong></div>
    <div><small>Selected portfolio asset / priced asset</small><strong>${escapeHtml(selectedLabel)}</strong></div>
    ${blockscoutLink}
  `;

  trackVerificationWarning.classList.toggle(
    "hidden",
    !currentTrackVerification || currentTrackVerification.contractVerified
  );
  advancedTrackConfirmationLabel.classList.toggle(
    "hidden",
    !currentTrackVerification?.requiresAdvancedConfirmation
  );
  advancedTrackConfirmation.checked = false;

  if (currentTrackVerification?.contractMismatch) {
    trackVerificationWarning.innerHTML = `
      <strong>${escapeHtml(t("contractMismatch"))}</strong>
      <span>${escapeHtml(t("possibleSpam"))}. The wallet contract does not match the selected priced asset.</span>
    `;
  } else if (currentTrackVerification?.requiresAdvancedConfirmation) {
    trackVerificationWarning.innerHTML = `
      <strong>${escapeHtml(t("contractUnverified"))}</strong>
      <span>The current price provider did not verify an exact Ethereum contract match.</span>
    `;
  } else {
    trackVerificationWarning.textContent = "";
  }

  confirmTrackButton.textContent = currentTrackVerification?.requiresAdvancedConfirmation
    ? "Confirm advanced tracking"
    : "Confirm tracking";
}

function openTrackDialog(walletAssetId) {
  const wallet = latestPortfolioData?.wallet;
  const asset = wallet?.balances.find((candidate) => candidate.id === walletAssetId);

  if (!asset) {
    showWalletWarning("Wallet asset is no longer available. Refresh the wallet and try again.");
    return;
  }

  pendingTrackWalletAsset = asset;
  selectedTrackCoin = null;
  trackPriceSearch.value = "";
  trackSearchResults.innerHTML = "";
  trackSearchResults.classList.add("hidden");
  trackSelection.textContent = "";
  trackSelection.classList.add("hidden");
  trackError.textContent = "";
  trackError.classList.add("hidden");
  advancedTrackConfirmation.checked = false;

  const selectedId = asset.mapping?.portfolioAssetId || asset.suggestedPortfolioAsset?.id || "";
  const options = (wallet.portfolioOptions || []).filter(
    (option) => option.available || option.walletAssetId === asset.id
  );
  trackPortfolioAssetSelect.innerHTML = [
    '<option value="">Select an existing asset</option>',
    ...options.map(
      (option) =>
        `<option value="${escapeHtml(option.id)}" ${option.id === selectedId ? "selected" : ""}>${escapeHtml(option.name)} (${escapeHtml(option.symbol)})</option>`
    )
  ].join("");

  walletManagerDialog.close();
  updateTrackConfirmation();
  trackAssetDialog.showModal();
}

function renderTrackSearchResults(coins) {
  trackSearchResults.innerHTML = "";

  if (!coins.length) {
    trackSearchResults.innerHTML = '<p class="muted-copy">No priced assets found.</p>';
    trackSearchResults.classList.remove("hidden");
    return;
  }

  for (const coin of coins) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result track-search-result";
    button.dataset.name = coin.name;
    button.dataset.symbol = coin.symbol;
    button.dataset.coingeckoId = coin.coingeckoId;
    button.dataset.cmcId = coin.cmcId ?? "";
    button.dataset.ethereumContractAddress = coin.ethereumContract?.contractAddress || "";
    button.dataset.ethereumChainId = coin.ethereumContract?.chainId || "";
    button.innerHTML = `
      <strong>${escapeHtml(coin.name)}</strong>
      <span>${escapeHtml(coin.symbol)}</span>
      <small>CMC ${escapeHtml(coin.cmcId ?? "—")} · ${coin.ethereumContract ? "Ethereum contract available" : t("contractUnverified")}</small>
    `;
    trackSearchResults.appendChild(button);
  }

  trackSearchResults.classList.remove("hidden");
}

async function searchTrackPriceAssets(query) {
  const requestId = ++trackSearchRequestId;

  try {
    const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (requestId !== trackSearchRequestId) return;
    if (!response.ok) throw new Error(data.error || "Price asset search failed");
    renderTrackSearchResults(data.coins || []);
  } catch (error) {
    if (requestId !== trackSearchRequestId) return;
    trackError.textContent = localizeError(error.message);
    trackError.classList.remove("hidden");
  }
}

async function confirmTrackAsset() {
  if (!pendingTrackWalletAsset) return;

  const portfolioAssetId = selectedTrackCoin ? "" : trackPortfolioAssetSelect.value;

  if (!portfolioAssetId && !selectedTrackCoin) {
    trackError.textContent = "Select an existing portfolio asset or a priced asset.";
    trackError.classList.remove("hidden");
    return;
  }

  if (
    currentTrackVerification?.requiresAdvancedConfirmation &&
    !advancedTrackConfirmation.checked
  ) {
    trackError.textContent = "Confirm the contract risk for advanced tracking.";
    trackError.classList.remove("hidden");
    return;
  }

  confirmTrackButton.disabled = true;
  trackError.classList.add("hidden");

  try {
    const response = await fetch("/api/wallet/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAssetId: pendingTrackWalletAsset.id,
        portfolioAssetId: portfolioAssetId || null,
        advancedConfirmation: Boolean(
          currentTrackVerification?.requiresAdvancedConfirmation &&
          advancedTrackConfirmation.checked
        ),
        newPortfolioAsset: selectedTrackCoin
          ? {
              id: selectedTrackCoin.coingeckoId,
              name: selectedTrackCoin.name,
              symbol: selectedTrackCoin.symbol,
              coingeckoId: selectedTrackCoin.coingeckoId,
              cmcId: selectedTrackCoin.cmcId
            }
          : null
      })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to track Ethereum asset");
    }

    latestPortfolioData = data.portfolio;
    renderPortfolio(data.portfolio);
    await loadHistory();
    closeTrackDialog();
  } catch (error) {
    trackError.textContent = localizeError(error.message);
    trackError.classList.remove("hidden");
  } finally {
    confirmTrackButton.disabled = false;
  }
}

async function stopTracking(walletAssetId) {
  const asset = latestPortfolioData?.wallet?.balances.find(
    (candidate) => candidate.id === walletAssetId
  );

  if (!asset || !window.confirm(`Stop tracking ${asset.portfolioAsset?.name || asset.name}? The asset will be removed without restoring the saved manual amount.`)) {
    return;
  }

  try {
    const response = await fetch("/api/wallet/stop-tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAssetId })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to stop Ethereum tracking");
    }

    latestPortfolioData = data.portfolio;
    renderPortfolio(data.portfolio);
    await loadHistory();
  } catch (error) {
    showWalletWarning(error.message);
  }
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  themeSelect.value = theme;
}

assetForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const amountValue = manualEntryMode ? amountInput.value : quickAmountInput.value;

  if (!amountValue || Number(amountValue) <= 0) {
    showError("Amount must be a positive number.");
    return;
  }

  const payload = manualEntryMode
    ? {
        name: nameInput.value,
        symbol: symbolInput.value,
        coingeckoId: coingeckoIdInput.value,
        cmcId: cmcIdInput.value,
        amount: amountInput.value
      }
      : selectedCoin
      ? {
          id: selectedCoin.coingeckoId,
          name: selectedCoin.name,
          symbol: selectedCoin.symbol,
          coingeckoId: selectedCoin.coingeckoId,
          cmcId: selectedCoin.cmcId,
          amount: quickAmountInput.value
        }
      : null;

  if (!payload) {
    showError("Select an asset first or use manual entry.");
    return;
  }

  payload.walletId = manualWalletSelect.value || null;
  clearAssignmentPrompt();

  if (manualEntryMode && (!payload.name || !payload.symbol || !payload.coingeckoId)) {
    showError("Manual entry requires a name, symbol, and CoinGecko ID.");
    return;
  }

  try {
    const response = await fetch("/api/portfolio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 409 && data.code === "MANUAL_ASSIGNMENT_AVAILABLE" && payload.walletId) {
        const unassignedAmount = Number(data.asset?.unassignedAmount);
        if (Number.isFinite(unassignedAmount) && Number(payload.amount) <= unassignedAmount) {
          showAssignmentPrompt(data.asset, payload.walletId, payload.amount);
          return;
        }
        throw new Error(
          `${data.asset?.name || "Asset"} is already in the portfolio: ${data.asset?.unassignedAmount || 0} ${data.asset?.symbol || ""} is unassigned. Use Move or Add purchase.`
        );
      }
      if (response.status === 409 && data.code === "ASSET_ALREADY_ASSIGNED") {
        throw new Error(`${data.asset?.name || "Asset"} is already in the portfolio. Use Move or Add purchase.`);
      }
      throw new Error(data.error || "Failed to add asset");
    }

    clearManualAssetForm();
    await loadPortfolio();
  } catch (error) {
    showError(error.message);
  }
});

assignmentPrompt.addEventListener("click", async (event) => {
  if (!event.target.closest(".assign-existing-button") || !pendingAssignment) return;

  try {
    const response = await fetch(
      `/api/portfolio/${encodeURIComponent(pendingAssignment.assetId)}/assign-unassigned`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId: pendingAssignment.walletId, amount: pendingAssignment.amount })
      }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to assign manual asset");

    clearManualAssetForm();
    await loadPortfolio();
  } catch (error) {
    showError(error.message);
  }
});

portfolioBody.addEventListener("click", async (event) => {
  const target = event.target;
  const id = target.dataset.id;

  if (!id) return;

  if (target.classList.contains("stop-tracking-button")) {
    await stopTracking(target.dataset.walletAssetId);
    return;
  }

  if (target.classList.contains("save-button")) {
    const input = document.querySelector(`.amount-input[data-id="${id}"]`);
    const fromWalletId = input.dataset.walletId || null;

    try {
      const response = await fetch(`/api/portfolio/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ amount: input.value, walletId: fromWalletId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update amount");
      }
      await loadPortfolio();
    } catch (error) {
      showError(error.message);
    }
  }

  if (target.classList.contains("delete-button")) {
    try {
      const response = await fetch(`/api/portfolio/${id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete asset");
      }

      await loadPortfolio();
    } catch (error) {
      showError(error.message);
    }
  }

  if (target.classList.contains("add-buy-button")) {
    const form = document.querySelector(`.add-buy-form[data-id="${id}"]`);
    form.classList.remove("hidden");
  }

  if (target.classList.contains("move-position-button")) {
    document.querySelector(`.move-position-form[data-id="${id}"]`).classList.remove("hidden");
  }

  if (target.classList.contains("cancel-move-button")) {
    document.querySelector(`.move-position-form[data-id="${id}"]`).classList.add("hidden");
  }

  if (target.classList.contains("cancel-buy-button")) {
    const form = document.querySelector(`.add-buy-form[data-id="${id}"]`);
    const input = form.querySelector(".buy-amount-input");
    const walletId = form.querySelector(".buy-wallet-select").value || null;
    input.value = "";
    form.classList.add("hidden");
  }

  if (target.classList.contains("confirm-buy-button")) {
    const form = document.querySelector(`.add-buy-form[data-id="${id}"]`);
    const input = form.querySelector(".buy-amount-input");

    if (!input.value || Number(input.value) <= 0) {
      showError("Amount to add must be a positive number.");
      return;
    }

    try {
      const response = await fetch(`/api/portfolio/${id}/add-buy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ amount: input.value, walletId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to add buy");
      }

      input.value = "";
      form.classList.add("hidden");
      await loadPortfolio();
    } catch (error) {
      showError(error.message);
    }
  }

  if (target.classList.contains("confirm-move-button")) {
    const form = document.querySelector(`.move-position-form[data-id="${id}"]`);
    const amount = form.querySelector(".move-amount-input").value;
    const fromWalletId = form.dataset.fromWalletId || null;
    const toWalletId = form.querySelector(".move-wallet-select").value || null;
    if (!amount || Number(amount) <= 0) return showError("Amount to move must be a positive number.");
    try {
      const response = await fetch(`/api/portfolio/${id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromWalletId, toWalletId, amount })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to move manual position");
      await loadPortfolio();
    } catch (error) {
      showError(error.message);
    }
  }
});

function clearSearchResults() {

  searchResults.innerHTML = "";
  searchResults.classList.add("hidden");
}

function showSearchHint(message) {
  searchHint.textContent = message;
  searchHint.classList.toggle("hidden", !message);
}

function renderSearchResults(coins) {
  searchResults.innerHTML = "";

  if (!coins.length) {
    clearSearchResults();
    return;
  }

  for (const coin of coins) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result";
    button.dataset.name = coin.name;
    button.dataset.symbol = coin.symbol;
    button.dataset.coingeckoId = coin.coingeckoId;
    button.dataset.cmcId = coin.cmcId ?? "";
    button.innerHTML = `
      <strong>${escapeHtml(coin.name)}</strong>
      <span>${escapeHtml(coin.symbol)}</span>
      <small>CMC ${escapeHtml(coin.cmcId ?? "—")}${coin.rank ? ` · rank ${escapeHtml(coin.rank)}` : ""}</small>
    `;
    searchResults.appendChild(button);
  }

  searchResults.classList.remove("hidden");
}

async function searchCoins(query) {
  const requestId = ++lastSearchRequestId;

  try {
    const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (requestId !== lastSearchRequestId) {
      return;
    }

    if (!response.ok) {
      throw new Error(data.error || "Coin search failed");
    }

    renderSearchResults(data.coins || []);
    showSearchHint(data.error ? "Search is unavailable, but manual entry still works." : "");
  } catch (_error) {
    if (requestId !== lastSearchRequestId) {
      return;
    }

    clearSearchResults();
    showSearchHint("Search is unavailable, but manual entry still works.");
  }
}

function scheduleCoinSearch(event) {
  const query = event.target.value.trim();
  selectedCoin = null;
  selectedCoinLabel.textContent = "";
  selectedCoinLabel.classList.add("hidden");

  window.clearTimeout(searchTimeoutId);

  if (query.length < 2) {
    clearSearchResults();
    showSearchHint("");
    return;
  }

  searchTimeoutId = window.setTimeout(() => {
    searchCoins(query);
  }, 250);
}

coinSearchInput.addEventListener("input", scheduleCoinSearch);

searchResults.addEventListener("click", (event) => {
  const button = event.target.closest(".search-result");

  if (!button) return;

  selectedCoin = {
    name: button.dataset.name,
    symbol: button.dataset.symbol,
    coingeckoId: button.dataset.coingeckoId,
    cmcId: Number(button.dataset.cmcId)
  };
  selectedCoinLabel.textContent = `${t("selected")}: ${selectedCoin.name} (${selectedCoin.symbol})`;
  selectedCoinLabel.classList.remove("hidden");
  clearSearchResults();
  showSearchHint("");
});

manualEntryToggle.addEventListener("click", () => {
  manualEntryMode = !manualEntryMode;
  manualEntryFields.classList.toggle("hidden", !manualEntryMode);
  manualEntryToggle.textContent = manualEntryMode ? t("hideManualEntry") : t("manualEntry");
});

for (const button of sortButtons) {
  button.addEventListener("click", () => {
    const nextKey = button.dataset.sortKey;

    if (sortState.key === nextKey) {
      sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
    } else {
      sortState = {
        key: nextKey,
        direction: textSortKeys.has(nextKey) ? "asc" : "desc"
      };
    }

    persistSortState();

    if (latestPortfolioData) {
      renderPortfolio(latestPortfolioData);
    }
  });
}

exportPortfolioJsonButton.addEventListener("click", () => {
  downloadFromEndpoint(
    "/api/export/portfolio.json",
    `portfolio-backup-${getTodayDateString()}.json`
  );
});

exportPortfolioCsvButton.addEventListener("click", () => {
  downloadFromEndpoint(
    "/api/export/portfolio.csv",
    `portfolio-table-${getTodayDateString()}.csv`
  );
});

exportHistoryCsvButton.addEventListener("click", () => {
  downloadFromEndpoint(
    "/api/export/history.csv",
    `portfolio-history-${getTodayDateString()}.csv`
  );
});

importPortfolioButton.addEventListener("click", () => {
  importPortfolioInput.click();
});

importPortfolioInput.addEventListener("change", async () => {
  const [file] = importPortfolioInput.files;

  if (!file) {
    return;
  }

  if (!window.confirm("The current portfolio will be replaced. Continue?")) {
    importPortfolioInput.value = "";
    return;
  }

  try {
    const fileText = await file.text();
    let parsedPortfolio;

    try {
      parsedPortfolio = JSON.parse(fileText);
    } catch (_error) {
      throw new Error("Invalid JSON file");
    }

    const response = await fetch("/api/import/portfolio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(parsedPortfolio)
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to import portfolio");
    }

    showUtilityMessage("Portfolio imported");
    await loadPortfolio();
  } catch (error) {
    showUtilityMessage(error.message, "error");
  } finally {
    importPortfolioInput.value = "";
  }
});

backupNowButton.addEventListener("click", async () => {
  try {
    const response = await fetch("/api/backup", {
      method: "POST"
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to create backup");
    }

    showUtilityMessage("Backup created");
  } catch (error) {
    showUtilityMessage(error.message, "error");
  }
});

refreshButton.addEventListener("click", loadPortfolio);
syncWalletButton.addEventListener("click", syncEthereumWallet);
manageWalletButton.addEventListener("click", () => walletManagerDialog.showModal());
walletForm.addEventListener("submit", addWallet);
walletTypeInput.addEventListener("change", updateWalletTypeFields);
updateWalletTypeFields();
walletScopeSelect.addEventListener("change", () => {
  selectedWalletScope = walletScopeSelect.value;
  localStorage.setItem("portfolioWalletScope", selectedWalletScope);
  void loadPortfolio();
});
showTinyAssetsToggle.addEventListener("change", () => {
  showTinyAssets = showTinyAssetsToggle.checked;
  localStorage.setItem("showTinyAssets", String(showTinyAssets));
  if (latestPortfolioData) renderPortfolio(latestPortfolioData);
});
allocationToggleButton.addEventListener("click", () => {
  allocationExpanded = !allocationExpanded;
  if (latestPortfolioData) renderAllocation(latestPortfolioData.allocation);
});
walletsCollapseButton.addEventListener("click", () => {
  if (!configuredWallets.length) return;
  walletsCollapsed = !walletsCollapsed;
  walletsCollapseStateInitialized = true;
  localStorage.setItem("cryptoPortfolio.walletsCollapsed", String(walletsCollapsed));
  updateWalletsCollapse(configuredWallets);
});
walletsList.addEventListener("click", async (event) => {
  const viewButton = event.target.closest(".wallet-view-button");
  const syncButton = event.target.closest(".wallet-sync-button");
  const menuButton = event.target.closest(".wallet-menu-button");
  const editButton = event.target.closest(".wallet-edit-button");
  const toggleButton = event.target.closest(".wallet-toggle-button");
  const removeButton = event.target.closest(".wallet-remove-button");

  try {
    if (menuButton) {
      const menu = menuButton.nextElementSibling;
      const willOpen = menu.classList.contains("hidden");
      closeWalletActionMenus(menu);
      menu.classList.toggle("hidden", !willOpen);
      menuButton.setAttribute("aria-expanded", String(willOpen));
    } else if (viewButton) {
      selectedWalletScope = viewButton.dataset.walletId;
      localStorage.setItem("portfolioWalletScope", selectedWalletScope);
      await loadPortfolio();
    } else if (syncButton) {
      await syncConfiguredWallet(syncButton.dataset.walletId, syncButton);
    } else if (editButton) {
      const wallet = latestPortfolioData?.wallet?.wallets.find(
        (item) => item.id === editButton.dataset.walletId
      );
      const name = window.prompt("Wallet name", wallet?.name || "");
      if (name !== null) await updateConfiguredWallet(editButton.dataset.walletId, { name });
    } else if (toggleButton) {
      await updateConfiguredWallet(toggleButton.dataset.walletId, {
        enabled: toggleButton.dataset.enabled !== "true"
      });
    } else if (removeButton) {
      await removeConfiguredWallet(removeButton.dataset.walletId, removeButton.dataset.walletName);
    }
  } catch (error) {
    showWalletsMessage(error.message, "error");
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".wallet-more-actions")) closeWalletActionMenus();
});
historyPeriodControls.addEventListener("click", (event) => {
  const button = event.target.closest("[data-history-period]");
  if (!button || !latestHistoryData.length) return;
  selectedHistoryPeriod = button.dataset.historyPeriod;
  renderHistory(latestHistoryData);
});
closeWalletManagerButton.addEventListener("click", () => walletManagerDialog.close());
closeTrackDialogButton.addEventListener("click", () => closeTrackDialog());
cancelTrackButton.addEventListener("click", () => closeTrackDialog());
confirmTrackButton.addEventListener("click", confirmTrackAsset);

discoveredTokenSearch.addEventListener("input", () => {
  if (latestPortfolioData?.wallet) {
    renderDiscoveredAssets(latestPortfolioData.wallet);
  }
});

function handleDiscoveredTrackClick(event) {
  const button = event.target.closest(".track-wallet-asset-button");
  if (button) openTrackDialog(button.dataset.walletAssetId);
}

suggestedAssetsList.addEventListener("click", handleDiscoveredTrackClick);
otherDiscoveredTokensList.addEventListener("click", handleDiscoveredTrackClick);

trackedAssetsList.addEventListener("click", async (event) => {
  const button = event.target.closest(".stop-tracking-button");
  if (button) await stopTracking(button.dataset.walletAssetId);
});

trackPortfolioAssetSelect.addEventListener("change", () => {
  if (trackPortfolioAssetSelect.value) {
    selectedTrackCoin = null;
    trackSelection.textContent = "";
    trackSelection.classList.add("hidden");
  }
  updateTrackConfirmation();
});

trackPriceSearch.addEventListener("input", () => {
  const query = trackPriceSearch.value.trim();
  selectedTrackCoin = null;
  trackSelection.textContent = "";
  trackSelection.classList.add("hidden");
  updateTrackConfirmation();
  window.clearTimeout(trackSearchTimeoutId);

  if (query.length < 2) {
    trackSearchResults.innerHTML = "";
    trackSearchResults.classList.add("hidden");
    return;
  }

  trackSearchTimeoutId = window.setTimeout(() => searchTrackPriceAssets(query), 250);
});

trackSearchResults.addEventListener("click", (event) => {
  const button = event.target.closest(".track-search-result");
  if (!button) return;

  selectedTrackCoin = {
    name: button.dataset.name,
    symbol: button.dataset.symbol,
    coingeckoId: button.dataset.coingeckoId,
    cmcId: Number(button.dataset.cmcId) || null,
    ethereumContract: button.dataset.ethereumContractAddress
      ? {
          chainId: Number(button.dataset.ethereumChainId),
          contractAddress: button.dataset.ethereumContractAddress,
          source: "coinmarketcap"
        }
      : null
  };
  trackPortfolioAssetSelect.value = "";
  trackSelection.textContent = `Selected priced asset: ${selectedTrackCoin.name} (${selectedTrackCoin.symbol})`;
  trackSelection.classList.remove("hidden");
  trackSearchResults.classList.add("hidden");
  updateTrackConfirmation();
});

deltaRangeSelect.value = selectedDeltaRange;
deltaRangeSelect.addEventListener("change", () => {
  selectedDeltaRange = deltaRangeSelect.value;
  localStorage.setItem("portfolioDeltaRange", selectedDeltaRange);
  renderPortfolioPerformance(latestPortfolioData?.totals);
});

const savedTheme = localStorage.getItem("theme") || "dark";
applyTheme(savedTheme);
themeSelect.addEventListener("change", () => {
  localStorage.setItem("theme", themeSelect.value);
  applyTheme(themeSelect.value);
});

loadPortfolio();

undefined
