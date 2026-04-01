"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import RuntimePixiChart, { type RuntimeMovingAverageConfig } from "@/components/bots/runtime-pixi-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BotRuntimeH4Candle } from "@/lib/types";

type StrategyKey = "peak" | "break_retest" | "leg_continuation" | "fib";

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

const STRATEGY_LABELS: Record<StrategyKey, string> = {
  peak: "Peak/Dip",
  break_retest: "Break + Retest",
  leg_continuation: "Leg Continuation",
  fib: "Fib",
};

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

export default function BacktestingPage() {
  const [meta, setMeta] = useState<DatasetMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [loadingRun, setLoadingRun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [strategy, setStrategy] = useState<StrategyKey>("peak");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [speedMs, setSpeedMs] = useState(180);
  const [indicatorsModalOpen, setIndicatorsModalOpen] = useState(false);
  const [indicatorKind, setIndicatorKind] = useState<"sma" | "ema">("sma");
  const [indicatorPeriod, setIndicatorPeriod] = useState(20);
  const [movingAverages, setMovingAverages] = useState<RuntimeMovingAverageConfig[]>([]);

  const [run, setRun] = useState<BacktestRun | null>(null);
  const [detailRunM15, setDetailRunM15] = useState<BacktestRun | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [focusTimeUtc, setFocusTimeUtc] = useState<string | null>(null);
  const chartSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const loadMeta = async () => {
      setMetaLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/backtesting/datasets");
        if (!response.ok) {
          throw new Error(`No se pudieron cargar datasets (${response.status})`);
        }

        const payload = (await response.json()) as DatasetMeta;
        setMeta(payload);

        const firstSymbol = payload.symbols[0] ?? "";
        const firstTimeframe = payload.timeframesBySymbol[firstSymbol]?.[0] ?? "";
        const firstStrategy = payload.strategiesBySymbol[firstSymbol]?.[0] ?? "peak";

        setSymbol(firstSymbol);
        setTimeframe(firstTimeframe);
        setStrategy(firstStrategy);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error cargando metadata";
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

  const runBacktest = async () => {
    if (!symbol || !timeframe || !strategy) return;

    setLoadingRun(true);
    setError(null);
    setPlaying(false);

    try {
      const buildRunUrl = (tf: string) => {
        const params = new URLSearchParams({ symbol, timeframe: tf, strategy });
        if (start) params.set("start", start);
        if (end) params.set("end", end);
        return `/api/backtesting/run?${params.toString()}`;
      };
      const fetchRun = async (tf: string) => {
        const response = await fetch(buildRunUrl(tf));
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || `No se pudo correr backtest (${response.status})`);
        }
        return (await response.json()) as BacktestRun;
      };

      const mainPayload = await fetchRun(timeframe);
      setRun(mainPayload);

      const canLoadM15Detail = timeframe === "H4" && (meta?.timeframesBySymbol[symbol] ?? []).includes("M15");
      if (canLoadM15Detail) {
        const detailPayload = await fetchRun("M15");
        setDetailRunM15(detailPayload);
      } else {
        setDetailRunM15(null);
      }

      setCursor(0);
      setSelectedTradeId(null);
      setFocusTimeUtc(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error corriendo backtest";
      setError(message);
      setRun(null);
      setDetailRunM15(null);
    } finally {
      setLoadingRun(false);
    }
  };

  const visibleCandles = useMemo(() => {
    if (!run || run.candles.length === 0) return [] as BacktestCandle[];
    return run.candles.slice(0, Math.max(1, cursor + 1));
  }, [run, cursor]);

  const runtimeCandles = useMemo(() => toRuntimeCandles(visibleCandles), [visibleCandles]);

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

    chartSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      const exists = current.some((item) => item.kind === next.kind && item.period === next.period);
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
    ? selectedTrade.entry_time ?? selectedTrade.setup_time ?? selectedTrade.exit_time ?? null
    : currentCandle?.time_utc ?? null;
  const showM15DetailChart = Boolean(run && detailRunM15 && timeframe === "H4");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Backtesting</h1>
        <p className="text-sm text-muted-foreground">
          Reproduce tus estrategias visualmente con los CSV de <code>/data</code>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuracion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <div className="text-xs uppercase text-muted-foreground">Symbol</div>
              <Select value={symbol} onValueChange={setSymbol} disabled={metaLoading || !meta}>
                <SelectTrigger>
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
              <div className="text-xs uppercase text-muted-foreground">Timeframe</div>
              <Select value={timeframe} onValueChange={setTimeframe} disabled={!symbol || availableTimeframes.length === 0}>
                <SelectTrigger>
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
              <div className="text-xs uppercase text-muted-foreground">Estrategia</div>
              <Select
                value={strategy}
                onValueChange={(value: StrategyKey) => setStrategy(value)}
                disabled={!symbol || availableStrategies.length === 0}
              >
                <SelectTrigger>
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
              <div className="text-xs uppercase text-muted-foreground">Start (opcional)</div>
              <Input value={start} onChange={(event) => setStart(event.target.value)} placeholder="2025-03-01" />
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase text-muted-foreground">End (opcional)</div>
              <Input value={end} onChange={(event) => setEnd(event.target.value)} placeholder="2025-03-31" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={runBacktest} disabled={loadingRun || !symbol || !timeframe || !strategy}>
              {loadingRun ? "Cargando..." : "Correr backtest"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Data local: {symbol || "-"} {timeframe || "-"} | {STRATEGY_LABELS[strategy]}
            </span>
          </div>
        </CardContent>
      </Card>

      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      {run ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Velas</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">{run.candles.length}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Trades</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">{run.summary.totalTrades}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Win rate</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">{run.summary.winRate.toFixed(2)}%</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">PnL total</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">{fmtPnl(run.summary.totalPnlPoints)}</CardContent>
            </Card>
          </div>

          <Card ref={chartSectionRef}>
            <CardHeader>
              <CardTitle>Playback</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="default"
                  onClick={() => setPlaying(true)}
                  disabled={playing || visibleCandles.length === 0 || cursor >= run.candles.length - 1}
                >
                  Play
                </Button>
                <Button variant="secondary" onClick={() => setPlaying(false)} disabled={!playing}>
                  Pause
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPlaying(false);
                    setCursor(0);
                  }}
                >
                  Reset
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPlaying(false);
                    setCursor((prev) => Math.min(prev + 1, run.candles.length - 1));
                  }}
                  disabled={cursor >= run.candles.length - 1}
                >
                  Step +1
                </Button>
                <div className="ml-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Velocidad (ms)</span>
                  <Input
                    className="h-8 w-24"
                    type="number"
                    min={30}
                    max={3000}
                    step={10}
                    value={speedMs}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (!Number.isNaN(next) && Number.isFinite(next)) {
                        setSpeedMs(Math.max(30, Math.min(3000, Math.floor(next))));
                      }
                    }}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => setIndicatorsModalOpen(true)}
                >
                  Indicadores {movingAverages.length > 0 ? `(${movingAverages.length})` : ""}
                </Button>
              </div>

              <div className="text-xs text-muted-foreground">
                Barra {Math.min(cursor + 1, run.candles.length)}/{run.candles.length} | Candle actual: {fmtDate(currentCandle?.time_utc)}
              </div>

              <RuntimePixiChart
                title={`${run.symbol} backtest (${STRATEGY_LABELS[run.strategy]})`}
                timeframeLabel={run.timeframe}
                stageLabel={playing ? "Playback running" : "Playback paused"}
                symbol=""
                height={520}
                candlesFallback={chartCandles}
                tradeMarkers={tradeMarkers}
                selectedTradeHighlight={selectedTrade ? {
                  start_time: selectedTrade.entry_time ?? selectedTrade.setup_time ?? selectedTrade.exit_time,
                  end_time: selectedTrade.exit_time ?? selectedTrade.entry_time ?? selectedTrade.setup_time,
                  entry: selectedTrade.entry,
                  exit: selectedTrade.exit,
                  side: selectedTrade.side,
                } : null}
                focusTimeUtc={focusTimeUtc}
                movingAverages={movingAverages}
                onDeselectSelectedTrade={() => {
                  setSelectedTradeId(null);
                  setFocusTimeUtc(null);
                }}
              />

              <div className="text-xs text-muted-foreground">
                Marcadores: <b>B</b> buy entry, <b>S</b> sell entry, <b>P</b> profit, <b>L</b> loss.
              </div>
            </CardContent>
          </Card>

          {showM15DetailChart ? (
            <Card>
              <CardHeader>
                <CardTitle>Detalle M15 (contexto de entrada/salida)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <RuntimePixiChart
                  title={`${run.symbol} detalle M15`}
                  timeframeLabel="M15"
                  stageLabel={selectedTrade ? "Trade seleccionado" : "Seguimiento por playback"}
                  symbol=""
                  height={420}
                  candlesFallback={detailChartCandlesM15}
                  tradeMarkers={selectedTrade ? selectedTradeMarkers : []}
                  selectedTradeHighlight={selectedTrade ? {
                    start_time: selectedTrade.entry_time ?? selectedTrade.setup_time ?? selectedTrade.exit_time,
                    end_time: selectedTrade.exit_time ?? selectedTrade.entry_time ?? selectedTrade.setup_time,
                    entry: selectedTrade.entry,
                    exit: selectedTrade.exit,
                    side: selectedTrade.side,
                  } : null}
                  focusTimeUtc={detailFocusTimeUtc}
                  movingAverages={movingAverages}
                />
                <div className="text-xs text-muted-foreground">
                  Esta vista te permite ver en M15 exactamente donde y como se activa la operacion definida en H4.
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Trades</CardTitle>
            </CardHeader>
            <CardContent>
              {run.trades.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay trades en el rango seleccionado.</p>
              ) : (
                <>
                  <Accordion type="single" collapsible className="rounded-md border px-3">
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
                              className={`w-full rounded-md border p-3 text-left text-sm transition-colors ${
                                selectedTradeId === trade.id
                                  ? "border-primary bg-primary/5"
                                  : "hover:bg-muted/40"
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-medium">
                                  Trade #{index + 1} · {String(trade.side).toUpperCase()}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {trade.result ?? "-"} · {fmtPnl(trade.pnl_points)}
                                </span>
                              </div>
                              <div className="mt-1 grid gap-1 text-xs text-muted-foreground md:grid-cols-4">
                                <div>Entry: {fmtDate(trade.entry_time)} @ {fmtPrice(trade.entry)}</div>
                                <div>Exit: {fmtDate(trade.exit_time)} @ {fmtPrice(trade.exit)}</div>
                                <div>Setup: {fmtDate(trade.setup_time)}</div>
                                <div>PnL: {fmtPnl(trade.pnl_points)}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>

                  <div className="mt-4 rounded-md border bg-muted/30 p-3 text-xs">
                    <div className="mb-2 font-medium text-foreground">Resumen total</div>
                    <div className="grid gap-2 md:grid-cols-4">
                      <div>Total trades: {run.trades.length}</div>
                      <div>Ganadoras: {tradesTotals.wins}</div>
                      <div>Perdedoras: {tradesTotals.losses}</div>
                      <div>Neutras: {tradesTotals.neutral}</div>
                      <div className="md:col-span-4">PnL acumulado: {fmtPnl(tradesTotals.pnl)}</div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      <Dialog open={indicatorsModalOpen} onOpenChange={setIndicatorsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Indicadores</DialogTitle>
            <DialogDescription>
              Agrega SMA o EMA con su configuracion. Se aplican al grafico principal y al detalle M15.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs uppercase text-muted-foreground">Indicador</div>
                <Select
                  value={indicatorKind}
                  onValueChange={(value) => setIndicatorKind(value as "sma" | "ema")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sma">SMA</SelectItem>
                    <SelectItem value="ema">EMA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase text-muted-foreground">Periodo</div>
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
              <div className="text-xs uppercase text-muted-foreground">Activos</div>
              {movingAverages.length === 0 ? (
                <div className="rounded-md border p-3 text-sm text-muted-foreground">
                  No hay indicadores activos.
                </div>
              ) : (
                <div className="space-y-2">
                  {movingAverages.map((item, index) => (
                    <div key={`${item.kind}:${item.period}:${index}`} className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <span>{item.label ?? `${item.kind.toUpperCase()}(${item.period})`}</span>
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIndicatorsModalOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
