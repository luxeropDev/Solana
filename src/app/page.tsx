"use client";

import { getAssociatedTokenAddress } from "@solana/spl-token";
import type { MarketAccount } from "@pm-amm/sdk";
import { PublicKey, type Keypair } from "@solana/web3.js";
import {
  Activity,
  ArrowUpRight,
  Check,
  CloudSun,
  Coins,
  Droplets,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Wind,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { ensureDevnetFunding, getOrCreateBurnerWallet, requestDevnetSol, requestDevnetUsdc } from "@/lib/solana/burnerWallet";
import { POLL_INTERVAL_MS, USDC_MINT } from "@/lib/solana/constants";
import { marketProbability, quoteBuy, type BuySide } from "@/lib/solana/pm-amm-helpers";
import { buyPosition, claimWinnings, connection, readOnlyPmClient, usdcToRaw } from "@/lib/solana/pmSdk";

type MarketView = { publicKey: PublicKey; account: MarketAccount };
type DashboardData = {
  sol: number;
  usdc: number;
  yes: number;
  no: number;
  market: MarketView | null;
};

const compact = (address?: string) => address ? `${address.slice(0, 5)}…${address.slice(-5)}` : "—";
const tokenBalance = async (owner: PublicKey, mint: PublicKey) => {
  const ata = await getAssociatedTokenAddress(mint, owner);
  return connection.getTokenAccountBalance(ata, "confirmed").then((v) => v.value.uiAmount ?? 0).catch(() => 0);
};

async function findMarket(): Promise<MarketView | null> {
  const configured = process.env.NEXT_PUBLIC_MARKET_ADDRESS;
  if (configured) {
    const publicKey = new PublicKey(configured);
    const account = await readOnlyPmClient.fetchMarket(publicKey);
    return account ? { publicKey, account } : null;
  }
  const markets = await readOnlyPmClient.fetchAllMarkets(443);
  const preferred = markets.find(({ account }) => {
    const name = new TextDecoder().decode(Uint8Array.from(account.name)).replaceAll("\0", "").toLowerCase();
    return name.includes("almaty") || name.includes("aqi");
  });
  return preferred ?? markets[0] ?? null;
}

async function fetchDashboard(wallet: Keypair): Promise<DashboardData> {
  const market = await findMarket();
  const [lamports, usdc, yes, no] = await Promise.all([
    connection.getBalance(wallet.publicKey, "confirmed"),
    tokenBalance(wallet.publicKey, USDC_MINT),
    market ? tokenBalance(wallet.publicKey, market.account.yesMint) : 0,
    market ? tokenBalance(wallet.publicKey, market.account.noMint) : 0,
  ]);
  return { sol: lamports / 1e9, usdc, yes, no, market };
}

export default function Home() {
  const [wallet, setWallet] = useState<Keypair | null>(null);
  const [side, setSide] = useState<BuySide>("yes");
  const [amount, setAmount] = useState("5");
  const [busy, setBusy] = useState<"fund" | "trade" | "claim" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const burner = getOrCreateBurnerWallet();
    setWallet(burner);
    if (!sessionStorage.getItem("aua-market:auto-funded")) {
      sessionStorage.setItem("aua-market:auto-funded", "1");
      void ensureDevnetFunding(connection, burner);
    }
  }, []);

  const { data, error, mutate, isLoading } = useSWR(
    wallet ? ["dashboard", wallet.publicKey.toBase58()] : null,
    () => fetchDashboard(wallet!),
    { refreshInterval: POLL_INTERVAL_MS, dedupingInterval: POLL_INTERVAL_MS, revalidateOnFocus: false },
  );

  const market = data?.market ?? null;
  const probability = market ? marketProbability(market.account) : 0.7;
  const selectedProbability = side === "yes" ? probability : 1 - probability;
  const parsedAmount = Number(amount);
  const preview = useMemo(() => {
    if (!market || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return null;
    try { return quoteBuy(market.account, side, usdcToRaw(parsedAmount)); }
    catch { return null; }
  }, [market, parsedAmount, side]);

  const run = useCallback(async (kind: "fund" | "trade" | "claim", action: () => Promise<unknown>, success: string) => {
    setBusy(kind); setNotice(null);
    try { await action(); setNotice(success); await mutate(); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Операция не выполнена"); }
    finally { setBusy(null); }
  }, [mutate]);

  const handleFund = () => wallet && run("fund", async () => {
    await Promise.allSettled([requestDevnetSol(connection, wallet, true), requestDevnetUsdc(wallet)]);
  }, "Devnet-баланс обновлён");

  const handleTrade = () => {
    if (!wallet || !market) return setNotice("Укажите адрес рынка в .env.local или создайте рынок в devnet");
    return run("trade", () => buyPosition({ wallet, market: market.publicKey, marketAccount: market.account, side, amountUsdc: parsedAmount }), "Сделка подтверждена в Solana devnet");
  };

  const handleClaim = () => {
    if (!wallet || !market) return;
    return run("claim", () => claimWinnings(wallet, market.publicKey), "Выигрыш зачислен на burner-кошелёк");
  };

  const resolved = market?.account.resolved ?? false;
  const endTs = market?.account.endTs.toNumber();
  const endLabel = endTs ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" }).format(endTs * 1000) : "ожидает рынок";

  return (
    <main className="grid-noise min-h-screen px-4 pb-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex min-h-24 items-center justify-between gap-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#a9ffc8] text-[#07110f]"><Wind size={22} strokeWidth={2.4} /></div>
            <div><p className="text-lg font-extrabold tracking-[-.03em]">AUA Market</p><p className="text-xs text-[#91a79d]">Almaty · Solana devnet</p></div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-4 rounded-2xl border border-white/10 bg-white/[.035] px-4 py-2.5 md:flex">
              <Balance label="SOL" value={data?.sol.toFixed(2) ?? "—"} />
              <span className="h-7 w-px bg-white/10" />
              <Balance label="USDC" value={data?.usdc.toFixed(2) ?? "—"} />
              <span className="h-7 w-px bg-white/10" />
              <span className="font-mono text-sm text-[#c9ddd2]">{compact(wallet?.publicKey.toBase58())}</span>
            </div>
            <button onClick={handleFund} disabled={!wallet || busy !== null} className="flex min-h-11 items-center gap-2 rounded-2xl bg-[#a9ffc8] px-4 text-sm font-extrabold text-[#07110f] transition hover:bg-white disabled:opacity-50">
              {busy === "fund" ? <LoaderCircle className="animate-spin" size={17} /> : <Coins size={17} />}<span className="hidden sm:inline">Airdrop funds</span>
            </button>
          </div>
        </header>

        <section className="mb-8 mt-9 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <div className="mb-4 flex items-center gap-2 text-sm font-bold text-[#a9ffc8]"><Activity size={16} /> LIVE ENVIRONMENTAL MARKET</div>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.04] tracking-[-.055em] sm:text-5xl lg:text-6xl">Чистый воздух —<br /><span className="text-[#91a79d]">измеримый риск.</span></h1>
          </div>
          <p className="max-w-md text-base leading-7 text-[#91a79d]">Торгуйте исходом на прозрачном devnet-рынке. После дедлайна результат фиксирует оракул по публичным данным US AQI.</p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.55fr_.85fr]">
          <section className="panel overflow-hidden rounded-[2rem]">
            <div className="border-b border-white/10 p-6 sm:p-8">
              <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-full border border-[#a9ffc8]/20 bg-[#a9ffc8]/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[.14em] text-[#a9ffc8]">{resolved ? "Разрешён" : "Торги открыты"}</span>
                <span className="flex items-center gap-2 text-sm text-[#91a79d]"><CloudSun size={16} /> Закрытие: {endLabel} ALMT</span>
              </div>
              <h2 className="max-w-2xl text-2xl font-extrabold leading-tight tracking-[-.035em] sm:text-3xl">Превысит ли US AQI в Алматы отметку 150 на этой неделе?</h2>
              <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric icon={<Wind size={17} />} label="Порог" value="150 AQI" />
                <Metric icon={<Droplets size={17} />} label="Источник" value="Open-Meteo" />
                <Metric icon={<ShieldCheck size={17} />} label="Расчёт" value="Auto-oracle" />
                <Metric icon={<RefreshCw size={17} />} label="Обновление" value="15 сек" />
              </div>
            </div>

            <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[1fr_1.15fr]">
              <div>
                <p className="text-sm font-bold text-[#91a79d]">Вероятность YES</p>
                <div className="mt-2 flex items-end gap-2"><strong className="text-6xl font-extrabold tracking-[-.07em] text-[#a9ffc8]">{Math.round(probability * 100)}</strong><span className="pb-1 text-2xl font-bold text-[#6e877b]">%</span></div>
                <div className="mt-6 h-2 overflow-hidden rounded-full bg-[#253730]"><div className="h-full rounded-full bg-[#a9ffc8] transition-all" style={{ width: `${probability * 100}%` }} /></div>
                <div className="mt-3 flex justify-between text-xs font-bold text-[#6e877b]"><span>NO {Math.round((1 - probability) * 100)}%</span><span>YES {Math.round(probability * 100)}%</span></div>
                <p className="mt-7 text-xs leading-5 text-[#6e877b]">Цена рассчитана из резервов динамического pm‑AMM пула. Комиссия протокола 2% учтена в котировке.</p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/15 p-4 sm:p-5">
                <div className="grid grid-cols-2 rounded-2xl bg-[#07110f] p-1">
                  {(["yes", "no"] as const).map((value) => <button key={value} onClick={() => setSide(value)} className={`min-h-11 rounded-xl text-sm font-extrabold transition ${side === value ? value === "yes" ? "bg-[#a9ffc8] text-[#07110f]" : "bg-[#ffb8a3] text-[#25100a]" : "text-[#91a79d] hover:text-white"}`}>Купить {value.toUpperCase()}</button>)}
                </div>
                <label className="mt-5 block text-sm font-bold text-[#91a79d]" htmlFor="amount">Сумма сделки</label>
                <div className="mt-2 flex items-center rounded-2xl border border-white/10 bg-[#07110f] px-4 focus-within:border-[#a9ffc8]/50">
                  <input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="min-w-0 flex-1 bg-transparent py-4 text-2xl font-extrabold outline-none" aria-label="Сумма в USDC" />
                  <span className="text-sm font-extrabold text-[#91a79d]">USDC</span>
                </div>
                <div className="mt-3 flex gap-2">{[5, 10, 25].map((v) => <button key={v} onClick={() => setAmount(String(v))} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-[#b5c8bf] hover:border-white/25">{v} USDC</button>)}</div>
                <div className="mt-5 flex items-center justify-between text-sm"><span className="text-[#6e877b]">Получите ≈</span><span className="font-extrabold">{preview ? (preview.output / 1e6).toFixed(2) : "—"} {side.toUpperCase()}</span></div>
                <button onClick={handleTrade} disabled={busy !== null || !parsedAmount || resolved} className="mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 font-extrabold text-[#07110f] transition hover:bg-[#a9ffc8] disabled:opacity-40">
                  {busy === "trade" ? <LoaderCircle className="animate-spin" size={19} /> : <Sparkles size={18} />} Торговать в 1 клик <ArrowUpRight size={18} />
                </button>
                <p className="mt-3 text-center text-xs text-[#6e877b]">Min output защищён 1% slippage</p>
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="panel rounded-[2rem] p-6">
              <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-[#91a79d]">Портфель</p><h3 className="mt-1 text-xl font-extrabold">Ваши позиции</h3></div><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/[.05]"><WalletCards size={20} /></div></div>
              <div className="mt-7 space-y-3">
                <Position label="YES tokens" value={data?.yes ?? 0} color="bg-[#a9ffc8]" />
                <Position label="NO tokens" value={data?.no ?? 0} color="bg-[#ffb8a3]" />
              </div>
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/10 p-4">
                <div className="flex items-center gap-2 text-sm font-extrabold"><Check className={resolved ? "text-[#a9ffc8]" : "text-[#6e877b]"} size={17} /> {resolved ? `Победил ${market?.account.winningSide === 1 ? "YES" : "NO"}` : "Ожидаем результат"}</div>
                <p className="mt-2 text-xs leading-5 text-[#6e877b]">Кнопка станет доступна после on-chain разрешения рынка.</p>
              </div>
              <button onClick={handleClaim} disabled={!resolved || busy !== null} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 font-extrabold transition hover:bg-white hover:text-[#07110f] disabled:cursor-not-allowed disabled:opacity-35">
                {busy === "claim" ? <LoaderCircle className="animate-spin" size={18} /> : <Coins size={18} />} Забрать выигрыш
              </button>
            </section>

            <section className="rounded-[2rem] border border-[#8dafff]/20 bg-[#8dafff]/10 p-6">
              <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 text-[#a9bdff]" size={21} /><div><h3 className="font-extrabold">Как работает оракул</h3><p className="mt-2 text-sm leading-6 text-[#aab8c9]">После дедлайна сервер сверяет US AQI Алматы с порогом 150 и подписывает исход ключом создателя рынка.</p></div></div>
            </section>
          </aside>
        </div>

        {(notice || error || (!market && !isLoading)) && <div role="status" className="mt-5 rounded-2xl border border-white/10 bg-[#101f1b] px-5 py-4 text-sm text-[#c9ddd2]">{notice ?? (error instanceof Error ? error.message : "Рынок пока не найден в devnet. Добавьте NEXT_PUBLIC_MARKET_ADDRESS.")}</div>}

        <footer className="mt-8 flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-xs text-[#6e877b] sm:flex-row"><span>Burner-ключ хранится только в localStorage этого браузера.</span>{market && <a className="flex items-center gap-1 hover:text-white" href={`https://solscan.io/account/${market.publicKey.toBase58()}?cluster=devnet`} target="_blank" rel="noreferrer">Открыть рынок в Solscan <ExternalLink size={13} /></a>}</footer>
      </div>
    </main>
  );
}

function Balance({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] font-bold uppercase tracking-widest text-[#6e877b]">{label}</p><p className="text-sm font-extrabold">{value}</p></div>; }
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-2xl bg-white/[.035] p-3"><div className="mb-4 text-[#91a79d]">{icon}</div><p className="text-[11px] font-bold uppercase tracking-wider text-[#6e877b]">{label}</p><p className="mt-1 text-sm font-extrabold">{value}</p></div>; }
function Position({ label, value, color }: { label: string; value: number; color: string }) { return <div className="flex items-center justify-between rounded-2xl bg-white/[.035] p-4"><div className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${color}`} /><span className="text-sm font-bold text-[#aebfb7]">{label}</span></div><span className="font-extrabold">{value.toFixed(2)}</span></div>; }
