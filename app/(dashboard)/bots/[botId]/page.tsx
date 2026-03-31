"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  deleteBot,
  getBot,
  getBotLogs,
  runBotAction,
  runBotDryRun,
  startActiveBotsStream,
} from "@/lib/bots-api";
import type {
  Bot,
  BotLogsResponse,
  BotRuntimeH4Candle,
  BotStrategyRuntimeState,
  DryRunResponse,
} from "@/lib/types";
import { usePriceStream } from "@/hooks/usePriceStream";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import RuntimePixiChart from "@/components/bots/runtime-pixi-chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BotAction = "start" | "resume" | "pause" | "stop" | "delete";

function getPrimaryAction(status: Bot["status"]): Exclude<BotAction, "delete"> {
  if (status === "RUNNING") return "pause";
  if (status === "PAUSED") return "resume";
  return "start";
}

function formatStage(stage: string) {
  if (stage === "WAITING_H4_SETUP") return "Waiting H4 setup";
  if (stage === "WAITING_M15_ENTRY") return "Waiting M15 entry";
  if (stage === "WAITING_M5_SETUP") return "Waiting M5 setup";
  if (stage === "WAITING_M1_ENTRY") return "Waiting M1 entry";
  if (stage === "WAITING_H4_LEGS") return "Waiting H4 legs";
  if (stage === "WAITING_M5_LEGS") return "Waiting M5 legs";
  if (stage === "WAITING_BREAKOUT_OR_ENTRY") return "Waiting breakout or entry";
  return stage;
}

function formatDirection(direction: string) {
  if (direction === "bull") return "Bull";
  if (direction === "bear") return "Bear";
  return direction;
}

function getCandleTone(candle: BotRuntimeH4Candle) {
  if (candle.is_doji) {
    return "border-amber-300 bg-amber-50 text-amber-900";
  }

  return candle.direction === "bull"
    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
    : "border-red-300 bg-red-50 text-red-900";
}

function formatLivePrice(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) {
    return "Unavailable";
  }

  return value.toFixed(5);
}

