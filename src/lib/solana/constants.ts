import { PublicKey } from "@solana/web3.js";

export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PM_AMM_PROGRAM_ID ?? "GV1FMGHRYBjQLaghE5fnGuYCuCcpdt3GD5xEX3TwN16y",
);
export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ?? "3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ",
);
export const USDC_DECIMALS = 6;
export const POLL_INTERVAL_MS = 15_000;
