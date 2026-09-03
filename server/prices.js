const priceCache = new Map();
const cacheTtlMs = 60 * 1000;
const coinMapCacheTtlMs = 10 * 60 * 1000;
let coinMapCache = {
  data: null,
  cachedAt: 0
};
let hasLoggedDemoAuth = false;
const providerRequestTimeoutMs = 8 * 1000;
const providerRequestMaxAttempts = 2;
const providerRetryDelayMs = 300;

function providerRetryDelay(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function shouldRetryProviderRequest(error) {
  const status = Number(error?.status);

  if (Number.isFinite(status)) {
    return status === 429 || (status >= 500 && status <= 599);
  }

  return error?.nonRetryable !== true;
}

async function fetchJsonWithRetry(url, {
  headers = {},
  fetchImpl = global.fetch,
  timeoutMs = providerRequestTimeoutMs,
  maxAttempts = providerRequestMaxAttempts,
  delayImpl = providerRetryDelay,
  validate = null
} = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        headers,
        signal: controller.signal
      });

      if (!response.ok) {
        const error = new Error(`Provider request failed with status ${response.status}`);
        error.status = response.status;
        throw error;
      }

      try {
        const data = await response.json();

        if (validate) {
          validate(data);
        }

        return data;
      } catch (error) {
        error.nonRetryable = true;
        throw error;
      }
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetryProviderRequest(error)) {
        throw error;
      }

      await delayImpl(providerRetryDelayMs);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError;
}

function extractEthereumContractMetadata(coin) {
  const platform = coin?.platform;
  const contractAddress = String(platform?.token_address || "").trim();
  const isEthereum =
    Number(platform?.id) === 1027 ||
    String(platform?.slug || "").toLowerCase() === "ethereum";

  if (!isEthereum || !/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
    return null;
  }

  return {
    chainId: 1,
    contractAddress,
    source: "coinmarketcap",
    cmcId: Number(coin.id) || null
  };
}

function mapCoinMarketCapSearchResult(coin) {
  return {
    name: coin.name,
    symbol: coin.symbol,
    cmcId: coin.id,
    rank: coin.rank ?? null,
    coingeckoId: coin.slug || slugify(`${coin.name}-${coin.symbol}`),
    slug: coin.slug || null,
    ethereumContract: extractEthereumContractMetadata(coin)
  };
}

function getCacheKey(coingeckoIds) {
  return [...new Set(coingeckoIds)].sort().join(",");
}

function getSymbolKey(assets) {
  return [...new Set(assets.map((asset) => String(asset.symbol || "").trim().toUpperCase()).filter(Boolean))]
    .sort()
    .join(",");
}

function getCmcIdKey(assets) {
  return [...new Set(assets.map((asset) => asset.cmcId).filter(Boolean))].sort((a, b) => a - b).join(",");
}

function getCoinGeckoHeaders() {
  const headers = {};

  if (process.env.COINGECKO_API_KEY) {
    headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;

    if (!hasLoggedDemoAuth) {
      console.log("CoinGecko auth: demo header enabled");
      hasLoggedDemoAuth = true;
    }
  }

  return headers;
}

function getCoinMarketCapHeaders() {
  const headers = {};

  if (process.env.COINMARKETCAP_API_KEY) {
    headers["X-CMC_PRO_API_KEY"] = process.env.COINMARKETCAP_API_KEY;
  }

  return headers;
}

function logProviderKeysStatus() {
  console.log(`CoinMarketCap key loaded: ${Boolean(process.env.COINMARKETCAP_API_KEY)}`);
  console.log(`CoinGecko key loaded: ${Boolean(process.env.COINGECKO_API_KEY)}`);
}

function buildCoinGeckoPrices(marketData) {
  const pricesById = {};

  for (const coin of marketData) {
    pricesById[coin.id] = {
      currentPriceUsd: coin.current_price ?? null,
      change24h: coin.price_change_percentage_24h_in_currency ?? coin.price_change_percentage_24h ?? null,
      change7d: coin.price_change_percentage_7d_in_currency ?? null,
      change30d: coin.price_change_percentage_30d_in_currency ?? null
    };
  }

  return pricesById;
}

