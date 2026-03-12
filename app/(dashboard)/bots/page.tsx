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
  deleteBot,
  getMarketRuntimeHealth,
  runBotAction,
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
  return /(request_frequency_exceeded|rate_limit|throttle|backoff|429)/.test(blob);
}

export default function BotsPage() {
  const { bots, loading, error, refresh } = useBots();
  const [openCreate, setOpenCreate] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>("single");
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [runtimeHealth, setRuntimeHealth] = useState<MarketRuntimeHealthResponse | null>(null);
  const [runtimeHealthError, setRuntimeHealthError] = useState<string | null>(null);
  const [runtimeHealthLoading, setRuntimeHealthLoading] = useState(false);
  const [runtimeHealthCheckedAt, setRuntimeHealthCheckedAt] = useState<Date | null>(null);

  const runningSymbols = useMemo(
    () => [...new Set(bots.filter((bot) => bot.status === "RUNNING" && bot.runtimeActive).map((bot) => bot.symbol))],
    [bots]
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
      setRuntimeHealthError(err instanceof Error ? err.message : "Could not load runtime health");
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
      setActionError(err instanceof Error ? err.message : "Could not complete action");
    } finally {
      setActingId(null);
    }
  }

  async function handleRefreshAll() {
    await Promise.all([refresh(), loadRuntimeHealth()]);
  }

  function openCreateModal(mode: CreateMode) {
    setCreateMode(mode);
    setOpenCreate(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Bots</h1>
          <p className="text-sm text-muted-foreground">Price stream: {streamStatus}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleRefreshAll}>Refresh</Button>
          <Button variant="outline" onClick={() => openCreateModal("bulk")}>Multiple bots</Button>
          <Button onClick={() => openCreateModal("single")}>
            <Plus className="mr-2 h-4 w-4" />
            New bot
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">
            <span className="font-medium">Runtime health:</span>{" "}
            {runtimeReady === true ? "Ready" : runtimeReady === false ? "Not ready" : "Unknown"}
            {hasRateLimitSignals ? (
              <span className="ml-2 text-amber-700">(rate-limit signals detected)</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {runtimeHealthCheckedAt ? (
              <span className="text-xs text-muted-foreground">
                Updated {runtimeHealthCheckedAt.toLocaleTimeString()}
              </span>
            ) : null}
            <Button size="sm" variant="outline" onClick={loadRuntimeHealth} disabled={runtimeHealthLoading}>
              {runtimeHealthLoading ? "Checking..." : "Check runtime"}
            </Button>
          </div>
        </div>
        {runtimeHealthError ? (
          <div className="mt-2 text-sm text-destructive">{runtimeHealthError}</div>
        ) : null}
      </div>

      {loading ? <div>Loading bots...</div> : null}
      {error ? <div className="text-sm text-destructive">{error}</div> : null}
      {actionError ? <div className="text-sm text-destructive">{actionError}</div> : null}

      {!loading && bots.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground">
          No bots yet.
          <div className="mt-3 flex items-center justify-center gap-2">
            <Button variant="outline" onClick={() => openCreateModal("bulk")}>Create multiple</Button>
            <Button onClick={() => openCreateModal("single")}>Create first bot</Button>
          </div>
        </div>
      ) : null}

      {!loading && bots.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <div className="relative max-w-md">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search or filter..."
                className="h-10 rounded-full border-0 bg-muted/65 pr-4 pl-9 shadow-none focus-visible:ring-2"
              />
            </div>
          </div>

          {filteredBots.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No bots match this filter.</div>
          ) : (
            <Table className="min-w-[1080px] text-sm">
              <TableHeader>
                <TableRow className="border-b bg-muted/35 hover:bg-muted/35">
                  <TableHead className="h-11 px-4 text-[11px] font-semibold tracking-[0.04em] uppercase">Status</TableHead>
                  <TableHead className="h-11 px-4 text-[11px] font-semibold tracking-[0.04em] uppercase">Name</TableHead>
                  <TableHead className="h-11 px-4 text-[11px] font-semibold tracking-[0.04em] uppercase">Symbol</TableHead>
                  <TableHead className="h-11 px-4 text-[11px] font-semibold tracking-[0.04em] uppercase">Strategy</TableHead>
                  <TableHead className="h-11 px-4 text-right text-[11px] font-semibold tracking-[0.04em] uppercase">Price</TableHead>
                  <TableHead className="h-11 px-4 text-[11px] font-semibold tracking-[0.04em] uppercase">Runtime</TableHead>
                  <TableHead className="h-11 px-4 text-right text-[11px] font-semibold tracking-[0.04em] uppercase">Updated</TableHead>
                  <TableHead className="h-11 px-4 text-[11px] font-semibold tracking-[0.04em] uppercase">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBots.map((bot) => {
                  const isActing = actingId === bot.id;
                  const quote = quotes[bot.symbol];
                  const primaryAction = getPrimaryAction(bot.status);
                  const canStop = bot.status === "RUNNING" || bot.status === "PAUSED" || bot.status === "ERROR";
                  const isLive = bot.status === "RUNNING" && bot.runtimeActive;
                  const price = isLive ? getPrimaryPrice(quote) : undefined;

                  return (
                    <TableRow
                      key={bot.id}
                      className={cn(
                        "h-12 border-b border-border/70 bg-card hover:bg-emerald-50/35",
                        "odd:bg-card even:bg-slate-50/40"
                      )}
                    >
                      <TableCell className="px-4">
                        <span className="inline-flex h-4 w-7 items-center rounded-full bg-slate-200 p-0.5">
                          <span className={cn("h-3 w-3 rounded-full", rowStatusTone(bot))} />
                        </span>
                      </TableCell>

                      <TableCell className="px-4 font-medium text-slate-700">{bot.name || `${bot.symbol}_${bot.strategy}`}</TableCell>
                      <TableCell className="px-4 text-slate-700">{bot.symbol}</TableCell>
                      <TableCell className="px-4 text-slate-700">{bot.strategy}</TableCell>

                      <TableCell className={cn("px-4 text-right font-semibold tabular-nums", priceTone(quote?.direction))}>
                        {formatPrice(price)}
                      </TableCell>

                      <TableCell className="px-4 text-slate-700">{bot.runtimeActive ? "Active" : "Idle"}</TableCell>

                      <TableCell className="px-4 text-right tabular-nums text-slate-600">
                        {quote?.timestamp ? new Date(quote.timestamp * 1000).toLocaleTimeString() : "-"}
                      </TableCell>

                      <TableCell className="px-4">
                        <div className="flex flex-wrap gap-1.5">
                          <Button asChild size="sm" variant="outline" className="h-8 px-2.5">
                            <Link href={`/bots/${bot.id}`}>Detalle</Link>
                          </Button>

                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8"
                            onClick={() => handleAction(bot.id, primaryAction)}
                            disabled={isActing}
                          >
                            {bot.status === "RUNNING" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
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
