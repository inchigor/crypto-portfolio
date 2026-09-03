# Crypto Portfolio

A local-first crypto portfolio tracker built with Node.js, Express, and vanilla JavaScript. It keeps portfolio data on your computer while using market-data providers for prices and search, plus optional read-only EVM wallet synchronization.

## Features

- CoinMarketCap price and coin-search provider, with CoinGecko fallback
- Blockscout read-only EVM sync for multiple addresses
- Manual wallets and holdings, including wallet-specific portfolio scopes
- Portfolio allocation, performance, and history
- JSON and CSV export, local backups, and validated JSON import
- Light and dark themes

## Privacy and security

- The app binds only to `127.0.0.1`; it has no accounts or remote dashboard.
- **IMPORTANT:** This application is designed to run locally on `127.0.0.1`. Do not expose it directly to the public Internet or an untrusted network.
- It does not use WalletConnect, request signatures, request seed phrases or private keys, or submit transactions.
- EVM addresses are sent to the configured Blockscout instance when you choose to sync.
- Search and price requests are sent to CoinMarketCap and/or CoinGecko.
- Portfolio, history, wallet, and configuration data are stored locally.
- Manual backups can contain wallet addresses and holdings. Treat them as sensitive.
- Never commit `.env`, runtime data, or backups.

## Setup

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env
# Add your own provider API keys to .env
npm start
```

Then open [http://127.0.0.1:3002](http://127.0.0.1:3002).

Run the test suite with:

```bash
npm test
```

## Local data

Runtime files in `data/` are intentionally ignored by Git. The checked-in `*.example.json` files are synthetic templates only. Do not put real addresses, balances, exports, or backups into source control.

## License

MIT. See [LICENSE](LICENSE).
