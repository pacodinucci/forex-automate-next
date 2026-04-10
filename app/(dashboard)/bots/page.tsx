"use client";

import Link from "next/link";
import { Pause, Play, Plus, Search, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import CreateBotModal from "@/components/bots/create-bot-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBots } from "@/hooks/useBots";
import { usePriceStream } from "@/hooks/usePriceStream";
import {
  deleteBots,
  deleteBot,
  getMarketRuntimeHealth,
  runBotAction,
  runBotsAction,
  startActiveBotsStream,
} from "@/lib/bots-api";
import type { LiveQuote } from "@/lib/market-stream";
import type { Bot, BotStatus, MarketRuntimeHealthResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

type BotAction = "start" | "resume" | "pause" | "stop" | "delete";
type CreateMode = "single" | "bulk";

function getPrimaryAction(status: BotStatus): Exclude<BotAction, "delete"> {
  if (status === "RUNNING") return "pause";
  if (status === "PAUSED") return "resume";
  return "start";
}

function getPrimaryPrice(quote: LiveQuote | undefined) {
  return quote?.mid ?? quote?.price ?? quote?.bid ?? quote?.ask;
}

function formatPrice(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return value.toFixed(5);
}

function rowStatusTone(bot: Bot) {
  if (bot.status === "ERROR") {
    return "bg-red-400";
  }

  if (bot.status === "RUNNING" && bot.runtimeActive) {
    return "bg-emerald-500";
  }

  if (bot.status === "PAUSED") {
    return "bg-amber-400";
  }

  return "bg-slate-300";
}

function priceTone(direction: LiveQuote["direction"]) {
  if (direction === "up") {
    return "text-emerald-600";
  }

  if (direction === "down") {
    return "text-red-600";
  }

  return "text-slate-700";
}

function detectRateLimitSignal(payload: MarketRuntimeHealthResponse | null) {
  if (!payload) return false;
  const blob = JSON.stringify(payload).toLowerCase();
  return /(request_frequency_exceeded|rate_limit|throttle|backoff|429)/.test(
    blob,
  );
}

function normalizeSymbolKey(value: string | undefined | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function pickQuoteForBot(quotes: Record<string, LiveQuote>, bot: Bot) {
  const candidates = [
    bot.symbol,
    bot.instrument,
    normalizeSymbolKey(bot.symbol),
    normalizeSymbolKey(bot.instrument),
  ].filter(Boolean);

  for (const key of candidates) {
    const quote = quotes[String(key)];
    if (quote) {
      return quote;
    }
  }

  const normalizedCandidates = new Set(
    candidates.map((item) => normalizeSymbolKey(String(item))),
  );
  for (const [key, quote] of Object.entries(quotes)) {
    if (normalizedCandidates.has(normalizeSymbolKey(key))) {
      return quote;
    }
  }

  return undefined;
}

export default function BotsPage() {
  const { bots, loading, error, refresh } = useBots();
  const [openCreate, setOpenCreate] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>("single");
  const [actingId, setActingId] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<
    "pause" | "resume" | "stop" | "delete" | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [runtimeHealth, setRuntimeHealth] =
    useState<MarketRuntimeHealthResponse | null>(null);
  const [runtimeHealthError, setRuntimeHealthError] = useState<string | null>(
    null,
  );
  const [runtimeHealthLoading, setRuntimeHealthLoading] = useState(false);
  const [runtimeHealthCheckedAt, setRuntimeHealthCheckedAt] =
    useState<Date | null>(null);

  const runningSymbols = useMemo(
    () => [
      ...new Set(
        bots
          .filter((bot) => bot.status === "RUNNING" && bot.runtimeActive)
          .map((bot) => bot.symbol),
      ),
    ],
    [bots],
  );
  const { quotes, status: streamStatus } = usePriceStream(runningSymbols, 1);

  const filteredBots = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return bots;

    return bots.filter((bot) => {
      const haystack = [
        bot.name,
        bot.symbol,
        bot.strategy,
        bot.accountId,
        bot.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [bots, search]);

  const runtimeReady = runtimeHealth?.ready;
  const hasRateLimitSignals = detectRateLimitSignal(runtimeHealth);

  async function loadRuntimeHealth() {
    try {
      setRuntimeHealthLoading(true);
      setRuntimeHealthError(null);
      const data = await getMarketRuntimeHealth();
      setRuntimeHealth(data);
      setRuntimeHealthCheckedAt(new Date());
    } catch (err) {
      setRuntimeHealthError(
        err instanceof Error ? err.message : "Could not load runtime health",
      );
    } finally {
      setRuntimeHealthLoading(false);
    }
  }

  useEffect(() => {
    if (runningSymbols.length === 0) {
      return;
    }

    void startActiveBotsStream().catch(() => null);
  }, [runningSymbols]);

  useEffect(() => {
    void loadRuntimeHealth();
  }, []);

  async function handleAction(botId: string, action: BotAction) {
    try {
      setActingId(botId);
      setActionError(null);

      if (action === "delete") {
        await deleteBot(botId);
      } else {
        await runBotAction(botId, action);
      }

      await refresh();
      await loadRuntimeHealth();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not complete action",
      );
    } finally {
      setActingId(null);
    }
  }

  async function handleRefreshAll() {
    await Promise.all([refresh(), loadRuntimeHealth()]);
  }

  async function handleBulkAction(action: "pause" | "resume" | "stop") {
    const candidates = bots.filter((bot) => {
      if (action === "pause") return bot.status === "RUNNING";
      if (action === "resume") return bot.status === "PAUSED";
      return (
        bot.status === "RUNNING" ||
        bot.status === "PAUSED" ||
        bot.status === "ERROR"
      );
    });

    if (candidates.length === 0) {
      return;
    }

    try {
      setBulkAction(action);
      setActionError(null);
      const result = await runBotsAction(
        candidates.map((bot) => bot.id),
        action,
      );

      if (result.failed > 0) {
        setActionError(
          `Global ${action}: ${result.succeeded}/${result.total} bots updated. ${result.failed} failed.`,
        );
      }

      await Promise.all([refresh(), loadRuntimeHealth()]);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not complete bulk action",
      );
    } finally {
      setBulkAction(null);
    }
  }

  async function handleDeleteAll() {
    if (bots.length === 0) {
      return;
    }

    try {
      setBulkAction("delete");
      setActionError(null);
      const result = await deleteBots(bots.map((bot) => bot.id));

      if (result.failed > 0) {
        setActionError(
          `Global delete: ${result.succeeded}/${result.total} bots deleted. ${result.failed} failed.`,
        );
      }

      await Promise.all([refresh(), loadRuntimeHealth()]);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not complete bulk delete",
      );
    } finally {
      setBulkAction(null);
    }
  }

  const runningCount = bots.filter((bot) => bot.status === "RUNNING").length;
  const pausedCount = bots.filter((bot) => bot.status === "PAUSED").length;
  const stoppableCount = bots.filter(
    (bot) =>
      bot.status === "RUNNING" ||
      bot.status === "PAUSED" ||
      bot.status === "ERROR",
  ).length;

  function openCreateModal(mode: CreateMode) {
    setCreateMode(mode);
    setOpenCreate(true);
  }

  return (
    <div className="space-y-5">
      <div className="premium-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-background/65 px-4 py-4 md:px-5">
          <div className="space-y-1">
            <span className="premium-chip bg-accent/45">Bot Operations</span>
            <h1 className="text-2xl font-semibold tracking-tight">Bots</h1>
            <p className="text-sm text-muted-foreground">
              Price stream: {streamStatus}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleRefreshAll}>
              Refresh
            </Button>
            <Button variant="outline" onClick={() => openCreateModal("bulk")}>
              Multiple bots
            </Button>
            <Button
              className="shadow-sm"
              onClick={() => openCreateModal("single")}
            >
              <Plus className="mr-2 h-4 w-4" />
              New bot
            </Button>
          </div>
        </div>

        <div className="px-4 py-3 md:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-medium">Runtime health:</span>{" "}
              {runtimeReady === true
                ? "Ready"
                : runtimeReady === false
                  ? "Not ready"
                  : "Unknown"}
              {hasRateLimitSignals ? (
                <span className="ml-2 text-amber-700">
                  (rate-limit signals detected)
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {runtimeHealthCheckedAt ? (
                <span className="text-xs text-muted-foreground">
                  Updated {runtimeHealthCheckedAt.toLocaleTimeString()}
                </span>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={loadRuntimeHealth}
                disabled={runtimeHealthLoading}
              >
                {runtimeHealthLoading ? "Checking..." : "Check runtime"}
              </Button>
            </div>
          </div>
          {runtimeHealthError ? (
            <div className="mt-2 text-sm text-destructive">
              {runtimeHealthError}
            </div>
          ) : null}
          {!runtimeHealthError && runtimeHealth && runtimeReady !== true ? (
            <pre className="mt-2 overflow-x-auto rounded-md border bg-muted/40 p-2 text-xs">
              {JSON.stringify(runtimeHealth, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>

      {loading ? <div>Loading bots...</div> : null}
      {error ? <div className="text-sm text-destructive">{error}</div> : null}
      {actionError ? (
        <div className="text-sm text-destructive">{actionError}</div>
      ) : null}

      {!loading && bots.length === 0 ? (
        <div className="premium-panel p-6 text-center text-muted-foreground">
          No bots yet.
          <div className="mt-3 flex items-center justify-center gap-2">
            <Button variant="outline" onClick={() => openCreateModal("bulk")}>
              Create multiple
            </Button>
            <Button onClick={() => openCreateModal("single")}>
              Create first bot
            </Button>
          </div>
        </div>
      ) : null}

      {!loading && bots.length > 0 ? (
        <div className="premium-panel overflow-hidden">
          <div className="premium-toolbar m-3 mb-0 border-none">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full max-w-md">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search or filter..."
                  className="h-10 rounded-full border-none bg-transparent pr-4 pl-9 text-slate-400 shadow-none focus-visible:ring-0"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-white/20 bg-white/12 px-2.5 text-xs text-primary-foreground hover:bg-white/20"
                  onClick={() => handleBulkAction("pause")}
                  disabled={bulkAction !== null || runningCount === 0}
                >
                  <Pause className="mr-2 h-4 w-4" />
                  Pause all ({runningCount})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-white/20 bg-white/12 px-2.5 text-xs text-primary-foreground hover:bg-white/20"
                  onClick={() => handleBulkAction("resume")}
                  disabled={bulkAction !== null || pausedCount === 0}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Resume all ({pausedCount})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-white/20 bg-white/12 px-2.5 text-xs text-primary-foreground hover:bg-white/20"
                  onClick={() => handleBulkAction("stop")}
                  disabled={bulkAction !== null || stoppableCount === 0}
                >
                  <Square className="mr-2 h-4 w-4" />
                  Stop all ({stoppableCount})
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 px-2.5 text-xs"
                  onClick={handleDeleteAll}
                  disabled={bulkAction !== null || bots.length === 0}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete all ({bots.length})
                </Button>
              </div>
            </div>
          </div>

          {filteredBots.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No bots match this filter.
            </div>
          ) : (
            <Table className="min-w-[1080px] px-3 pb-3 text-sm">
              <TableHeader>
                <TableRow className="border-b bg-secondary/45 hover:bg-secondary/45">
                  <TableHead className="h-11 px-4 text-[11px] font-semibold tracking-[0.04em] uppercase">
                    Status
                  </TableHead>
                  <TableHead className="h-11 px-4 text-[11px] font-semibold tracking-[0.04em] uppercase">
                    Name
                  </TableHead>
                  <TableHead className="h-11 px-4 text-[11px] font-semibold tracking-[0.04em] uppercase">
                    Symbol
                  </TableHead>
                  <TableHead className="h-11 px-4 text-[11px] font-semibold tracking-[0.04em] uppercase">
                    Strategy
                  </TableHead>
                  <TableHead className="h-11 px-4 text-right text-[11px] font-semibold tracking-[0.04em] uppercase">
                    Price
                  </TableHead>
                  <TableHead className="h-11 px-4 text-[11px] font-semibold tracking-[0.04em] uppercase">
                    Runtime
                  </TableHead>
                  <TableHead className="h-11 px-4 text-[11px] font-semibold tracking-[0.04em] uppercase">
                    Last error
                  </TableHead>
                  <TableHead className="h-11 px-4 text-right text-[11px] font-semibold tracking-[0.04em] uppercase">
                    Updated
                  </TableHead>
                  <TableHead className="h-11 px-4 text-[11px] font-semibold tracking-[0.04em] uppercase">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBots.map((bot) => {
                  const isActing = actingId === bot.id;
                  const quote = pickQuoteForBot(quotes, bot);
                  const primaryAction = getPrimaryAction(bot.status);
                  const canStop =
                    bot.status === "RUNNING" ||
                    bot.status === "PAUSED" ||
                    bot.status === "ERROR";
                  const isLive = bot.status === "RUNNING" && bot.runtimeActive;
                  const price = isLive ? getPrimaryPrice(quote) : undefined;

                  return (
                    <TableRow
                      key={bot.id}
                      className={cn(
                        "h-12 border-b border-border/70 bg-card hover:bg-emerald-100/35",
                        "odd:bg-card even:bg-secondary/28",
                      )}
                    >
                      <TableCell className="px-4">
                        <span className="inline-flex h-4 w-7 items-center rounded-full bg-slate-200 p-0.5">
                          <span
                            className={cn(
                              "h-3 w-3 rounded-full",
                              rowStatusTone(bot),
                            )}
                          />
                        </span>
                      </TableCell>

                      <TableCell className="px-4 font-medium text-slate-700">
                        {bot.name || `${bot.symbol}_${bot.strategy}`}
                      </TableCell>
                      <TableCell className="px-4 text-slate-700">
                        {bot.symbol}
                      </TableCell>
                      <TableCell className="px-4 text-slate-700">
                        {bot.strategy}
                      </TableCell>

                      <TableCell
                        className={cn(
                          "px-4 text-right font-semibold tabular-nums",
                          priceTone(quote?.direction),
                        )}
                      >
                        {formatPrice(price)}
                      </TableCell>

                      <TableCell className="px-4 text-slate-700">
                        {bot.runtimeActive ? "Active" : "Idle"}
                      </TableCell>

                      <TableCell className="max-w-[280px] px-4 text-xs text-slate-700">
                        {bot.lastError ? (
                          <span
                            className="block truncate text-destructive"
                            title={bot.lastError}
                          >
                            {bot.lastError}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>

                      <TableCell className="px-4 text-right tabular-nums text-slate-600">
                        {quote?.timestamp
                          ? new Date(
                              quote.timestamp * 1000,
                            ).toLocaleTimeString()
                          : "-"}
                      </TableCell>

                      <TableCell className="px-4">
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-8 px-2.5"
                          >
                            <Link href={`/bots/${bot.id}`}>Detalle</Link>
                          </Button>

                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8"
                            onClick={() => handleAction(bot.id, primaryAction)}
                            disabled={isActing}
                          >
                            {bot.status === "RUNNING" ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>

                          {canStop ? (
                            <Button
                              size="icon"
                              variant="secondary"
                              className="h-8 w-8"
                              onClick={() => handleAction(bot.id, "stop")}
                              disabled={isActing}
                            >
                              <Square className="h-4 w-4" />
                            </Button>
                          ) : null}

                          <Button
                            size="icon"
                            variant="destructive"
                            className="h-8 w-8"
                            onClick={() => handleAction(bot.id, "delete")}
                            disabled={isActing}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      ) : null}

      <CreateBotModal
        open={openCreate}
        mode={createMode}
        onOpenChange={setOpenCreate}
        onCreated={async () => {
          await refresh();
          await loadRuntimeHealth();
        }}
      />
    </div>
  );
}
