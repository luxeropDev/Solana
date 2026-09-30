import { PmAmmClient } from "@pm-amm/sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { PROGRAM_ID, RPC_URL, USDC_MINT } from "@/lib/solana/constants";
import { keypairFromEnv, providerFromKeypair } from "@/lib/solana/serverWallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALMATY = { latitude: 43.238949, longitude: 76.889709 };

function isAuthorized(request: Request) {
  const expected = process.env.ORACLE_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

async function readAlmatyAqi() {
  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.searchParams.set("latitude", String(ALMATY.latitude));
  url.searchParams.set("longitude", String(ALMATY.longitude));
  url.searchParams.set("current", "us_aqi");
  url.searchParams.set("timezone", "Asia/Almaty");

  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`AQI provider returned ${response.status}`);
  const payload = (await response.json()) as { current?: { us_aqi?: number; time?: string } };
  const aqi = payload.current?.us_aqi;
  if (!Number.isFinite(aqi)) throw new Error("AQI provider returned an invalid reading");
  return { aqi: Number(aqi), observedAt: payload.current?.time ?? new Date().toISOString() };
}

async function resolve(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const marketAddress = process.env.ORACLE_MARKET_ADDRESS ?? process.env.NEXT_PUBLIC_MARKET_ADDRESS;
    if (!marketAddress) throw new Error("ORACLE_MARKET_ADDRESS is not configured");

    const market = new PublicKey(marketAddress);
    const threshold = Number(process.env.ORACLE_THRESHOLD ?? 150);
    if (!Number.isFinite(threshold)) throw new Error("ORACLE_THRESHOLD must be a number");

    const connection = new Connection(RPC_URL, "confirmed");
    const readClient = PmAmmClient.readOnly(connection, PROGRAM_ID, USDC_MINT);
    const account = await readClient.fetchMarket(market);
    if (!account) return NextResponse.json({ error: "Market not found" }, { status: 404 });
    if (account.resolved) {
      return NextResponse.json({ status: "already-resolved", winningSide: account.winningSide });
    }

    const now = Math.floor(Date.now() / 1_000);
    const endTs = account.endTs.toNumber();
    if (now < endTs) {
      return NextResponse.json({ status: "not-expired", endTs, secondsRemaining: endTs - now });
    }

    const observation = await readAlmatyAqi();
    const side = observation.aqi > threshold ? "yes" : "no";
    const builder = keypairFromEnv();
    if (!account.authority.equals(builder.publicKey)) {
      return NextResponse.json({ error: "Builder key is not the market authority" }, { status: 403 });
    }

    const provider = providerFromKeypair(connection, builder);
    const client = PmAmmClient.fromProvider(provider, PROGRAM_ID, USDC_MINT);
    const signature = await client.send.resolveMarket(market, side);

    return NextResponse.json({
      status: "resolved",
      market: market.toBase58(),
      side,
      threshold,
      ...observation,
      signature,
    });
  } catch (error) {
    console.error("Oracle resolution failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Oracle resolution failed" },
      { status: 500 },
    );
  }
}

export const POST = resolve;
export const GET = resolve; // convenient for protected cron services
