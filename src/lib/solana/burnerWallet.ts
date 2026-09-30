"use client";

import { Keypair, LAMPORTS_PER_SOL, type Connection } from "@solana/web3.js";
import bs58 from "bs58";

const STORAGE_KEY = "aua-market:burner-secret:v1";
const MIN_SOL = 0.35;
const AIRDROP_SOL = 1;

export function loadBurnerWallet(): Keypair | null {
  if (typeof window === "undefined") return null;
  const encoded = window.localStorage.getItem(STORAGE_KEY);
  if (!encoded) return null;
  try {
    return Keypair.fromSecretKey(bs58.decode(encoded));
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function getOrCreateBurnerWallet(): Keypair {
  if (typeof window === "undefined") throw new Error("Burner wallet is available only in the browser");
  const existing = loadBurnerWallet();
  if (existing) return existing;

  const wallet = Keypair.generate();
  window.localStorage.setItem(STORAGE_KEY, bs58.encode(wallet.secretKey));
  return wallet;
}

export async function requestDevnetSol(connection: Connection, wallet: Keypair, force = false) {
  const balance = await connection.getBalance(wallet.publicKey, "confirmed");
  if (!force && balance >= MIN_SOL * LAMPORTS_PER_SOL) return null;

  const signature = await connection.requestAirdrop(wallet.publicKey, AIRDROP_SOL * LAMPORTS_PER_SOL);
  const latest = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  return signature;
}

// The browser never receives the mint/faucet authority. The server route transfers
// mock devnet USDC from the builder wallet when it is configured and funded.
export async function requestDevnetUsdc(wallet: Keypair) {
  const response = await fetch("/api/faucet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: wallet.publicKey.toBase58() }),
  });
  if (!response.ok) throw new Error((await response.json()).error ?? "USDC faucet is unavailable");
  return response.json() as Promise<{ signature: string; amount: number }>;
}

export async function ensureDevnetFunding(connection: Connection, wallet: Keypair) {
  const results = await Promise.allSettled([
    requestDevnetSol(connection, wallet),
    requestDevnetUsdc(wallet),
  ]);
  return results;
}
