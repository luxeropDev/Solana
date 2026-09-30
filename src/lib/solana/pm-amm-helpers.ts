import type { MarketAccount } from "@pm-amm/sdk";
import { SWAP_FEE_BPS } from "@pm-amm/sdk";
import { estimateSwapOutput, i80f48ToNumber, priceFromReserves } from "@pm-amm/sdk/math";

const BPS = 10_000;
const DEFAULT_SLIPPAGE_BPS = 100; // 1%

export type BuySide = "yes" | "no";

export function effectiveLiquidity(market: MarketAccount, now = Math.floor(Date.now() / 1_000)) {
  const remainingSecs = Math.max(0, market.endTs.toNumber() - now);
  return i80f48ToNumber(market.lZero) * Math.sqrt(remainingSecs);
}

export function marketProbability(market: MarketAccount) {
  const lEff = effectiveLiquidity(market);
  if (lEff <= 0) return market.winningSide === 1 ? 1 : market.winningSide === 2 ? 0 : 0.5;
  return priceFromReserves(market.reserveYes.toNumber(), market.reserveNo.toNumber(), lEff);
}

// estimateSwapOutput is fee-unaware. Buys pay a 2% fee on the USDC input,
// so quote the curve with net input and apply slippage to the estimated output.
export function quoteBuy(
  market: MarketAccount,
  side: BuySide,
  amountInMicro: number,
  slippageBps = DEFAULT_SLIPPAGE_BPS,
) {
  if (!Number.isSafeInteger(amountInMicro) || amountInMicro <= 0) throw new Error("Invalid raw USDC amount");
  const lEff = effectiveLiquidity(market);
  if (lEff <= 0) throw new Error("Market is expired or has no liquidity");

  const netInputMicro = Math.floor((amountInMicro * (BPS - SWAP_FEE_BPS)) / BPS);
  const estimate = estimateSwapOutput(
    market.reserveYes.toNumber(),
    market.reserveNo.toNumber(),
    lEff,
    netInputMicro,
    side,
  );
  const minOutputMicro = Math.max(1, Math.floor((estimate.output * (BPS - slippageBps)) / BPS));
  return { ...estimate, netInputMicro, minOutputMicro };
}