function buildCoinMarketCapPrices(data, assets) {
  const pricesById = {};
  const assetsBySymbol = new Map();
  const assetsByCmcId = new Map();

  for (const asset of assets) {
    assetsBySymbol.set(String(asset.symbol || "").trim().toUpperCase(), asset);

    if (asset.cmcId) {
      assetsByCmcId.set(String(asset.cmcId), asset);
    }
  }

  for (const [key, rawValue] of Object.entries(data || {})) {
    const coin = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    const asset =
      assetsByCmcId.get(String(coin?.id || key)) ||
      assetsBySymbol.get(String(coin?.symbol || key).toUpperCase());
    const quote = coin?.quote?.USD;

    if (!asset || !quote) {
      continue;
    }

    pricesById[asset.coingeckoId] = {
      currentPriceUsd: quote.price ?? null,
      change24h: quote.percent_change_24h ?? null,
      change7d: quote.percent_change_7d ?? null,
      change30d: quote.percent_change_30d ?? null
    };
  }

  return pricesById;
}

async function fetchCoinMarketCapPrices(assets) {
  if (!assets.length || !process.env.COINMARKETCAP_API_KEY) {
    return null;
  }

  const assetsWithCmcId = assets.filter((asset) => asset.cmcId);
  const assetsWithoutCmcId = assets.filter((asset) => !asset.cmcId);
  const requestGroups = [];

  const cmcIdKey = getCmcIdKey(assetsWithCmcId);
  const symbolKey = getSymbolKey(assetsWithoutCmcId);

  if (cmcIdKey) {
    requestGroups.push(new URLSearchParams({ id: cmcIdKey, convert: "USD" }));
  }

  if (symbolKey) {
    requestGroups.push(new URLSearchParams({ symbol: symbolKey, convert: "USD" }));
  }

  const combinedPricesById = {};

  for (const params of requestGroups) {
    const data = await fetchJsonWithRetry(
      `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?${params}`,
      {
        headers: getCoinMarketCapHeaders()
      }
    );
    Object.assign(combinedPricesById, buildCoinMarketCapPrices(data.data, assets));
  }

  return {
    pricesById: combinedPricesById,
    updatedAt: new Date().toISOString()
  };
}

async function getCoinMarketCapMap() {
  const now = Date.now();

  if (coinMapCache.data && now - coinMapCache.cachedAt <= coinMapCacheTtlMs) {
    return coinMapCache.data;
  }

  if (!process.env.COINMARKETCAP_API_KEY) {
    throw new Error("CoinMarketCap API key is missing");
  }

  const params = new URLSearchParams({
    listing_status: "active",
    limit: "5000"
  });

  const data = await fetchJsonWithRetry(
    `https://pro-api.coinmarketcap.com/v1/cryptocurrency/map?${params}`,
    {
      headers: getCoinMarketCapHeaders()
    }
  );
  coinMapCache = {
    data: data.data || [],
    cachedAt: now
  };

  return coinMapCache.data;
}

async function searchCoinMarketCapCoins(query) {
  const normalizedQuery = String(query || "").trim();

  if (!normalizedQuery) {
    return {
      coins: [],
      error: null
    };
  }

  try {
    const coinMap = await getCoinMarketCapMap();
    const upperQuery = normalizedQuery.toUpperCase();
    const lowerQuery = normalizedQuery.toLowerCase();
    const symbolLike = /^[A-Z0-9$@-]{2,10}$/i.test(normalizedQuery);

    const matches = coinMap
      .filter((coin) =>
        symbolLike
          ? coin.symbol?.toUpperCase().includes(upperQuery)
          : coin.name?.toLowerCase().includes(lowerQuery) ||
            coin.symbol?.toLowerCase().includes(lowerQuery)
      )
      .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))
      .slice(0, 8)
      .map(mapCoinMarketCapSearchResult);

    return {
      coins: matches,
      error: null
    };
  } catch (error) {
    return {
      coins: [],
      error: error.message
    };
  }
}

