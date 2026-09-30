import { getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount, transfer } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { RPC_URL, USDC_DECIMALS, USDC_MINT } from "@/lib/solana/constants";
import { keypairFromEnv } from "@/lib/solana/serverWallet";
import { Connection } from "@solana/web3.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const connection = new Connection(RPC_URL, "confirmed");
const recentRequests = new Map<string, number>();
const COOLDOWN_MS = 60_000;

export async function POST(request: Request) {
  try {
    const { address } = (await request.json()) as { address?: string };
    if (!address) return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });

    const recipient = new PublicKey(address);
    const now = Date.now();
    const lastRequest = recentRequests.get(recipient.toBase58()) ?? 0;
    if (now - lastRequest < COOLDOWN_MS) {
      return NextResponse.json({ error: "Faucet cooldown is active" }, { status: 429 });
    }

    const builder = keypairFromEnv();
    const targetAmount = Math.max(1, Math.min(100, Number(process.env.FAUCET_USDC_AMOUNT ?? 25)));
    const targetRaw = BigInt(Math.round(targetAmount * 10 ** USDC_DECIMALS));
    const recipientAtaAddress = await getAssociatedTokenAddress(USDC_MINT, recipient);
    const existing = await connection.getTokenAccountBalance(recipientAtaAddress, "confirmed").catch(() => null);
    const existingRaw = BigInt(existing?.value.amount ?? "0");

    if (existingRaw >= targetRaw) {
      return NextResponse.json({ signature: "already-funded", amount: 0 });
    }

    const sourceAta = await getOrCreateAssociatedTokenAccount(connection, builder, USDC_MINT, builder.publicKey);
    const recipientAta = await getOrCreateAssociatedTokenAccount(connection, builder, USDC_MINT, recipient);
    const amountRaw = targetRaw - existingRaw;
    const signature = await transfer(connection, builder, sourceAta.address, recipientAta.address, builder, amountRaw);
    recentRequests.set(recipient.toBase58(), now);

    return NextResponse.json({ signature, amount: Number(amountRaw) / 10 ** USDC_DECIMALS });
  } catch (error) {
    console.error("Devnet faucet failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Devnet faucet failed" },
      { status: 500 },
    );
  }
}
