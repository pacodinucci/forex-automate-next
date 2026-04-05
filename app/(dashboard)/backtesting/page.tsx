"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Filter, Layers3, Search } from "lucide-react";
import RuntimePixiChart, {
  type RuntimeMovingAverageConfig,
} from "@/components/bots/runtime-pixi-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { BotRuntimeH4Candle } from "@/lib/types";
import {
  simulateLegContinuationH4M15,
  type SimTrade,
} from "@/lib/backtesting-simulator";
import { cn } from "@/lib/utils";

type StrategyKey = "peak" | "break_retest" | "leg_continuation_h4_m15" | "fib";

type DatasetMeta = {
  symbols: string[];
  timeframesBySymbol: Record<string, string[]>;
  strategiesBySymbol: Record<string, StrategyKey[]>;
};

type BacktestCandle = {
  time_utc: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type BacktestTrade = {
  id: string;
  side: "buy" | "sell" | "unknown";
  setup_time?: string;
  entry_time?: string;
  entry?: number;
  exit_time?: string;
  exit?: number;
  result?: string;
  pnl_points?: number;
};

type BacktestRun = {
  symbol: string;
  timeframe: string;
  strategy: StrategyKey;
  candles: BacktestCandle[];
  trades: BacktestTrade[];
  summary: {
    totalTrades: number;
    winningTrades: number;
    winRate: number;
    totalPnlPoints: number;
  };
};

type BacktestViewMode = "single" | "portfolio";

type PortfolioGridRow = {
  slPoints: number;
  tpPoints: number;
  totalTrades: number;
  winningTrades: number;
  totalPnlPoints: number;
  pairsProcessed: number;
  pairsWithTrades: number;
  winRate: number;
  details: PortfolioInstrumentDetail[];
};

type PortfolioGridResponse = {
  strategy: string;
  range: {
    start: string | null;
    end: string | null;
  };
  symbols: string[];
  slValues: number[];
  tpValues: number[];
  combinations: number;
  rows: PortfolioGridRow[];
};

type PortfolioTradeDetail = {
  id: string;
  side: "buy" | "sell" | "unknown";
  setup_time?: string;
  entry_time?: string;
  entry?: number;
  exit_time?: string;
  exit?: number;
  result?: string;
  pnl_points?: number;
};

type PortfolioMonthDetail = {
  monthKey: string;
  monthLabel: string;
  totalTrades: number;
  winningTrades: number;
  totalPnlPoints: number;
  winRate: number;
  trades: PortfolioTradeDetail[];
};

type PortfolioInstrumentDetail = {
  symbol: string;
  totalTrades: number;
  winningTrades: number;
  totalPnlPoints: number;
  winRate: number;
  months: PortfolioMonthDetail[];
};

type PortfolioLoadedSymbolData = {
  symbol: string;
  h4: BacktestCandle[];
  m15: BacktestCandle[];
};

type InternalPortfolioRow = Omit<PortfolioGridRow, "details"> & {
  symbolTrades: Map<string, SimTrade[]>;
};

type BacktestCandlesResponse = {
  symbol: string;
  timeframe: string;
  count: number;
  candles: BacktestCandle[];
};

const STRATEGY_LABELS: Record<StrategyKey, string> = {
  peak: "Peak/Dip",
  break_retest: "Break + Retest",
  leg_continuation_h4_m15: "Leg Continuation H4->M15",
  fib: "Fib",
};

const DEFAULT_SL_POINTS = 100;
const DEFAULT_TP_POINTS = 400;
const PORTFOLIO_VIEW_NAME = "Barrido de Portafolio";
const GRID_SL_VALUES = [100, 200, 250, 300, 400, 500, 600];
const GRID_TP_VALUES = [40, 60, 80, 100, 200, 250, 300, 400, 500, 600];

const summaryPnlChartConfig = {
  pnl: { label: "PnL", color: "oklch(0.69 0.17 143)" },
} satisfies ChartConfig;

const instrumentMonthChartConfig = {
  pnl: { label: "PnL", color: "oklch(0.69 0.17 143)" },
  trades: { label: "Trades", color: "oklch(0.57 0.103 196)" },
} satisfies ChartConfig;

const summaryMonthlyPnlChartConfig = {
  pnl: { label: "PnL", color: "oklch(0.57 0.103 196)" },
} satisfies ChartConfig;

function toRuntimeCandles(candles: BacktestCandle[]): BotRuntimeH4Candle[] {
  return candles.map((candle) => ({
    time_utc: candle.time_utc,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    direction: candle.close >= candle.open ? "bull" : "bear",
    is_doji: Math.abs(candle.close - candle.open) <= 0.000005,
  }));
}

function fmtDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function fmtPrice(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return value.toFixed(5);
}

function fmtPnl(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)} pts`;
}

function fmtCount(value: number) {
  return Intl.NumberFormat("es-AR").format(value);
}

function comboKey(sl: number, tp: number) {
  return `${sl}:${tp}`;
}

function tradeStatusLabel(result?: string, pnlPoints?: number) {
  if (result === "TP") return "Completed";
  if (result === "SL") return "Declined";
  if ((pnlPoints ?? 0) > 0) return "Completed";
  if ((pnlPoints ?? 0) < 0) return "Declined";
  return "Flat";
}

function tradeStatusClass(result?: string, pnlPoints?: number) {
  const label = tradeStatusLabel(result, pnlPoints);
  if (label === "Completed")
    return "border-emerald-200 bg-emerald-100 text-emerald-700";
  if (label === "Declined") return "border-rose-200 bg-rose-100 text-rose-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function tradeMainTime(trade: PortfolioTradeDetail) {
  return trade.entry_time ?? trade.setup_time ?? trade.exit_time;
}

function monthKeyFromTrade(trade: PortfolioTradeDetail) {
  const raw = tradeMainTime(trade);
  if (!raw) return "unknown";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "unknown";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthLabelFromKey(monthKey: string) {
  if (monthKey === "unknown") return "Sin fecha";
  const [year, month] = monthKey.split("-");
  const date = new Date(`${year}-${month}-01T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return monthKey;
  return date.toLocaleDateString("es-AR", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default function BacktestingPage() {
  const [viewMode, setViewMode] = useState<BacktestViewMode>("single");
  const [meta, setMeta] = useState<DatasetMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [loadingRun, setLoadingRun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [strategy, setStrategy] = useState<StrategyKey>("peak");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [slPoints, setSlPoints] = useState(DEFAULT_SL_POINTS);
  const [tpPoints, setTpPoints] = useState(DEFAULT_TP_POINTS);
  const [speedMs, setSpeedMs] = useState(180);
  const [indicatorsModalOpen, setIndicatorsModalOpen] = useState(false);
  const [indicatorKind, setIndicatorKind] = useState<"sma" | "ema">("sma");
  const [indicatorPeriod, setIndicatorPeriod] = useState(20);
  const [movingAverages, setMovingAverages] = useState<
    RuntimeMovingAverageConfig[]
  >([]);

  const [run, setRun] = useState<BacktestRun | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [portfolioResult, setPortfolioResult] =
    useState<PortfolioGridResponse | null>(null);
  const [portfolioProgressDone, setPortfolioProgressDone] = useState(0);
  const [portfolioProgressTotal, setPortfolioProgressTotal] = useState(0);
  const [portfolioCurrentSymbol, setPortfolioCurrentSymbol] = useState<
    string | null
  >(null);
  const [portfolioCurrentSl, setPortfolioCurrentSl] = useState<number | null>(
    null,
  );
  const [portfolioCurrentTp, setPortfolioCurrentTp] = useState<number | null>(
    null,
  );
  const [portfolioDetailOpen, setPortfolioDetailOpen] = useState(false);
  const [selectedPortfolioRow, setSelectedPortfolioRow] =
    useState<PortfolioGridRow | null>(null);
  const [portfolioDetailTab, setPortfolioDetailTab] = useState("summary");
  const [detailRunM15, setDetailRunM15] = useState<BacktestRun | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [focusTimeUtc, setFocusTimeUtc] = useState<string | null>(null);
  const [m15FocusRangeUtc, setM15FocusRangeUtc] = useState<{
    startTimeUtc: string;
    endExclusiveTimeUtc: string;
  } | null>(null);
  const chartSectionRef = useRef<HTMLDivElement | null>(null);
  const m15SectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const loadMeta = async () => {
      setMetaLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/backtesting/datasets");
        if (!response.ok) {
          throw new Error(
            `No se pudieron cargar datasets (${response.status})`,
          );
        }

        const payload = (await response.json()) as DatasetMeta;
        setMeta(payload);

        const firstSymbol = payload.symbols[0] ?? "";
        const firstTimeframe =
          payload.timeframesBySymbol[firstSymbol]?.[0] ?? "";
        const firstStrategy =
          payload.strategiesBySymbol[firstSymbol]?.[0] ?? "peak";

        setSymbol(firstSymbol);
        setTimeframe(firstTimeframe);
        setStrategy(firstStrategy);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Error cargando metadata";
        setError(message);
      } finally {
        setMetaLoading(false);
      }
    };

    void loadMeta();
  }, []);

  useEffect(() => {
    if (!meta || !symbol) return;

    const availableTimeframes = meta.timeframesBySymbol[symbol] ?? [];
    const availableStrategies = meta.strategiesBySymbol[symbol] ?? [];

    if (!availableTimeframes.includes(timeframe)) {
      setTimeframe(availableTimeframes[0] ?? "");
    }

    if (!availableStrategies.includes(strategy)) {
      setStrategy(availableStrategies[0] ?? "peak");
    }
  }, [meta, symbol, timeframe, strategy]);

  useEffect(() => {
    if (!playing || !run || run.candles.length === 0) return;

    const timer = setInterval(() => {
      setCursor((prev) => {
        const next = prev + 1;
        if (next >= run.candles.length - 1) {
          setPlaying(false);
          return run.candles.length - 1;
        }
        return next;
      });
    }, speedMs);

    return () => clearInterval(timer);
  }, [playing, run, speedMs]);

  useEffect(() => {
    if (portfolioDetailOpen) {
      setPortfolioDetailTab("summary");
    }
  }, [portfolioDetailOpen, selectedPortfolioRow]);

  const runBacktest = async () => {
    if (!symbol || !timeframe || !strategy) return;

    setLoadingRun(true);
    setError(null);
    setPlaying(false);

    try {
      if (!Number.isFinite(slPoints) || slPoints <= 0) {
        throw new Error("SL points debe ser un numero mayor a 0.");
      }
      if (!Number.isFinite(tpPoints) || tpPoints <= 0) {
        throw new Error("TP points debe ser un numero mayor a 0.");
      }
      const validatedSlPoints = Math.max(1, Math.floor(slPoints));
      const validatedTpPoints = Math.max(1, Math.floor(tpPoints));

      const buildCandlesUrl = (tf: string) => {
        const params = new URLSearchParams({ symbol, timeframe: tf });
        if (start) params.set("start", start);
        if (end) params.set("end", end);
        return `/api/backtesting/candles?${params.toString()}`;
      };
      const fetchCandles = async (tf: string) => {
        const response = await fetch(buildCandlesUrl(tf));
        if (!response.ok) {
          const message = await response.text();
          throw new Error(
            message || `No se pudieron cargar velas (${response.status})`,
          );
        }
        return (await response.json()) as BacktestCandlesResponse;
      };

      const mainPayload = await fetchCandles(timeframe);
      const h4ForLeg = timeframe === "H4" ? mainPayload.candles : [];

      const canLoadM15Detail =
        strategy === "leg_continuation_h4_m15" &&
        timeframe === "H4" &&
        (meta?.timeframesBySymbol[symbol] ?? []).includes("M15");

      let m15Payload: BacktestCandlesResponse | null = null;
      if (canLoadM15Detail) {
        m15Payload = await fetchCandles("M15");
        setDetailRunM15({
          symbol,
          timeframe: "M15",
          strategy,
          candles: m15Payload.candles,
          trades: [],
          summary: {
            totalTrades: 0,
            winningTrades: 0,
            winRate: 0,
            totalPnlPoints: 0,
          },
        });
      } else {
        setDetailRunM15(null);
      }

      let simulatedTrades: SimTrade[] = [];
      if (strategy === "leg_continuation_h4_m15") {
        if (timeframe !== "H4") {
          throw new Error("Leg Continuation H4->M15 requiere timeframe H4.");
        }
        if (!m15Payload) {
          throw new Error("No hay data M15 para simular Leg Continuation.");
        }
        simulatedTrades = simulateLegContinuationH4M15({
          symbol,
          h4: h4ForLeg,
          m15: m15Payload.candles,
          pivotStrength: 2,
          slPoints: validatedSlPoints,
          tpPoints: validatedTpPoints,
        });
      }

      const totalTrades = simulatedTrades.length;
      const winningTrades = simulatedTrades.filter(
        (trade) => (trade.pnl_points ?? 0) > 0,
      ).length;
      const totalPnlPoints = simulatedTrades.reduce(
        (acc, trade) => acc + (trade.pnl_points ?? 0),
        0,
      );

      setRun({
        symbol,
        timeframe,
        strategy,
        candles: mainPayload.candles,
        trades: simulatedTrades,
        summary: {
          totalTrades,
          winningTrades,
          winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
          totalPnlPoints,
        },
      });

      setCursor(0);
      setSelectedTradeId(null);
      setFocusTimeUtc(null);
      setM15FocusRangeUtc(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error corriendo backtest";
      setError(message);
      setRun(null);
      setDetailRunM15(null);
      setM15FocusRangeUtc(null);
    } finally {
      setLoadingRun(false);
    }
  };

  const runPortfolioBacktest = async () => {
    if (!meta) return;
    setPortfolioLoading(true);
    setPortfolioError(null);
    setPortfolioResult(null);
    setSelectedPortfolioRow(null);
    setPortfolioDetailOpen(false);
    setPortfolioProgressDone(0);
    setPortfolioProgressTotal(0);
    setPortfolioCurrentSymbol(null);
    setPortfolioCurrentSl(null);
    setPortfolioCurrentTp(null);

    try {
      const effectiveStrategy: StrategyKey =
        strategy === "leg_continuation_h4_m15"
          ? strategy
          : "leg_continuation_h4_m15";
      const symbols = [...meta.symbols]
        .sort((a, b) => a.localeCompare(b))
        .filter((item) => {
          const tfs = meta.timeframesBySymbol[item] ?? [];
          return tfs.includes("H4") && tfs.includes("M15");
        });

      if (symbols.length === 0) {
        throw new Error("No hay pares con H4 y M15 para correr el barrido.");
      }

      const combos = GRID_SL_VALUES.flatMap((slValue) =>
        GRID_TP_VALUES.map((tpValue) => ({ slValue, tpValue })),
      );
      const totalTests = symbols.length * combos.length;
      setPortfolioProgressTotal(totalTests);

      const rowsMap = new Map<string, InternalPortfolioRow>();
      for (const { slValue, tpValue } of combos) {
        rowsMap.set(comboKey(slValue, tpValue), {
          slPoints: slValue,
          tpPoints: tpValue,
          totalTrades: 0,
          winningTrades: 0,
          totalPnlPoints: 0,
          pairsProcessed: 0,
          pairsWithTrades: 0,
          winRate: 0,
          symbolTrades: new Map<string, SimTrade[]>(),
        });
      }

      let done = 0;
      const processedSymbols: string[] = [];
      for (const symbolItem of symbols) {
        const paramsH4 = new URLSearchParams({
          symbol: symbolItem,
          timeframe: "H4",
        });
        const paramsM15 = new URLSearchParams({
          symbol: symbolItem,
          timeframe: "M15",
        });
        if (start) {
          paramsH4.set("start", start);
          paramsM15.set("start", start);
        }
        if (end) {
          paramsH4.set("end", end);
          paramsM15.set("end", end);
        }

        const [h4Response, m15Response] = await Promise.all([
          fetch(`/api/backtesting/candles?${paramsH4.toString()}`),
          fetch(`/api/backtesting/candles?${paramsM15.toString()}`),
        ]);

        if (!h4Response.ok || !m15Response.ok) {
          for (let index = 0; index < combos.length; index += 1) {
            done += 1;
            setPortfolioProgressDone(done);
          }
          continue;
        }

        const h4Payload = (await h4Response.json()) as BacktestCandlesResponse;
        const m15Payload =
          (await m15Response.json()) as BacktestCandlesResponse;
        const loaded: PortfolioLoadedSymbolData = {
          symbol: symbolItem,
          h4: h4Payload.candles,
          m15: m15Payload.candles,
        };
        processedSymbols.push(symbolItem);

        for (const { slValue, tpValue } of combos) {
          const row = rowsMap.get(comboKey(slValue, tpValue));
          if (!row) continue;

          setPortfolioCurrentSymbol(symbolItem);
          setPortfolioCurrentSl(slValue);
          setPortfolioCurrentTp(tpValue);

          const trades = simulateLegContinuationH4M15({
            symbol: loaded.symbol,
            h4: loaded.h4,
            m15: loaded.m15,
            pivotStrength: 2,
            slPoints: slValue,
            tpPoints: tpValue,
          });

          const winningTrades = trades.filter(
            (trade) => (trade.pnl_points ?? 0) > 0,
          ).length;
          const totalPnlPoints = trades.reduce(
            (acc, trade) => acc + (trade.pnl_points ?? 0),
            0,
          );

          row.totalTrades += trades.length;
          row.winningTrades += winningTrades;
          row.totalPnlPoints += totalPnlPoints;
          row.pairsProcessed += 1;
          row.symbolTrades.set(symbolItem, trades);
          if (trades.length > 0) {
            row.pairsWithTrades += 1;
          }

          row.winRate =
            row.totalTrades > 0
              ? (row.winningTrades / row.totalTrades) * 100
              : 0;
          done += 1;
          setPortfolioProgressDone(done);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      const rows = [...rowsMap.values()]
        .map((row) => {
          const details: PortfolioInstrumentDetail[] = [
            ...row.symbolTrades.entries(),
          ]
            .map(([symbolName, symbolTrades]) => {
              const monthBuckets = new Map<string, PortfolioTradeDetail[]>();
              for (const trade of symbolTrades) {
                const normalizedTrade: PortfolioTradeDetail = {
                  id: trade.id,
                  side: trade.side,
                  setup_time: trade.setup_time,
                  entry_time: trade.entry_time,
                  entry: trade.entry,
                  exit_time: trade.exit_time,
                  exit: trade.exit,
                  result: trade.result,
                  pnl_points: trade.pnl_points,
                };
                const monthKey = monthKeyFromTrade(normalizedTrade);
                const bucket = monthBuckets.get(monthKey) ?? [];
                bucket.push(normalizedTrade);
                monthBuckets.set(monthKey, bucket);
              }

              const months: PortfolioMonthDetail[] = [...monthBuckets.entries()]
                .map(([monthKey, monthTrades]) => {
                  const totalTrades = monthTrades.length;
                  const winningTrades = monthTrades.filter(
                    (trade) => (trade.pnl_points ?? 0) > 0,
                  ).length;
                  const totalPnlPoints = monthTrades.reduce(
                    (acc, trade) => acc + (trade.pnl_points ?? 0),
                    0,
                  );
                  return {
                    monthKey,
                    monthLabel: monthLabelFromKey(monthKey),
                    totalTrades,
                    winningTrades,
                    totalPnlPoints,
                    winRate:
                      totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
                    trades: monthTrades.sort((a, b) => {
                      const at = Date.parse(tradeMainTime(a) ?? "");
                      const bt = Date.parse(tradeMainTime(b) ?? "");
                      if (Number.isNaN(at) && Number.isNaN(bt)) return 0;
                      if (Number.isNaN(at)) return 1;
                      if (Number.isNaN(bt)) return -1;
                      return at - bt;
                    }),
                  };
                })
                .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

              const totalTrades = symbolTrades.length;
              const winningTrades = symbolTrades.filter(
                (trade) => (trade.pnl_points ?? 0) > 0,
              ).length;
              const totalPnlPoints = symbolTrades.reduce(
                (acc, trade) => acc + (trade.pnl_points ?? 0),
                0,
              );
              return {
                symbol: symbolName,
                totalTrades,
                winningTrades,
                totalPnlPoints,
                winRate:
                  totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
                months,
              };
            })
            .sort((a, b) => b.totalPnlPoints - a.totalPnlPoints);

          return {
            slPoints: row.slPoints,
            tpPoints: row.tpPoints,
            totalTrades: row.totalTrades,
            winningTrades: row.winningTrades,
            totalPnlPoints: row.totalPnlPoints,
            pairsProcessed: row.pairsProcessed,
            pairsWithTrades: row.pairsWithTrades,
            winRate: row.winRate,
            details,
          };
        })
        .sort((a, b) => b.totalPnlPoints - a.totalPnlPoints);
      setPortfolioResult({
        strategy: effectiveStrategy,
        range: { start: start || null, end: end || null },
        symbols: processedSymbols,
        slValues: GRID_SL_VALUES,
        tpValues: GRID_TP_VALUES,
        combinations: combos.length,
        rows,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Error ejecutando barrido de portafolio";
      setPortfolioError(message);
      setPortfolioResult(null);
    } finally {
      setPortfolioLoading(false);
      setPortfolioCurrentSymbol(null);
      setPortfolioCurrentSl(null);
      setPortfolioCurrentTp(null);
    }
  };

  const visibleCandles = useMemo(() => {
    if (!run || run.candles.length === 0) return [] as BacktestCandle[];
    return run.candles.slice(0, Math.max(1, cursor + 1));
  }, [run, cursor]);

  const runtimeCandles = useMemo(
    () => toRuntimeCandles(visibleCandles),
    [visibleCandles],
  );

  const visibleLastTimeMs = useMemo(() => {
    const last = visibleCandles[visibleCandles.length - 1];
    if (!last) return 0;
    const ms = Date.parse(last.time_utc);
    return Number.isNaN(ms) ? 0 : ms;
  }, [visibleCandles]);

  const tradeMarkers = useMemo(() => {
    if (!run || visibleLastTimeMs === 0) return [];

    return run.trades.flatMap((trade) => {
      const markers: {
        id: string;
        time_utc: string;
        price: number;
        entry_price?: number;
        entry_time_utc?: string;
        side: "buy" | "sell" | "unknown";
        kind: "entry" | "exit";
        result?: string;
        pnl_points?: number;
      }[] = [];

      if (trade.entry_time && typeof trade.entry === "number") {
        const entryMs = Date.parse(trade.entry_time);
        if (!Number.isNaN(entryMs) && entryMs <= visibleLastTimeMs) {
          markers.push({
            id: `${trade.id}:entry`,
            time_utc: trade.entry_time,
            price: trade.entry,
            side: trade.side,
            kind: "entry",
            result: trade.result,
            pnl_points: trade.pnl_points,
          });
        }
      }

      if (trade.exit_time && typeof trade.exit === "number") {
        const exitMs = Date.parse(trade.exit_time);
        if (!Number.isNaN(exitMs) && exitMs <= visibleLastTimeMs) {
          markers.push({
            id: `${trade.id}:exit`,
            time_utc: trade.exit_time,
            price: trade.exit,
            entry_price: trade.entry,
            entry_time_utc: trade.entry_time,
            side: trade.side,
            kind: "exit",
            result: trade.result,
            pnl_points: trade.pnl_points,
          });
        }
      }

      return markers;
    });
  }, [run, visibleLastTimeMs]);

  const currentCandle = visibleCandles[visibleCandles.length - 1];
  const availableTimeframes = meta?.timeframesBySymbol[symbol] ?? [];
  const availableStrategies = meta?.strategiesBySymbol[symbol] ?? [];
  const jumpToTrade = (trade: BacktestTrade) => {
    if (!run) return;

    const jumpTime = trade.exit_time ?? trade.entry_time ?? trade.setup_time;
    if (!jumpTime) return;

    setPlaying(false);
    setSelectedTradeId(trade.id);
    setFocusTimeUtc(jumpTime);
    setM15FocusRangeUtc(null);

    chartSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };
  const tradesTotals = useMemo(() => {
    if (!run) {
      return { wins: 0, losses: 0, neutral: 0, pnl: 0 };
    }

    let wins = 0;
    let losses = 0;
    let neutral = 0;
    let pnl = 0;

    for (const trade of run.trades) {
      const points = trade.pnl_points ?? 0;
      pnl += points;
      if (points > 0) wins += 1;
      else if (points < 0) losses += 1;
      else neutral += 1;
    }

    return { wins, losses, neutral, pnl };
  }, [run]);
  const selectedTrade = useMemo(() => {
    if (!run || !selectedTradeId) return null;
    return run.trades.find((trade) => trade.id === selectedTradeId) ?? null;
  }, [run, selectedTradeId]);
  const selectedTradeMarkers = useMemo(() => {
    if (!selectedTrade) return [];
    const markers: {
      id: string;
      time_utc: string;
      price: number;
      entry_price?: number;
      entry_time_utc?: string;
      side: "buy" | "sell" | "unknown";
      kind: "entry" | "exit";
      result?: string;
      pnl_points?: number;
    }[] = [];

    if (selectedTrade.entry_time && typeof selectedTrade.entry === "number") {
      markers.push({
        id: `${selectedTrade.id}:entry:selected`,
        time_utc: selectedTrade.entry_time,
        price: selectedTrade.entry,
        side: selectedTrade.side,
        kind: "entry",
        result: selectedTrade.result,
        pnl_points: selectedTrade.pnl_points,
      });
    }
    if (selectedTrade.exit_time && typeof selectedTrade.exit === "number") {
      markers.push({
        id: `${selectedTrade.id}:exit:selected`,
        time_utc: selectedTrade.exit_time,
        price: selectedTrade.exit,
        entry_price: selectedTrade.entry,
        entry_time_utc: selectedTrade.entry_time,
        side: selectedTrade.side,
        kind: "exit",
        result: selectedTrade.result,
        pnl_points: selectedTrade.pnl_points,
      });
    }

    return markers;
  }, [selectedTrade]);
  const chartCandles = useMemo(() => {
    if (!run) return runtimeCandles;
    if (selectedTradeId) return toRuntimeCandles(run.candles);
    return runtimeCandles;
  }, [run, runtimeCandles, selectedTradeId]);
  const addIndicator = () => {
    const period = Math.max(1, Math.floor(indicatorPeriod));
    const next: RuntimeMovingAverageConfig = {
      kind: indicatorKind,
      period,
      color: indicatorKind === "sma" ? "#2563eb" : "#f59e0b",
      label: `${indicatorKind.toUpperCase()}(${period})`,
    };
    setMovingAverages((current) => {
      const exists = current.some(
        (item) => item.kind === next.kind && item.period === next.period,
      );
      return exists ? current : [...current, next];
    });
  };
  const removeIndicator = (index: number) => {
    setMovingAverages((current) => current.filter((_, idx) => idx !== index));
  };
  const detailChartCandlesM15 = useMemo(() => {
    if (!detailRunM15) return [] as BotRuntimeH4Candle[];
    return toRuntimeCandles(detailRunM15.candles);
  }, [detailRunM15]);
  const detailFocusTimeUtc = selectedTrade
    ? (selectedTrade.entry_time ??
      selectedTrade.setup_time ??
      selectedTrade.exit_time ??
      null)
    : (currentCandle?.time_utc ?? null);
  const showM15DetailChart = Boolean(
    run &&
    detailRunM15 &&
    timeframe === "H4" &&
    strategy === "leg_continuation_h4_m15",
  );
  const isLegContinuationStrategy = strategy === "leg_continuation_h4_m15";
  const portfolioSummaryStats = useMemo(() => {
    if (!selectedPortfolioRow) {
      return null;
    }
    const instruments = selectedPortfolioRow.details;
    const totalInstruments = instruments.length;
    const totalTrades = instruments.reduce(
      (acc, item) => acc + item.totalTrades,
      0,
    );
    const totalPnl = instruments.reduce(
      (acc, item) => acc + item.totalPnlPoints,
      0,
    );
    const weightedWinRate =
      totalTrades > 0
        ? (instruments.reduce((acc, item) => acc + item.winningTrades, 0) /
            totalTrades) *
          100
        : 0;
    const bestInstrument = [...instruments].sort(
      (a, b) => b.totalPnlPoints - a.totalPnlPoints,
    )[0];
    return {
      totalInstruments,
      totalTrades,
      totalPnl,
      weightedWinRate,
      bestInstrument,
    };
  }, [selectedPortfolioRow]);
  const portfolioMonthlyPnlData = useMemo(() => {
    if (!selectedPortfolioRow) {
      return [] as Array<{ month: string; pnl: number }>;
    }

    const monthlyTotals = new Map<string, { label: string; pnl: number }>();
    for (const instrument of selectedPortfolioRow.details) {
      for (const month of instrument.months) {
        const current = monthlyTotals.get(month.monthKey) ?? {
          label: month.monthLabel,
          pnl: 0,
        };
        current.pnl += month.totalPnlPoints;
        monthlyTotals.set(month.monthKey, current);
      }
    }

    return [...monthlyTotals.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, value]) => ({
        month: value.label,
        pnl: Number(value.pnl.toFixed(2)),
      }));
  }, [selectedPortfolioRow]);

  return (
    <div className="space-y-5">
      <div className="premium-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-background/65 px-4 py-4 md:px-5">
          <div>
            <span className="premium-chip bg-accent/45">Simulation Lab</span>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Backtesting
            </h1>
            <p className="text-sm text-muted-foreground">
              Reproduce tus estrategias visualmente con los CSV de{" "}
              <code>/data</code>.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11 min-w-[240px] justify-between border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"
            onClick={() =>
              setViewMode((current) =>
                current === "single" ? "portfolio" : "single",
              )
            }
          >
            <span className="inline-flex items-center gap-2">
              <Layers3 className="h-4 w-4" />
              {viewMode === "single"
                ? PORTFOLIO_VIEW_NAME
                : "Backtesting Individual"}
            </span>
            {viewMode === "single" ? (
              <ArrowRight className="h-4 w-4" />
            ) : (
              <ArrowLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="relative min-w-0 overflow-hidden">
        <div className={cn("w-full min-w-0")}>
          <div
            className={cn(
              "min-w-0 space-y-5 pr-0 md:pr-2",
              viewMode === "single"
                ? "animate-in slide-in-from-right-4 duration-300"
                : "hidden",
            )}
          >
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/70 bg-background/55">
                <CardTitle>Configuracion</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-4 py-4 md:px-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className="space-y-2">
                    <div className="text-xs uppercase text-muted-foreground">
                      Symbol
                    </div>
                    <Select
                      value={symbol}
                      onValueChange={setSymbol}
                      disabled={metaLoading || !meta}
                    >
                      <SelectTrigger className="w-full bg-background/85">
                        <SelectValue placeholder="Selecciona symbol" />
                      </SelectTrigger>
                      <SelectContent>
                        {(meta?.symbols ?? []).map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs uppercase text-muted-foreground">
                      Timeframe
                    </div>
                    <Select
                      value={timeframe}
                      onValueChange={setTimeframe}
                      disabled={!symbol || availableTimeframes.length === 0}
                    >
                      <SelectTrigger className="w-full bg-background/85">
                        <SelectValue placeholder="Selecciona timeframe" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTimeframes.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs uppercase text-muted-foreground">
                      Estrategia
                    </div>
                    <Select
                      value={strategy}
                      onValueChange={(value: StrategyKey) => setStrategy(value)}
                      disabled={!symbol || availableStrategies.length === 0}
                    >
                      <SelectTrigger className="w-full bg-background/85">
                        <SelectValue placeholder="Selecciona estrategia" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableStrategies.map((item) => (
                          <SelectItem key={item} value={item}>
                            {STRATEGY_LABELS[item]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs uppercase text-muted-foreground">
                      Start (opcional)
                    </div>
                    <Input
                      value={start}
                      onChange={(event) => setStart(event.target.value)}
                      placeholder="2025-03-01"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs uppercase text-muted-foreground">
                      End (opcional)
                    </div>
                    <Input
                      value={end}
                      onChange={(event) => setEnd(event.target.value)}
                      placeholder="2025-03-31"
                    />
                  </div>
                </div>

                <div className="premium-toolbar flex flex-wrap items-center gap-2">
                  <Button
                    className="bg-white/95 text-slate-800 hover:bg-white"
                    onClick={runBacktest}
                    disabled={loadingRun || !symbol || !timeframe || !strategy}
                  >
                    {loadingRun ? "Cargando..." : "Correr backtest"}
                  </Button>
                  <span className="text-xs text-primary-foreground/85">
                    Simulacion cliente: {symbol || "-"} {timeframe || "-"} |{" "}
                    {STRATEGY_LABELS[strategy]}
                    {strategy === "leg_continuation_h4_m15"
                      ? ` | SL ${Math.max(1, Math.floor(slPoints))} | TP ${Math.max(1, Math.floor(tpPoints))}`
                      : ""}
                  </span>
                  <div className="ml-auto">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-white/25 bg-white/10 text-primary-foreground hover:bg-white/18"
                        >
                          Stops: SL {Math.max(1, Math.floor(slPoints))} | TP{" "}
                          {Math.max(1, Math.floor(tpPoints))}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-72 space-y-3 rounded-xl border-border/80 bg-popover/98"
                        align="end"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs uppercase text-muted-foreground">
                            SL points
                          </div>
                          <Input
                            className="h-9 w-28"
                            type="number"
                            min={1}
                            step={1}
                            value={slPoints}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              if (
                                !Number.isNaN(next) &&
                                Number.isFinite(next)
                              ) {
                                setSlPoints(next);
                              }
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs uppercase text-muted-foreground">
                            TP points
                          </div>
                          <Input
                            className="h-9 w-28"
                            type="number"
                            min={1}
                            step={1}
                            value={tpPoints}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              if (
                                !Number.isNaN(next) &&
                                Number.isFinite(next)
                              ) {
                                setTpPoints(next);
                              }
                            }}
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </CardContent>
            </Card>

            {error ? (
              <div className="premium-panel border-destructive/35 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {run ? (
              <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Card className="border-border/75 bg-card/95">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base text-muted-foreground">
                        Velas
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-semibold">
                      {run.candles.length}
                    </CardContent>
                  </Card>
                  <Card className="border-border/75 bg-card/95">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base text-muted-foreground">
                        Trades
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-semibold">
                      {run.summary.totalTrades}
                    </CardContent>
                  </Card>
                  <Card className="border-border/75 bg-card/95">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base text-muted-foreground">
                        Win rate
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-semibold">
                      {run.summary.winRate.toFixed(2)}%
                    </CardContent>
                  </Card>
                  <Card className="border-border/75 bg-card/95">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base text-muted-foreground">
                        PnL total
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-semibold">
                      {fmtPnl(run.summary.totalPnlPoints)}
                    </CardContent>
                  </Card>
                </div>

                <Card ref={chartSectionRef} className="min-w-0 overflow-hidden">
                  <CardHeader className="border-b border-border/70 bg-background/55">
                    <CardTitle>Playback</CardTitle>
                  </CardHeader>
                  <CardContent className="min-w-0 space-y-3 px-4 py-4 md:px-5">
                    <div className="premium-toolbar flex flex-wrap items-center gap-2">
                      <Button
                        variant="default"
                        className="bg-white/95 text-slate-800 hover:bg-white"
                        onClick={() => setPlaying(true)}
                        disabled={
                          playing ||
                          visibleCandles.length === 0 ||
                          cursor >= run.candles.length - 1
                        }
                      >
                        Play
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setPlaying(false)}
                        disabled={!playing}
                      >
                        Pause
                      </Button>
                      <Button
                        variant="outline"
                        className="border-white/25 bg-white/10 text-primary-foreground hover:bg-white/20"
                        onClick={() => {
                          setPlaying(false);
                          setCursor(0);
                        }}
                      >
                        Reset
                      </Button>
                      <Button
                        variant="outline"
                        className="border-white/25 bg-white/10 text-primary-foreground hover:bg-white/20"
                        onClick={() => {
                          setPlaying(false);
                          setCursor((prev) =>
                            Math.min(prev + 1, run.candles.length - 1),
                          );
                        }}
                        disabled={cursor >= run.candles.length - 1}
                      >
                        Step +1
                      </Button>
                      <div className="ml-2 flex items-center gap-2 text-xs text-primary-foreground/85">
                        <span>Velocidad (ms)</span>
                        <Input
                          className="h-8 w-24 border-white/20 bg-white/95 text-slate-700"
                          type="number"
                          min={30}
                          max={3000}
                          step={10}
                          value={speedMs}
                          onChange={(event) => {
                            const next = Number(event.target.value);
                            if (!Number.isNaN(next) && Number.isFinite(next)) {
                              setSpeedMs(
                                Math.max(30, Math.min(3000, Math.floor(next))),
                              );
                            }
                          }}
                        />
                      </div>
                      <Button
                        variant="outline"
                        className="border-white/25 bg-white/10 text-primary-foreground hover:bg-white/20"
                        onClick={() => setIndicatorsModalOpen(true)}
                      >
                        Indicadores{" "}
                        {movingAverages.length > 0
                          ? `(${movingAverages.length})`
                          : ""}
                      </Button>
                    </div>

                    <div className="break-words text-xs text-muted-foreground">
                      Barra {Math.min(cursor + 1, run.candles.length)}/
                      {run.candles.length} | Candle actual:{" "}
                      {fmtDate(currentCandle?.time_utc)}
                    </div>

                    <RuntimePixiChart
                      title={`${run.symbol} backtest (${STRATEGY_LABELS[run.strategy]})`}
                      timeframeLabel={run.timeframe}
                      stageLabel={
                        playing ? "Playback running" : "Playback paused"
                      }
                      symbol=""
                      dataMode="historical"
                      useWebSocket={false}
                      height={520}
                      candlesFallback={chartCandles}
                      showLegLabels={isLegContinuationStrategy}
                      tradeMarkers={tradeMarkers}
                      selectedTradeHighlight={
                        selectedTrade
                          ? {
                              start_time:
                                selectedTrade.entry_time ??
                                selectedTrade.setup_time ??
                                selectedTrade.exit_time,
                              end_time:
                                selectedTrade.exit_time ??
                                selectedTrade.entry_time ??
                                selectedTrade.setup_time,
                              entry: selectedTrade.entry,
                              exit: selectedTrade.exit,
                              side: selectedTrade.side,
                            }
                          : null
                      }
                      focusTimeUtc={focusTimeUtc}
                      movingAverages={movingAverages}
                      onDeselectSelectedTrade={() => {
                        setSelectedTradeId(null);
                        setFocusTimeUtc(null);
                        setM15FocusRangeUtc(null);
                      }}
                      onLegBoxClick={(leg) => {
                        if (!showM15DetailChart) return;
                        setPlaying(false);
                        setSelectedTradeId(null);
                        setFocusTimeUtc(leg.startTimeUtc);
                        setM15FocusRangeUtc({
                          startTimeUtc: leg.startTimeUtc,
                          endExclusiveTimeUtc: leg.endExclusiveTimeUtc,
                        });
                        m15SectionRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }}
                    />

                    <div className="text-xs text-muted-foreground">
                      Marcadores: <b>B</b> buy entry, <b>S</b> sell entry,{" "}
                      <b>P</b> profit, <b>L</b> loss.
                    </div>
                  </CardContent>
                </Card>

                {showM15DetailChart ? (
                  <Card ref={m15SectionRef} className="min-w-0 overflow-hidden">
                    <CardHeader className="border-b border-border/70 bg-background/55">
                      <CardTitle>
                        Detalle M15 (contexto de entrada/salida)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="min-w-0 space-y-3 px-4 py-4 md:px-5">
                      <RuntimePixiChart
                        title={`${run.symbol} detalle M15`}
                        timeframeLabel="M15"
                        stageLabel={
                          selectedTrade
                            ? "Trade seleccionado"
                            : "Seguimiento por playback"
                        }
                        symbol=""
                        dataMode="historical"
                        useWebSocket={false}
                        height={420}
                        candlesFallback={detailChartCandlesM15}
                        showLegLabels={isLegContinuationStrategy}
                        overlayStructureFromTimeframe="H4"
                        overlayStructureCandlesFallback={chartCandles}
                        tradeMarkers={
                          selectedTrade ? selectedTradeMarkers : tradeMarkers
                        }
                        selectedTradeHighlight={
                          selectedTrade
                            ? {
                                start_time:
                                  selectedTrade.entry_time ??
                                  selectedTrade.setup_time ??
                                  selectedTrade.exit_time,
                                end_time:
                                  selectedTrade.exit_time ??
                                  selectedTrade.entry_time ??
                                  selectedTrade.setup_time,
                                entry: selectedTrade.entry,
                                exit: selectedTrade.exit,
                                side: selectedTrade.side,
                              }
                            : null
                        }
                        focusTimeUtc={detailFocusTimeUtc}
                        focusRangeUtc={m15FocusRangeUtc}
                        movingAverages={movingAverages}
                      />
                      <div className="text-xs text-muted-foreground">
                        Esta vista te permite ver en M15 exactamente donde y
                        como se activa la operacion definida en H4.
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                <Card className="overflow-hidden">
                  <CardHeader className="border-b border-border/70 bg-background/55">
                    <CardTitle>Trades</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 py-4 md:px-5">
                    {run.trades.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No hay trades en el rango seleccionado.
                      </p>
                    ) : (
                      <>
                        <Accordion
                          type="single"
                          collapsible
                          className="rounded-xl border border-border/75 bg-card/65 px-3"
                        >
                          <AccordionItem value="all-trades">
                            <AccordionTrigger className="py-3 hover:no-underline">
                              <div className="flex w-full flex-wrap items-center justify-between gap-2 pr-3 text-left">
                                <span className="text-sm font-medium">
                                  Lista completa de operaciones
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {run.trades.length} trades
                                </span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-2">
                                {run.trades.map((trade, index) => (
                                  <button
                                    key={trade.id}
                                    type="button"
                                    onClick={() => jumpToTrade(trade)}
                                    className={`w-full rounded-xl border border-border/75 bg-background/70 p-3 text-left text-sm transition-colors ${
                                      selectedTradeId === trade.id
                                        ? "border-primary/50 bg-primary/10"
                                        : "hover:bg-muted/50"
                                    }`}
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="font-medium">
                                        Trade #{index + 1} ·{" "}
                                        {String(trade.side).toUpperCase()}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        {trade.result ?? "-"} ·{" "}
                                        {fmtPnl(trade.pnl_points)}
                                      </span>
                                    </div>
                                    <div className="mt-1 grid gap-1 text-xs text-muted-foreground md:grid-cols-4">
                                      <div>
                                        Entry: {fmtDate(trade.entry_time)} @{" "}
                                        {fmtPrice(trade.entry)}
                                      </div>
                                      <div>
                                        Exit: {fmtDate(trade.exit_time)} @{" "}
                                        {fmtPrice(trade.exit)}
                                      </div>
                                      <div>
                                        Setup: {fmtDate(trade.setup_time)}
                                      </div>
                                      <div>PnL: {fmtPnl(trade.pnl_points)}</div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>

                        <div className="mt-4 rounded-xl border border-border/75 bg-secondary/35 p-3 text-xs">
                          <div className="mb-2 font-medium text-foreground">
                            Resumen total
                          </div>
                          <div className="grid gap-2 md:grid-cols-4">
                            <div>Total trades: {run.trades.length}</div>
                            <div>Ganadoras: {tradesTotals.wins}</div>
                            <div>Perdedoras: {tradesTotals.losses}</div>
                            <div>Neutras: {tradesTotals.neutral}</div>
                            <div className="md:col-span-4">
                              PnL acumulado: {fmtPnl(tradesTotals.pnl)}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : null}
          </div>

          <div
            className={cn(
              "min-w-0 space-y-5 pl-0 md:pl-2",
              viewMode === "portfolio"
                ? "animate-in slide-in-from-left-4 duration-300"
                : "hidden",
            )}
          >
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/70 bg-background/55">
                <CardTitle>{PORTFOLIO_VIEW_NAME}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-4 py-4 md:px-5">
                <p className="text-sm text-muted-foreground">
                  Ejecuta la estrategia en todos los pares disponibles para el
                  rango de fecha seleccionado y evalua todas las combinaciones
                  TP/SL.
                </p>

                <div className="premium-toolbar flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    className="bg-white/95 text-slate-800 hover:bg-white"
                    onClick={runPortfolioBacktest}
                    disabled={portfolioLoading}
                  >
                    {portfolioLoading
                      ? "Corriendo barrido..."
                      : `Correr ${PORTFOLIO_VIEW_NAME}`}
                  </Button>
                  <span className="text-xs text-primary-foreground/85">
                    Motor: {STRATEGY_LABELS["leg_continuation_h4_m15"]} | Fecha:{" "}
                    {start || "-"} {"->"} {end || "-"}
                  </span>
                  <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs text-primary-foreground">
                    Progreso: {fmtCount(portfolioProgressDone)}/
                    {fmtCount(
                      portfolioProgressTotal ||
                        GRID_SL_VALUES.length * GRID_TP_VALUES.length,
                    )}
                  </span>
                  {portfolioLoading ? (
                    <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs text-primary-foreground">
                      Probando: {portfolioCurrentSymbol ?? "-"} | SL{" "}
                      {portfolioCurrentSl ?? "-"} | TP{" "}
                      {portfolioCurrentTp ?? "-"}
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="ml-auto border-white/25 bg-white/10 text-primary-foreground hover:bg-white/20"
                    onClick={() => setViewMode("single")}
                  >
                    Volver a individual
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-border/75 bg-card/85 p-3">
                    <div className="text-xs uppercase text-muted-foreground">
                      Combinaciones
                    </div>
                    <div className="mt-1 text-xl font-semibold">
                      {portfolioResult
                        ? fmtCount(portfolioResult.combinations)
                        : "70"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/75 bg-card/85 p-3">
                    <div className="text-xs uppercase text-muted-foreground">
                      Pares evaluados
                    </div>
                    <div className="mt-1 text-xl font-semibold">
                      {portfolioResult
                        ? fmtCount(portfolioResult.symbols.length)
                        : portfolioLoading
                          ? "..."
                          : "-"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/75 bg-card/85 p-3">
                    <div className="text-xs uppercase text-muted-foreground">
                      Grid TP
                    </div>
                    <div className="mt-1 text-sm">
                      40, 60, 80, 100, 200, 250, 300, 400, 500, 600
                    </div>
                  </div>
                </div>

                {portfolioError ? (
                  <div className="rounded-xl border border-destructive/35 bg-destructive/5 p-3 text-sm text-destructive">
                    {portfolioError}
                  </div>
                ) : null}

                {!portfolioResult && !portfolioLoading ? (
                  <div className="rounded-xl border border-border/75 bg-secondary/35 p-4 text-sm text-muted-foreground">
                    Corre el barrido para ver la tabla agregada por combinacion
                    TP/SL.
                  </div>
                ) : null}

                {portfolioResult ? (
                  <div className="overflow-hidden rounded-2xl border border-border/75 bg-card/70">
                    <Table className="w-full table-fixed text-xs">
                      <TableHeader>
                        <TableRow className="border-b bg-secondary/45 hover:bg-secondary/45">
                          <TableHead className="h-9 px-2 text-[10px] font-semibold uppercase tracking-[0.02em]">
                            SL
                          </TableHead>
                          <TableHead className="h-9 px-2 text-[10px] font-semibold uppercase tracking-[0.02em]">
                            TP
                          </TableHead>
                          <TableHead className="h-9 px-2 text-right text-[10px] font-semibold uppercase tracking-[0.02em]">
                            Trades
                          </TableHead>
                          <TableHead className="h-9 px-2 text-right text-[10px] font-semibold uppercase tracking-[0.02em]">
                            Win rate
                          </TableHead>
                          <TableHead className="h-9 px-2 text-right text-[10px] font-semibold uppercase tracking-[0.02em]">
                            PnL total
                          </TableHead>
                          <TableHead className="h-9 px-2 text-right text-[10px] font-semibold uppercase tracking-[0.02em]">
                            Pares c/ trade
                          </TableHead>
                          <TableHead className="h-9 px-2 text-right text-[10px] font-semibold uppercase tracking-[0.02em]">
                            Pares evaluados
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {portfolioResult.rows.map((row) => (
                          <TableRow
                            key={`${row.slPoints}-${row.tpPoints}`}
                            className="cursor-pointer odd:bg-card even:bg-secondary/25 hover:bg-emerald-100/35"
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setSelectedPortfolioRow(row);
                              setPortfolioDetailOpen(true);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedPortfolioRow(row);
                                setPortfolioDetailOpen(true);
                              }
                            }}
                          >
                            <TableCell className="px-2 py-2 font-medium">
                              {row.slPoints}
                            </TableCell>
                            <TableCell className="px-2 py-2 font-medium">
                              {row.tpPoints}
                            </TableCell>
                            <TableCell className="px-2 py-2 text-right tabular-nums">
                              {fmtCount(row.totalTrades)}
                            </TableCell>
                            <TableCell className="px-2 py-2 text-right tabular-nums">
                              {row.winRate.toFixed(2)}%
                            </TableCell>
                            <TableCell className="px-2 py-2 text-right tabular-nums">
                              {fmtPnl(row.totalPnlPoints)}
                            </TableCell>
                            <TableCell className="px-2 py-2 text-right tabular-nums">
                              {fmtCount(row.pairsWithTrades)}
                            </TableCell>
                            <TableCell className="px-2 py-2 text-right tabular-nums">
                              {fmtCount(row.pairsProcessed)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={portfolioDetailOpen} onOpenChange={setPortfolioDetailOpen}>
        <DialogContent className="flex max-h-[95vh] flex-col overflow-hidden rounded-2xl border-border/80 bg-background/95 p-0 sm:max-w-[96vw]">
          <DialogHeader>
            <div className="border-b border-border/70 px-6 py-5">
              <span className="premium-chip bg-accent/45">
                Detalle de Combinacion
              </span>
              <DialogTitle className="mt-2">
                {selectedPortfolioRow
                  ? `SL ${selectedPortfolioRow.slPoints} / TP ${selectedPortfolioRow.tpPoints}`
                  : "Detalle"}
              </DialogTitle>
              <DialogDescription className="mt-1">
                Organizado por instrumento y por mes. Dentro de cada mes se
                listan todos los trades.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {!selectedPortfolioRow ? (
              <div className="rounded-xl border border-border/75 bg-secondary/35 p-4 text-sm text-muted-foreground">
                Selecciona una fila para abrir su detalle.
              </div>
            ) : selectedPortfolioRow.details.length === 0 ? (
              <div className="rounded-xl border border-border/75 bg-secondary/35 p-4 text-sm text-muted-foreground">
                No hay detalle disponible para esta combinacion.
              </div>
            ) : (
              <Tabs
                value={portfolioDetailTab}
                onValueChange={setPortfolioDetailTab}
                className="space-y-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted px-3 py-2">
                  <div className="scrollbar-none w-full flex-1 overflow-x-auto overflow-y-hidden">
                    <TabsList className="h-auto w-max min-w-max flex-nowrap justify-start gap-1 bg-transparent py-0.5 pr-2">
                      <TabsTrigger
                        value="summary"
                        className="h-9 rounded-xl border border-white/12 bg-ring px-3 py-1.5 text-xs text-primary-foreground/90 data-[state=active]:border-background data-[state=active]:bg-background data-[state=active]:text-foreground"
                      >
                        Overview
                      </TabsTrigger>
                      {selectedPortfolioRow.details.map((instrumentDetail) => (
                        <TabsTrigger
                          key={`tab-${instrumentDetail.symbol}`}
                          value={instrumentDetail.symbol}
                          className="h-9 rounded-xl border border-white/12 bg-ring px-3 py-1.5 text-xs text-primary-foreground/90 data-[state=active]:border-background data-[state=active]:bg-background data-[state=active]:text-foreground"
                        >
                          {instrumentDetail.symbol}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex h-9 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 text-xs text-primary">
                      <Search className="h-3.5 w-3.5" />
                      Search by trade or ID
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 text-xs text-primary"
                    >
                      <Filter className="h-3.5 w-3.5" />
                      Filter
                    </button>
                  </div>
                </div>

                <TabsContent
                  value="summary"
                  className="-mt-1 space-y-2 rounded-2xl border border-border/75 bg-background px-3 pt-3 pb-3"
                >
                  {portfolioSummaryStats ? (
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-xl border border-border/75 bg-card/85 p-3">
                        <div className="text-xs uppercase text-muted-foreground">
                          Instrumentos
                        </div>
                        <div className="mt-1 text-2xl font-semibold">
                          {fmtCount(portfolioSummaryStats.totalInstruments)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/75 bg-card/85 p-3">
                        <div className="text-xs uppercase text-muted-foreground">
                          Trades totales
                        </div>
                        <div className="mt-1 text-2xl font-semibold">
                          {fmtCount(portfolioSummaryStats.totalTrades)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/75 bg-card/85 p-3">
                        <div className="text-xs uppercase text-muted-foreground">
                          Win rate global
                        </div>
                        <div className="mt-1 text-2xl font-semibold">
                          {portfolioSummaryStats.weightedWinRate.toFixed(2)}%
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/75 bg-card/85 p-3">
                        <div className="text-xs uppercase text-muted-foreground">
                          PnL total
                        </div>
                        <div className="mt-1 text-2xl font-semibold">
                          {fmtPnl(portfolioSummaryStats.totalPnl)}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-border/75 bg-card/85 p-3">
                      <div className="mb-2 text-sm font-medium">
                        PnL por instrumento
                      </div>
                      <ChartContainer
                        config={summaryPnlChartConfig}
                        className="!aspect-auto h-[220px] min-h-[220px] w-full"
                      >
                        <BarChart
                          data={(selectedPortfolioRow?.details ?? []).map(
                            (item) => ({
                              symbol: item.symbol,
                              pnl: Number(item.totalPnlPoints.toFixed(2)),
                            }),
                          )}
                        >
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="symbol"
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                            minTickGap={14}
                            angle={-18}
                            textAnchor="end"
                            height={56}
                            tick={{ fontSize: 10 }}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            width={70}
                            tick={{ fontSize: 10 }}
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar
                            dataKey="pnl"
                            radius={[6, 6, 0, 0]}
                            fill="var(--color-pnl)"
                          />
                        </BarChart>
                      </ChartContainer>
                    </div>
                    <div className="rounded-xl border border-border/75 bg-card/85 p-3">
                      <div className="mb-2 text-sm font-medium">
                        PnL por mes
                      </div>
                      <ChartContainer
                        config={summaryMonthlyPnlChartConfig}
                        className="!aspect-auto h-[220px] min-h-[220px] w-full"
                      >
                        <BarChart data={portfolioMonthlyPnlData}>
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="month"
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                            minTickGap={18}
                            angle={-20}
                            textAnchor="end"
                            height={56}
                            tick={{ fontSize: 10 }}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            width={70}
                            tick={{ fontSize: 10 }}
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar
                            dataKey="pnl"
                            radius={[6, 6, 0, 0]}
                            fill="var(--color-pnl)"
                          />
                        </BarChart>
                      </ChartContainer>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-b-2xl rounded-tr-2xl border border-border/75 bg-card">
                    <Table className="w-full text-sm">
                      <TableHeader>
                        <TableRow className="border-b bg-secondary/35 hover:bg-secondary/35">
                          <TableHead className="h-10 px-3 text-[11px] font-semibold uppercase tracking-[0.03em]">
                            Activity
                          </TableHead>
                          <TableHead className="h-10 px-3 text-[11px] font-semibold uppercase tracking-[0.03em]">
                            Symbol
                          </TableHead>
                          <TableHead className="h-10 px-3 text-right text-[11px] font-semibold uppercase tracking-[0.03em]">
                            Trades
                          </TableHead>
                          <TableHead className="h-10 px-3 text-right text-[11px] font-semibold uppercase tracking-[0.03em]">
                            Win Rate
                          </TableHead>
                          <TableHead className="h-10 px-3 text-right text-[11px] font-semibold uppercase tracking-[0.03em]">
                            PnL Total
                          </TableHead>
                          <TableHead className="h-10 px-3 text-right text-[11px] font-semibold uppercase tracking-[0.03em]">
                            Months
                          </TableHead>
                          <TableHead className="h-10 w-10 px-3 text-right text-[11px] font-semibold uppercase tracking-[0.03em]">
                            ...
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPortfolioRow.details.map(
                          (instrumentDetail) => (
                            <TableRow
                              key={`summary-${instrumentDetail.symbol}`}
                              className="odd:bg-card even:bg-secondary/15 hover:bg-secondary/30"
                            >
                              <TableCell className="px-3 py-2 font-medium">
                                Portfolio
                              </TableCell>
                              <TableCell className="px-3 py-2 font-medium">
                                {instrumentDetail.symbol}
                              </TableCell>
                              <TableCell className="px-3 py-2 text-right tabular-nums">
                                {fmtCount(instrumentDetail.totalTrades)}
                              </TableCell>
                              <TableCell className="px-3 py-2 text-right tabular-nums">
                                {instrumentDetail.winRate.toFixed(2)}%
                              </TableCell>
                              <TableCell className="px-3 py-2 text-right tabular-nums">
                                {fmtPnl(instrumentDetail.totalPnlPoints)}
                              </TableCell>
                              <TableCell className="px-3 py-2 text-right tabular-nums">
                                {fmtCount(instrumentDetail.months.length)}
                              </TableCell>
                              <TableCell className="px-3 py-2 text-right text-muted-foreground">
                                ...
                              </TableCell>
                            </TableRow>
                          ),
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {selectedPortfolioRow.details.map((instrumentDetail) => (
                  <TabsContent
                    key={`content-${instrumentDetail.symbol}`}
                    value={instrumentDetail.symbol}
                    className="-mt-1 space-y-2 rounded-2xl border border-border/75 bg-background px-3 pt-3 pb-3"
                  >
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-border/75 bg-card/85 p-3">
                        <div className="text-xs uppercase text-muted-foreground">
                          Trades
                        </div>
                        <div className="mt-1 text-2xl font-semibold">
                          {fmtCount(instrumentDetail.totalTrades)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/75 bg-card/85 p-3">
                        <div className="text-xs uppercase text-muted-foreground">
                          Win rate
                        </div>
                        <div className="mt-1 text-2xl font-semibold">
                          {instrumentDetail.winRate.toFixed(2)}%
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/75 bg-card/85 p-3">
                        <div className="text-xs uppercase text-muted-foreground">
                          PnL total
                        </div>
                        <div className="mt-1 text-2xl font-semibold">
                          {fmtPnl(instrumentDetail.totalPnlPoints)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/75 bg-card/85 p-3">
                      <div className="mb-2 text-sm font-medium">
                        Evolucion mensual ({instrumentDetail.symbol})
                      </div>
                      <ChartContainer
                        config={instrumentMonthChartConfig}
                        className="!aspect-auto h-[220px] min-h-[220px] w-full"
                      >
                        <BarChart
                          data={instrumentDetail.months.map((month) => ({
                            month: month.monthLabel,
                            trades: month.totalTrades,
                            pnl: Number(month.totalPnlPoints.toFixed(2)),
                          }))}
                        >
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="month"
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                            minTickGap={18}
                            angle={-20}
                            textAnchor="end"
                            height={56}
                            tick={{ fontSize: 10 }}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            width={60}
                            tick={{ fontSize: 10 }}
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar
                            dataKey="pnl"
                            radius={[6, 6, 0, 0]}
                            fill="var(--color-pnl)"
                          />
                        </BarChart>
                      </ChartContainer>
                    </div>

                    <div className="overflow-hidden rounded-b-2xl rounded-tr-2xl border border-border/75 bg-card">
                      <Table className="w-full text-sm">
                        <TableHeader>
                          <TableRow className="border-b bg-secondary/35 hover:bg-secondary/35">
                            <TableHead className="h-10 px-3 text-[11px] font-semibold uppercase tracking-[0.03em]">
                              Activity
                            </TableHead>
                            <TableHead className="h-10 px-3 text-[11px] font-semibold uppercase tracking-[0.03em]">
                              Order ID
                            </TableHead>
                            <TableHead className="h-10 px-3 text-[11px] font-semibold uppercase tracking-[0.03em]">
                              Type
                            </TableHead>
                            <TableHead className="h-10 px-3 text-[11px] font-semibold uppercase tracking-[0.03em]">
                              Time
                            </TableHead>
                            <TableHead className="h-10 px-3 text-[11px] font-semibold uppercase tracking-[0.03em]">
                              Date
                            </TableHead>
                            <TableHead className="h-10 px-3 text-right text-[11px] font-semibold uppercase tracking-[0.03em]">
                              Price
                            </TableHead>
                            <TableHead className="h-10 px-3 text-right text-[11px] font-semibold uppercase tracking-[0.03em]">
                              Status
                            </TableHead>
                            <TableHead className="h-10 w-10 px-3 text-right text-[11px] font-semibold uppercase tracking-[0.03em]">
                              ...
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                      </Table>
                    </div>

                    <Accordion type="multiple" className="space-y-2">
                      {instrumentDetail.months.map((monthDetail) => (
                        <AccordionItem
                          key={`${instrumentDetail.symbol}-${monthDetail.monthKey}`}
                          value={`month-${instrumentDetail.symbol}-${monthDetail.monthKey}`}
                          className="overflow-hidden rounded-xl border border-border/70 bg-background/70"
                        >
                          <AccordionTrigger className="px-3 py-2.5 hover:no-underline">
                            <div className="grid w-full grid-cols-[160px_1fr_120px_120px_120px_140px_120px_40px] items-center gap-2 pr-3 text-left text-sm">
                              <span className="font-medium">
                                {monthDetail.monthLabel}
                              </span>
                              <span className="text-muted-foreground">
                                Monthly batch
                              </span>
                              <span className="text-muted-foreground">
                                Summary
                              </span>
                              <span className="text-muted-foreground">-</span>
                              <span className="text-muted-foreground">-</span>
                              <span className="text-right tabular-nums">
                                {fmtPnl(monthDetail.totalPnlPoints)}
                              </span>
                              <span className="text-right">
                                <span
                                  className={cn(
                                    "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                    tradeStatusClass(
                                      undefined,
                                      monthDetail.totalPnlPoints,
                                    ),
                                  )}
                                >
                                  {monthDetail.winRate.toFixed(2)}%
                                </span>
                              </span>
                              <span className="text-right text-muted-foreground">
                                ...
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="border-t border-border/60 bg-card/75 px-3 py-3">
                            <div className="space-y-2">
                              {monthDetail.trades.map((trade, idx) => (
                                <div
                                  key={`${trade.id}-${idx}`}
                                  className="grid grid-cols-[160px_1fr_120px_120px_120px_140px_120px_40px] items-center gap-2 rounded-lg border border-border/65 bg-background/85 px-3 py-2 text-xs"
                                >
                                  <span className="font-medium">
                                    Transaction
                                  </span>
                                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                                    {trade.id}
                                  </span>
                                  <span>{trade.side.toUpperCase()}</span>
                                  <span className="text-muted-foreground">
                                    {trade.entry_time
                                      ? new Date(
                                          trade.entry_time,
                                        ).toLocaleTimeString()
                                      : "-"}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {trade.entry_time
                                      ? new Date(
                                          trade.entry_time,
                                        ).toLocaleDateString()
                                      : "-"}
                                  </span>
                                  <span className="text-right tabular-nums">
                                    {fmtPrice(trade.entry)}
                                  </span>
                                  <span className="text-right">
                                    <span
                                      className={cn(
                                        "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                        tradeStatusClass(
                                          trade.result,
                                          trade.pnl_points,
                                        ),
                                      )}
                                    >
                                      {tradeStatusLabel(
                                        trade.result,
                                        trade.pnl_points,
                                      )}
                                    </span>
                                  </span>
                                  <span className="text-right text-muted-foreground">
                                    ...
                                  </span>
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </div>

          <DialogFooter className="border-t border-border/70 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPortfolioDetailOpen(false)}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={indicatorsModalOpen} onOpenChange={setIndicatorsModalOpen}>
        <DialogContent className="rounded-2xl border-border/80 bg-background/95 p-0 sm:max-w-2xl">
          <DialogHeader>
            <div className="border-b border-border/70 px-6 py-5">
              <span className="premium-chip bg-accent/45">Chart Tools</span>
              <DialogTitle className="mt-2">Indicadores</DialogTitle>
              <DialogDescription className="mt-1">
                Agrega SMA o EMA con su configuracion. Se aplican al grafico
                principal y al detalle M15.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="space-y-3 px-6 py-4">
            <div className="grid gap-3 rounded-2xl border border-border/75 bg-card/85 p-3 md:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-border/70 bg-background/75 p-3">
                <div className="text-xs uppercase text-muted-foreground">
                  Indicador
                </div>
                <Select
                  value={indicatorKind}
                  onValueChange={(value) =>
                    setIndicatorKind(value as "sma" | "ema")
                  }
                >
                  <SelectTrigger className="w-full bg-background/85">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sma">SMA</SelectItem>
                    <SelectItem value="ema">EMA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 rounded-xl border border-border/70 bg-background/75 p-3">
                <div className="text-xs uppercase text-muted-foreground">
                  Periodo
                </div>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={indicatorPeriod}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (!Number.isNaN(next) && Number.isFinite(next)) {
                      setIndicatorPeriod(Math.max(1, Math.floor(next)));
                    }
                  }}
                />
              </div>
            </div>

            <Button type="button" onClick={addIndicator}>
              Agregar indicador
            </Button>

            <div className="space-y-2">
              <div className="text-xs uppercase text-muted-foreground">
                Activos
              </div>
              {movingAverages.length === 0 ? (
                <div className="rounded-xl border border-border/75 bg-secondary/35 p-3 text-sm text-muted-foreground">
                  No hay indicadores activos.
                </div>
              ) : (
                <div className="space-y-2">
                  {movingAverages.map((item, index) => (
                    <div
                      key={`${item.kind}:${item.period}:${index}`}
                      className="flex items-center justify-between rounded-xl border border-border/75 bg-card/85 p-2 text-sm"
                    >
                      <span>
                        {item.label ??
                          `${item.kind.toUpperCase()}(${item.period})`}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeIndicator(index)}
                      >
                        Quitar
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-border/70 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIndicatorsModalOpen(false)}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
