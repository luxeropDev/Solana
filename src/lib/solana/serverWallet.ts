import "server-only";

import { AnchorProvider, type Wallet } from "@anchor-lang/core";
import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";

export function keypairFromEnv(value = process.env.BUILDER_PRIVATE_KEY) {
  if (!value) throw new Error("BUILDER_PRIVATE_KEY is not configured");
  const trimmed = value.trim();
  const secret = trimmed.startsWith("[")
    ? Uint8Array.from(JSON.parse(trimmed) as number[])
    : bs58.decode(trimmed);
  return Keypair.fromSecretKey(secret);
}

export function providerFromKeypair(connection: AnchorProvider["connection"], keypair: Keypair) {
  // @anchor-lang/core@1 exposes Wallet as a TypeScript type but not a stable
  // runtime ESM constructor, so use the minimal wallet contract explicitly.
  const wallet: Wallet = {
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
  return new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}
