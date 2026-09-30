"use client";

import { AnchorProvider, type Wallet } from "@anchor-lang/core";
import { PmAmmClient, type MarketAccount } from "@pm-amm/sdk";
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { PROGRAM_ID, RPC_URL, USDC_DECIMALS, USDC_MINT } from "./constants";
import { quoteBuy, type BuySide } from "./pm-amm-helpers";

export const connection = new Connection(RPC_URL, "confirmed");
export const readOnlyPmClient = PmAmmClient.readOnly(connection, PROGRAM_ID, USDC_MINT);

function keypairWallet(keypair: Keypair): Wallet {
  return {
    publicKey: keypair.publicKey,
    payer: keypair,
    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      if (tx instanceof VersionedTransaction) tx.sign([keypair]);
      else tx.partialSign(keypair);
      return tx;
    },
    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
      return Promise.all(txs.map((tx) => this.signTransaction(tx)));
    },
  };
}

export function createSigningPmClient(keypair: Keypair) {
  const provider = new AnchorProvider(connection, keypairWallet(keypair), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  return PmAmmClient.fromProvider(provider, PROGRAM_ID, USDC_MINT);
}

export function usdcToRaw(amountUsdc: number) {
  const raw = Math.round(amountUsdc * 10 ** USDC_DECIMALS);
  if (!Number.isSafeInteger(raw) || raw <= 0) throw new Error("Enter a valid USDC amount");
  return raw;
}

export async function buyPosition(args: {
  wallet: Keypair;
  market: PublicKey;
  marketAccount: MarketAccount;
  side: BuySide;
  amountUsdc: number;
  slippageBps?: number;
}) {
  const amountInMicro = usdcToRaw(args.amountUsdc);
  const quote = quoteBuy(args.marketAccount, args.side, amountInMicro, args.slippageBps);
  const direction = args.side === "yes" ? "usdcToYes" : "usdcToNo";
  const client = createSigningPmClient(args.wallet);

  // IMPORTANT: swap takes raw 6-decimal values, not human USDC.
  const signature = await client.send.swap(args.market, direction, amountInMicro, quote.minOutputMicro);
  return { signature, quote };
}

export async function redeemPair(wallet: Keypair, market: PublicKey, amountTokens: number) {
  const amountMicro = usdcToRaw(amountTokens);
  // IMPORTANT: redeemPair is the second send.* exception: its amount is raw.
  return createSigningPmClient(wallet).send.redeemPair(market, amountMicro);
}

export async function claimWinnings(wallet: Keypair, market: PublicKey) {
  // claimWinnings does not take an amount; the program claims the eligible balance.
  return createSigningPmClient(wallet).send.claimWinnings(market);
}