async function getEthereumContractMetadataForAssets(assets) {
  const assetsWithCmcId = assets.filter((asset) => asset.cmcId);

  if (!assetsWithCmcId.length) {
    return { contractsByAssetId: {}, error: null };
  }

  try {
    const coinMap = await getCoinMarketCapMap();
    const coinsById = new Map(coinMap.map((coin) => [String(coin.id), coin]));
    const contractsByAssetId = {};

    for (const asset of assetsWithCmcId) {
      const metadata = extractEthereumContractMetadata(coinsById.get(String(asset.cmcId)));

      if (metadata) {
        contractsByAssetId[asset.id] = metadata;
      }
    }

    return { contractsByAssetId, error: null };
  } catch (error) {
    return { contractsByAssetId: {}, error: error.message };
  }
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchPrices(assets) {
  if (!assets.length) {
    return {
      pricesById: {},
      updatedAt: null,
      error: null,
      priceSource: "none",
      priceWarning: null
    };
  }

  const coingeckoIds = assets.map((asset) => asset.coingeckoId);
  const cacheKey = getCacheKey(coingeckoIds);
  const cachedEntry = priceCache.get(cacheKey);
  const now = Date.now();

  if (cachedEntry && now - cachedEntry.cachedAt <= cacheTtlMs) {
    console.log("Price provider used: cache");
    return {
      pricesById: cachedEntry.pricesById,
      updatedAt: cachedEntry.updatedAt,
      error: null,
      priceSource: "cache",
      priceWarning: null
    };
  }

  logProviderKeysStatus();

  let coinMarketCapResult = null;

  try {
    coinMarketCapResult = await fetchCoinMarketCapPrices(assets);

    if (
      coinMarketCapResult &&
      Object.keys(coinMarketCapResult.pricesById).length === assets.length
    ) {
      const liveEntry = {
        pricesById: coinMarketCapResult.pricesById,
        updatedAt: coinMarketCapResult.updatedAt,
        cachedAt: now
      };

      priceCache.set(cacheKey, liveEntry);
      console.log("Price provider used: coinmarketcap");

      return {
        pricesById: liveEntry.pricesById,
        updatedAt: liveEntry.updatedAt,
        error: null,
        priceSource: "coinmarketcap-live",
        priceWarning: null
      };
    }
  } catch (_coinMarketCapError) {
    // Fall through to CoinGecko fallback.
  }

  const params = new URLSearchParams({
    vs_currency: "usd",
    ids: cacheKey,
    price_change_percentage: "24h,7d,30d"
  });

  const headers = getCoinGeckoHeaders();

  try {
    const marketData = await fetchJsonWithRetry(
      `https://api.coingecko.com/api/v3/coins/markets?${params}`,
      { headers }
    );
    const pricesById = {
      ...buildCoinGeckoPrices(marketData),
      ...(coinMarketCapResult?.pricesById || {})
    };

    const liveEntry = {
      pricesById,
      updatedAt: new Date().toISOString(),
      cachedAt: now
    };

    priceCache.set(cacheKey, liveEntry);
    console.log("Price provider used: coingecko");

    return {
      pricesById: liveEntry.pricesById,
      updatedAt: liveEntry.updatedAt,
      error: null,
      priceSource: "coingecko-live",
      priceWarning: null
    };
  } catch (error) {
    if (coinMarketCapResult && Object.keys(coinMarketCapResult.pricesById).length > 0) {
      const liveEntry = {
        pricesById: coinMarketCapResult.pricesById,
        updatedAt: coinMarketCapResult.updatedAt,
        cachedAt: now
      };

      priceCache.set(cacheKey, liveEntry);
      console.log("Price provider used: coinmarketcap");

      return {
        pricesById: liveEntry.pricesById,
        updatedAt: liveEntry.updatedAt,
        error: null,
        priceSource: "coinmarketcap-live",
        priceWarning: null
      };
    }

    if (cachedEntry) {
      console.log("Price provider used: stale-cache");
      return {
        pricesById: cachedEntry.pricesById,
        updatedAt: cachedEntry.updatedAt,
        error: null,
        priceSource: "stale-cache",
        priceWarning: `Both live providers unavailable. Showing cached prices from ${cachedEntry.updatedAt}.`
      };
    }

    console.log("Price provider used: none");
    return {
      pricesById: {},
      updatedAt: null,
      error: error.message,
      priceSource: "none",
      priceWarning: "No live price provider returned prices."
    };
  }
}

async function searchCoins(query) {
  const normalizedQuery = String(query || "").trim();

  if (!normalizedQuery) {
    return {
      coins: [],
      error: null
    };
  }

  const params = new URLSearchParams({
    query: normalizedQuery
  });

  const headers = getCoinGeckoHeaders();

  try {
    const searchData = await fetchJsonWithRetry(
      `https://api.coingecko.com/api/v3/search?${params}`,
      { headers }
    );
    const coins = (searchData.coins || []).slice(0, 8).map((coin) => ({
      name: coin.name,
      symbol: coin.symbol,
      coingeckoId: coin.id
    }));

    return {
      coins,
      error: null
    };
  } catch (error) {
    return {
      coins: [],
      error: error.message
    };
  }
}

function getProviderHealth() {
  return {
    coingeckoKeyLoaded: Boolean(process.env.COINGECKO_API_KEY),
    coinmarketcapKeyLoaded: Boolean(process.env.COINMARKETCAP_API_KEY),
    providersOrder: ["coinmarketcap", "coingecko"]
  };
}

module.exports = {
  fetchPrices,
  searchCoins,
  searchCoinMarketCapCoins,
  getEthereumContractMetadataForAssets,
  extractEthereumContractMetadata,
  mapCoinMarketCapSearchResult,
  fetchJsonWithRetry,
  getProviderHealth
};
