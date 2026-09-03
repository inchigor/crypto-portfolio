(function attachPortfolioUi(globalScope) {
  const strings = Object.freeze({
    walletSyncFailed: "Failed to sync wallet",
    priceSourceCmc: "CoinMarketCap online",
    priceSourceCoingecko: "CoinGecko online",
    priceSourceCache: "Cached prices",
    priceSourceNone: "No data",
    nativeEth: "Native ETH",
    openInBlockscout: "Open in Blockscout",
    noTrackedAssets: "No tracked assets",
    noWalletData: "No wallet data",
    walletUnavailable: "Unavailable",
    walletNotConfigured: "Wallet not configured",
    walletNotSynced: "Not synced",
    walletSynced: "Synced",
    walletStale: "Data is stale",
    ethereumWallet: "Automatic · Ethereum",
    manual: "Manual",
    priced: "Priced",
    unpriced: "Unpriced",
    balance: "Balance",
    price: "Price",
    value: "Value",
    contract: "Contract",
    discovered: "Discovered",
    previouslyStopped: "Previously stopped",
    noTrackedEthereumAssets: "No tracked Ethereum assets.",
    noVerifiedSuggestions: "No contract-verified suggestions.",
    noMatchingTokens: "No matching tokens.",
    noOtherTokens: "No other discovered tokens.",
    exactMatch: "Exact match",
    contractMismatch: "Contract mismatch",
    possibleSpam: "Potential spam token",
    exactContract: "Exact contract",
    contractUnverified: "Contract unverified",
    stopTracking: "Stop tracking",
    advancedTrack: "Advanced tracking",
    track: "Track",
    unknownError: "Could not complete the operation.",
    priceProvidersUnavailable: "Price providers are unavailable",
    historyUnavailable: "History is currently unavailable.",
    noHistory: "No history yet",
    noPreviousSnapshot: "No previous snapshot",
    historyNotEnough: "Not enough history yet. A snapshot will be saved after prices load.",
    noPricedAssets: "No priced assets yet.",
    save: "Save",
    addBuy: "Add purchase",
    delete: "Delete",
    confirm: "Confirm",
    cancel: "Cancel",
    selected: "Selected",
    manualEntry: "Manual entry",
    hideManualEntry: "Hide manual entry",
    refreshPrices: "Refresh prices",
    refreshing: "Refreshing…",
    syncing: "Syncing…",
    disconnect: "Stop",
    saveCompact: "Save",
    addBuyCompact: "+",
    noData: "No data"
  });

  function t(key, values = {}) {
    const template = strings[key] || key;
    return template.replace(/\{(\w+)\}/g, (_match, name) => String(values[name] ?? ""));
  }

  function roundDecimal(fullValue, fractionDigits) {
    const [whole, fraction = ""] = String(fullValue ?? "0").split(".");
    const kept = fraction.padEnd(fractionDigits, "0").slice(0, fractionDigits);
    const rounded = fraction[fractionDigits] >= "5"
      ? (BigInt(`${whole}${kept}`) + 1n).toString().padStart(fractionDigits + 1, "0")
      : `${whole}${kept}`;
    const roundedWhole = rounded.slice(0, -fractionDigits) || "0";
    const roundedFraction = rounded.slice(-fractionDigits).replace(/0+$/, "");
    return roundedFraction ? `${roundedWhole}.${roundedFraction}` : roundedWhole;
  }

  function compactDecimal(fullValue, maxFractionDigits = 5) {
    const [whole, fraction = ""] = String(fullValue ?? "0").split(".");
    const compactWhole = whole.length > 18 ? `${whole.slice(0, 12)}…${whole.slice(-4)}` : whole;
    if (whole !== "0" || !fraction || /^0{0,2}[1-9]/.test(fraction)) {
      const rounded = roundDecimal(`${whole}.${fraction}`, maxFractionDigits);
      const [roundedWhole, roundedFraction = ""] = rounded.split(".");
      return `${roundedWhole.length > 18 ? `${roundedWhole.slice(0, 12)}…${roundedWhole.slice(-4)}` : roundedWhole}${roundedFraction ? `.${roundedFraction}` : ""}`;
    }
    const firstSignificant = fraction.search(/[1-9]/);
    if (firstSignificant === -1) return "0";
    const significant = fraction.slice(firstSignificant, firstSignificant + maxFractionDigits);
    const hasTail = /[1-9]/.test(fraction.slice(firstSignificant + maxFractionDigits));
    if (firstSignificant > 8) {
      return `0.${"0".repeat(8)}…${fraction.slice(-4)}`;
    }
    return `0.${"0".repeat(firstSignificant)}${significant}${hasTail ? "…" : ""}`;
  }

  function formatTokenAmount(value) {
    const full = String(value ?? "").trim();
    if (!/^\d+(?:\.\d+)?$/.test(full)) return { display: t("noData"), full: null };
    return { display: compactDecimal(full), full };
  }

  function formatWalletAmount(value) {
    const full = String(value ?? "").trim();
    if (!/^\d+(?:\.\d+)?$/.test(full)) return { display: t("noData"), full: null };

    const [whole] = full.split(".");
    if (BigInt(whole) >= 1n) {
      const rounded = roundDecimal(full, 2);
      const [roundedWhole, roundedFraction = ""] = rounded.split(".");
      return {
        display: `${roundedWhole}.${roundedFraction.padEnd(2, "0")}`,
        full
      };
    }

    return { display: compactDecimal(full), full };
  }

  const historyPeriodDefinitions = Object.freeze([
    { key: "1M", months: 1 },
    { key: "3M", months: 3 },
    { key: "6M", months: 6 },
    { key: "1Y", months: 12 }
  ]);

  function parseHistoryDate(value) {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function historyPeriodStart(endDate, months) {
    const start = new Date(endDate);
    start.setUTCMonth(start.getUTCMonth() - months);
    return start;
  }

  function validHistorySnapshots(history) {
    return (Array.isArray(history) ? history : [])
      .filter((item) => typeof item?.date === "string" && typeof item?.totalUsd === "number")
      .sort((first, second) => first.date.localeCompare(second.date));
  }

  function availableHistoryPeriods(history) {
    const snapshots = validHistorySnapshots(history);
    if (!snapshots.length) return [];

    const start = parseHistoryDate(snapshots[0].date);
    const end = parseHistoryDate(snapshots.at(-1).date);
    if (!start || !end) return ["ALL"];

    return [
      ...historyPeriodDefinitions
        .filter(({ months }) => start <= historyPeriodStart(end, months))
        .map(({ key }) => key),
      "ALL"
    ];
  }

  function selectHistoryPeriod(history, period) {
    const snapshots = validHistorySnapshots(history);
    if (!snapshots.length || period === "ALL") return snapshots;

    const definition = historyPeriodDefinitions.find(({ key }) => key === period);
    const end = parseHistoryDate(snapshots.at(-1)?.date);
    if (!definition || !end) return snapshots;

    const start = historyPeriodStart(end, definition.months);
    const selected = snapshots.filter((item) => parseHistoryDate(item.date) >= start);
    return selected.length >= 2 ? selected : snapshots;
  }

  function splitForColumns(items) {
    const midpoint = Math.ceil(items.length / 2);
    return [items.slice(0, midpoint), items.slice(midpoint)];
  }

  function nextNiceStep(step) {
    const exponent = Math.floor(Math.log10(step));
    const magnitude = 10 ** exponent;
    const fraction = step / magnitude;
    const nextFraction = [1, 2, 2.5, 5, 10].find((candidate) => candidate > fraction + Number.EPSILON) || 10;
    return nextFraction * magnitude;
  }

  function niceChartTicks(minValue, maxValue, targetCount = 5) {
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      return { min: 0, max: 1, step: 1, ticks: [0, 1] };
    }

    const range = maxValue - minValue || Math.max(Math.abs(maxValue) * 0.1, 1);
    const dataMin = minValue === maxValue ? minValue - range / 2 : minValue;
    const dataMax = minValue === maxValue ? maxValue + range / 2 : maxValue;
    const rawStep = range / Math.max(targetCount - 1, 1);
    const exponent = Math.floor(Math.log10(rawStep));
    const magnitude = 10 ** exponent;
    const fraction = rawStep / magnitude;
    let step = ([1, 2, 2.5, 5, 10].find((candidate) => candidate >= fraction) || 10) * magnitude;
    let lower = Math.floor(dataMin / step) * step;
    let upper = Math.ceil(dataMax / step) * step;
    let count = Math.round((upper - lower) / step) + 1;

    while (count > 6) {
      step = nextNiceStep(step);
      lower = Math.floor(dataMin / step) * step;
      upper = Math.ceil(dataMax / step) * step;
      count = Math.round((upper - lower) / step) + 1;
    }

    const ticks = Array.from({ length: count }, (_value, index) => lower + step * index);
    return { min: lower, max: upper, step, ticks };
  }

  function portfolioPerformanceForRange(totals, range) {
    const key = { "24h": "change24h", "7d": "change7d", "30d": "change30d" }[range] || "change24h";
    const value = totals?.[key];
    return typeof value === "number" ? value : null;
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "medium"
    }).format(date);
  }

  globalScope.PortfolioUi = {
    strings,
    t,
    compactDecimal,
    formatTokenAmount,
    formatWalletAmount,
    availableHistoryPeriods,
    selectHistoryPeriod,
    splitForColumns,
    niceChartTicks,
    formatDate,
    portfolioPerformanceForRange
  };
  if (typeof module !== "undefined") module.exports = globalScope.PortfolioUi;
})(typeof window === "undefined" ? globalThis : window);
