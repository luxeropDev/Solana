# AUA Market — Almaty CleanAir & Weather Hedge

Hackathon-ready Solana devnet prediction market UI powered by `@pm-amm/sdk`.

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Set `NEXT_PUBLIC_MARKET_ADDRESS` to the deployed binary market. The UI can also discover an existing market whose on-chain name contains `Almaty` or `AQI`.

## Server configuration

- `BUILDER_PRIVATE_KEY`: market-authority keypair, either base58 or a JSON byte array. It never reaches browser code.
- `ORACLE_MARKET_ADDRESS`: exact market resolved by the oracle.
- `ORACLE_THRESHOLD`: defaults to `150` US AQI.
- `ORACLE_SECRET`: bearer token required by `/api/oracle/resolve` in production.
- `FAUCET_USDC_AMOUNT`: target mock-USDC balance for a new burner wallet, capped at 100.

The builder wallet must be the market authority, hold enough SOL to pay fees, and hold the configured devnet mock USDC for the faucet route.

Call `POST /api/oracle/resolve` from a cron service after the market deadline with `Authorization: Bearer <ORACLE_SECRET>`. Calls are idempotent: an already-resolved or not-yet-expired market is not submitted again.

## Amount safety

The SDK receives raw 6-decimal values only for `send.swap` and `send.redeemPair`. The rest of `send.*` uses human-readable USDC. Buy quotes are computed in `pm-amm-helpers.ts`, include the protocol's 2% buy-side fee, and apply a 1% minimum-output margin.