function normalizeSymbolKey(value: string | undefined | null) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function RuntimeStateCard({
  runtimeState,
  livePrice,
  liveTimestamp,
}: {
  runtimeState: BotStrategyRuntimeState;
  livePrice?: number;
  liveTimestamp?: number;
}) {
  const strategyId = String(runtimeState.strategy ?? "").toLowerCase();
  const isPeakDipH4 = strategyId === "peak_dip";
  const isPeakDipM5M1 = strategyId === "peak_dip_m5_m1";
  const isLegContinuationH4M15 = strategyId === "leg_continuation_h4_m15";
  const isLegContinuationM5M1 = strategyId === "leg_continuation_m5_m1";
  const isLegContinuationStrategy = isLegContinuationH4M15 || isLegContinuationM5M1;
  const isPeakPatternStrategy = isPeakDipH4 || isPeakDipM5M1;
  const timeframeLabel = isPeakDipM5M1 ? "M5" : "H4";
  const runtimeProgress = isPeakDipM5M1 ? runtimeState.m5_progress : runtimeState.h4_progress;
  const runtimeCandles = isPeakDipM5M1 ? runtimeState.m5_last_4 ?? [] : runtimeState.h4_last_4 ?? [];
  const candles = [...runtimeCandles].slice(-4);
  const setupTimeframeLabel = isLegContinuationM5M1 ? "M5" : "H4";
  const entryTimeframeLabel = isLegContinuationM5M1 ? "M1" : "M15";
  const setupCount = isLegContinuationM5M1
    ? (runtimeState.m5_count ?? runtimeState.h4_count)
    : (runtimeState.h4_count ?? runtimeState.m5_count);
  const entryCount = isLegContinuationM5M1
    ? (runtimeState.m1_count ?? runtimeState.m15_count)
    : (runtimeState.m15_count ?? runtimeState.m1_count);
  const legContinuationSetupCandles = [
    ...((isLegContinuationM5M1
      ? (runtimeState.m5_last_4 ?? runtimeState.h4_last_4 ?? [])
      : (runtimeState.h4_last_4 ?? runtimeState.m5_last_4 ?? [])) as BotRuntimeH4Candle[]),
  ].slice(-4);
  const legContinuationEntryCandles = [
    ...((isLegContinuationM5M1
      ? (runtimeState.m1_last_4 ?? runtimeState.m15_last_4 ?? [])
      : (runtimeState.m15_last_4 ?? runtimeState.m1_last_4 ?? [])) as BotRuntimeH4Candle[]),
  ].slice(-4);
  const continuationLevel = typeof runtimeState.current_setup?.continuation_level === "number"
    ? runtimeState.current_setup.continuation_level
    : undefined;
  const currentSetup = runtimeState.current_setup ?? {};
  const m5LegFromSetup =
    asNumber((currentSetup as Record<string, unknown>).m5_leg) ??
    asNumber((currentSetup as Record<string, unknown>).m5_leg_index) ??
    asNumber((currentSetup as Record<string, unknown>).leg) ??
    asNumber((currentSetup as Record<string, unknown>).leg_index) ??
    asNumber((currentSetup as Record<string, unknown>).current_leg);
  const m5CurrentLeg = isLegContinuationM5M1
    ? Math.max(1, Math.floor(asNumber(runtimeState.m5_count) ?? m5LegFromSetup ?? legContinuationSetupCandles.length))
    : undefined;
  const currentStage = runtimeState.stage ? formatStage(String(runtimeState.stage)) : "-";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Strategy runtime</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Stage</div>
            <div className="text-sm font-medium">{runtimeState.stage ? formatStage(String(runtimeState.stage)) : "-"}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Strategy</div>
            <div className="text-sm">{runtimeState.strategy ?? "-"}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Symbol</div>
            <div className="text-sm">{runtimeState.symbol ?? "-"}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Pending windows</div>
            <div className="text-sm">{runtimeState.pending_windows_count ?? "-"}</div>
          </div>
        </div>

        {isPeakPatternStrategy && runtimeProgress ? (
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="mb-3 text-sm font-medium">{timeframeLabel} setup progress</div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Step</div>
                <div className="text-sm">{runtimeProgress.step ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Candidate side</div>
                <div className="text-sm">{runtimeProgress.candidate_side ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Non-doji count</div>
                <div className="text-sm">{runtimeProgress.non_doji_count ?? 0}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Message</div>
                <div className="text-sm">{runtimeProgress.message ?? "-"}</div>
              </div>
            </div>
          </div>
        ) : null}

        {isPeakPatternStrategy && candles.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Last 4 closed {timeframeLabel} candles</div>
              <div className="text-xs text-muted-foreground">{candles.length}/4 loaded</div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {candles.map((candle) => (
                <div
                  key={candle.time_utc}
                  className={`rounded-md border p-3 ${getCandleTone(candle)}`}
                >
                  <div className="mb-2 text-xs font-medium uppercase opacity-80">
                    {new Date(candle.time_utc).toLocaleString()}
                  </div>
                  <div className="grid gap-1 text-xs">
                    <div>Open: {candle.open}</div>
                    <div>High: {candle.high}</div>
                    <div>Low: {candle.low}</div>
                    <div>Close: {candle.close}</div>
                    <div>Direction: {formatDirection(candle.direction)}</div>
                    <div>Doji: {candle.is_doji ? "Yes" : "No"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {isLegContinuationStrategy ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="mb-3 text-sm font-medium">{setupTimeframeLabel}/{entryTimeframeLabel} setup progress</div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">{setupTimeframeLabel} candles buffered</div>
                  <div className="text-sm">{setupCount ?? "-"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">{entryTimeframeLabel} candles buffered</div>
                  <div className="text-sm">{entryCount ?? "-"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Pivot strength</div>
                  <div className="text-sm">{runtimeState.pivot_strength ?? "-"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Pending setups</div>
                  <div className="text-sm">{runtimeState.pending_setups_count ?? "-"}</div>
                </div>
              </div>
            </div>

            {runtimeState.current_setup ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">Current setup</div>
                <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">
                  {JSON.stringify(runtimeState.current_setup, null, 2)}
                </pre>
              </div>
            ) : null}

            <div className="space-y-4">
              <RuntimePixiChart
                title={`${setupTimeframeLabel} structure`}
                timeframeLabel={setupTimeframeLabel}
                symbol={String(runtimeState.symbol ?? "")}
                stageLabel={currentStage}
                candlesFallback={legContinuationSetupCandles}
                continuationLevel={continuationLevel}
                livePrice={livePrice}
                liveTimestamp={liveTimestamp}
                currentLeg={m5CurrentLeg}
                showLegLabels={isLegContinuationM5M1}
                pivotStrength={asNumber(runtimeState.pivot_strength)}
              />
              <RuntimePixiChart
                title={`${entryTimeframeLabel} entry`}
                timeframeLabel={entryTimeframeLabel}
                symbol={String(runtimeState.symbol ?? "")}
                stageLabel={currentStage}
                candlesFallback={legContinuationEntryCandles}
                continuationLevel={continuationLevel}
                livePrice={livePrice}
                liveTimestamp={liveTimestamp}
              />
              <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground md:grid-cols-2">
                <div>Stage: {currentStage}</div>
                <div>Continuation: {continuationLevel?.toFixed(5) ?? "-"}</div>
              </div>
            </div>
          </div>
        ) : null}

        {!isPeakPatternStrategy && !isLegContinuationStrategy ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">Runtime state payload</div>
            <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">
              {JSON.stringify(runtimeState, null, 2)}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function BotDetailPage() {
  const params = useParams<{ botId: string }>();
  const router = useRouter();
  const botId = params.botId;

  const [bot, setBot] = useState<Bot | null>(null);
  const [logs, setLogs] = useState<BotLogsResponse["logs"]>([]);
  const [dryRunResult, setDryRunResult] = useState<DryRunResponse | null>(null);

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [entry, setEntry] = useState("");

  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primaryAction = useMemo(() => (bot ? getPrimaryAction(bot.status) : "start"), [bot]);
  const showRuntimeState = Boolean(bot?.status === "RUNNING" && bot.runtimeActive && bot.strategyRuntimeState);

  const liveSymbols = useMemo(() => {
    if (!bot?.symbol) {
      return [] as string[];
    }

    const primary = String(bot.symbol).trim();
    const secondary = String(bot.instrument ?? "").trim();
    const symbols = [primary, secondary].filter(Boolean);
    return [...new Set(symbols)];
  }, [bot]);

  const { quotes, status: streamStatus, lastMessageAt } = usePriceStream(liveSymbols, 1);
  const liveQuote = useMemo(() => {
    if (!bot) return undefined;

    const candidates = [bot.symbol, bot.instrument]
      .map((value) => normalizeSymbolKey(value))
      .filter(Boolean);

    for (const [symbol, quote] of Object.entries(quotes)) {
      const normalized = normalizeSymbolKey(symbol);
      if (candidates.includes(normalized)) {
        return quote;
      }
    }

    return undefined;
  }, [bot, quotes]);
  const livePrice = liveQuote?.mid ?? liveQuote?.price ?? liveQuote?.bid ?? liveQuote?.ask;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [botData, logsData] = await Promise.all([
        getBot(botId),
        getBotLogs(botId, 100),
      ]);

      setBot(botData);
      setLogs(logsData.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load bot");
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    if (!botId) return;
    void loadData();
  }, [botId, loadData]);

  useEffect(() => {
    if (!bot || bot.status !== "RUNNING" || !bot.runtimeActive) {
      return;
    }

    void startActiveBotsStream().catch(() => null);
  }, [bot]);

  async function runAction(action: BotAction) {
    try {
      setActing(true);
      setError(null);

      if (action === "delete") {
        await deleteBot(botId);
        router.push("/bots");
        router.refresh();
        return;
      }

      await runBotAction(botId, action);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActing(false);
    }
  }

  async function runDryRun() {
    try {
      setActing(true);
      setError(null);
      const parsedEntry = entry.trim() ? Number.parseFloat(entry) : undefined;
      const response = await runBotDryRun(botId, {
        side,
        entry: parsedEntry,
      });
      setDryRunResult(response);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dry-run failed");
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return <div>Loading bot...</div>;
  }

  if (!bot) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">Bot not found.</p>
        <Button asChild variant="outline">
          <Link href="/bots">Back to bots</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{bot.name || `Bot ${bot.id}`}</h1>
          <p className="text-sm text-muted-foreground">
            {bot.symbol} - {bot.strategy} - {bot.status}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/bots">Back</Link>
        </Button>
      </div>

      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Account</div>
            <div className="text-sm">{bot.accountId || "-"}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Runtime</div>
            <div className="text-sm">{bot.runtimeActive ? "Active" : "Idle"}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Market price</div>
            <div className="text-sm">{formatLivePrice(livePrice)}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Updated</div>
            <div className="text-sm">{bot.updatedAt ? new Date(bot.updatedAt).toLocaleString() : "-"}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Price stream</div>
            <div className="text-sm">
              {streamStatus}
              {lastMessageAt ? ` | ${new Date(lastMessageAt).toLocaleTimeString()}` : ""}
            </div>
          </div>
        </CardContent>
      </Card>

      {showRuntimeState ? (
        <RuntimeStateCard
          runtimeState={bot.strategyRuntimeState!}
          livePrice={livePrice}
          liveTimestamp={liveQuote?.timestamp}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button disabled={acting} onClick={() => runAction(primaryAction)}>
            {bot.status === "RUNNING" ? "Pause" : "Start"}
          </Button>
          {bot.status === "PAUSED" ? (
            <Button disabled={acting} variant="secondary" onClick={() => runAction("resume")}>
              Resume
            </Button>
          ) : null}
          {(bot.status === "RUNNING" || bot.status === "PAUSED" || bot.status === "ERROR") ? (
            <Button disabled={acting} variant="secondary" onClick={() => runAction("stop")}>
              Stop
            </Button>
          ) : null}
          <Button disabled={acting} variant="destructive" onClick={() => runAction("delete")}>
            Delete
          </Button>
          <Button disabled={acting} variant="outline" onClick={loadData}>
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Strategy params</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">
            {JSON.stringify(bot.params, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dry-run</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Side</Label>
              <Select value={side} onValueChange={(value: "buy" | "sell") => setSide(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">buy</SelectItem>
                  <SelectItem value="sell">sell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry">Entry (optional)</Label>
              <Input
                id="entry"
                value={entry}
                onChange={(event) => setEntry(event.target.value)}
                type="number"
                step="0.0001"
                placeholder="1.0845"
              />
            </div>
          </div>

          <Button disabled={acting} onClick={runDryRun}>
            Run dry-run
          </Button>

          {dryRunResult ? (
            <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">
              {JSON.stringify(dryRunResult, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest logs</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No logs yet.</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{log.event}</span>
                    <span className="text-xs text-muted-foreground">{new Date(log.timeUtc).toLocaleString()}</span>
                  </div>
                  {log.details ? (
                    <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

