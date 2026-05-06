"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  deleteBot,
  getBot,
  getBotLogs,
  getBotRegistro,
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
  LegContinuationCurrentSetup,
  TradeRegistryItem,
} from "@/lib/types";
import { usePriceStream } from "@/hooks/usePriceStream";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import RuntimePixiChart, { type RuntimeTradeMarker } from "@/components/bots/runtime-pixi-chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type BotAction = "start" | "resume" | "pause" | "stop" | "delete";
type MainTabValue = "overview" | "runtime" | "trades" | "params" | "dryrun" | "logs";

const MAIN_TABS: Array<{ value: MainTabValue; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "runtime", label: "Strategy runtime" },
  { value: "trades", label: "Trades" },
  { value: "params", label: "Strategy params" },
  { value: "dryrun", label: "Dry-run" },
  { value: "logs", label: "Latest logs" },
];

type LegContinuationUiStatus =
  | "INACTIVO"
  | "CARGANDO_ESTRUCTURA_M5"
  | "SETUP_ACTIVO"
  | "BREAKOUT_DETECTADO"
  | "ENTRADA_EJECUTADA"
  | "BLOQUEADO_POSICION_ABIERTA"
  | "SETUP_EXPIRADO";

type LegContinuationTimelineEvent = {
  id: string;
  at: number;
  title: string;
  detail: string;
};

type LegContinuationSnapshot = {
  runtimeActive: boolean;
  stage?: string;
  setupKey: string | null;
  breakoutTime: string | null;
  setupStatusReason: string;
  m5Count: number;
  m1Count: number;
  openTradesCount: number;
};

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

function getDetailAsRecord(details: unknown): Record<string, unknown> {
  return details && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : {};
}

function toIsoFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) {
      return new Date(ms).toISOString();
    }
  }
  return null;
}

function getLegContinuationSetup(value: BotStrategyRuntimeState["current_setup"]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as LegContinuationCurrentSetup;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getSetupKey(setup: LegContinuationCurrentSetup | null) {
  if (!setup) return null;
  const side = String(setup.side ?? "");
  const level = asNumber(setup.breakout_level);
  const start = toIsoFromUnknown(setup.search_start);
  const end = toIsoFromUnknown(setup.search_end);
  return [side, level ?? "", start ?? "", end ?? ""].join("|");
}

function getLegContinuationBlockReason({
  runtimeActive,
  stage,
  setup,
  openTradesCount,
}: {
  runtimeActive: boolean;
  stage?: string;
  setup: LegContinuationCurrentSetup | null;
  openTradesCount: number;
}) {
  if (!runtimeActive) return "Bot no esta corriendo.";
  if (stage === "WAITING_M5_LEGS") return "Sin estructura suficiente en M5.";
  if (!setup) return "Sin setup de continuacion vigente.";
  const breakoutTime = toIsoFromUnknown(setup.breakout_time);
  if (!breakoutTime) return "Setup detectado, esperando breakout M5.";
  if (openTradesCount > 0) return "Regla de una posicion activa.";
  return "Esperando confirmacion M1.";
}

function extractMarkerKind(eventName: string, details: Record<string, unknown>) {
  const blob = `${eventName} ${JSON.stringify(details)}`.toLowerCase();
  if (/(structure_break|breakout|break|bos|quiebre)/.test(blob)) return "break";
  if (/(trigger|entry_signal|signal_fire|entry_confirm|entry_ready)/.test(blob)) return "trigger";
  if (/(manual_close|strategy_close|closed|close|exit|salida|take_profit|stop_loss|\btp\b|\bsl\b)/.test(blob)) {
    return "exit";
  }
  return null;
}

function extractMarkerTime(logTimeUtc: string, details: Record<string, unknown>) {
  const candidates = [
    details.timeUtc,
    details.time_utc,
    details.event_time_utc,
    details.event_time,
    details.candle_time_utc,
    details.bar_time_utc,
    details.trigger_time_utc,
    details.break_time_utc,
    details.exit_time_utc,
    details.timestamp,
    logTimeUtc,
  ];

  for (const item of candidates) {
    const iso = toIsoFromUnknown(item);
    if (iso) return iso;
  }
  return null;
}

function extractMarkerPrice(details: Record<string, unknown>) {
  const candidates = [
    details.price,
    details.break_price,
    details.breakout_price,
    details.structure_break_price,
    details.trigger_price,
    details.entry_price,
    details.exit_price,
    details.close_price,
    details.level,
    details.breakout_level,
  ];
  for (const item of candidates) {
    const parsed = asNumber(item);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function extractMarkerSide(details: Record<string, unknown>): RuntimeTradeMarker["side"] {
  const raw = String(details.side ?? details.direction ?? details.order_side ?? "").toLowerCase();
  if (raw === "buy" || raw === "bull" || raw === "long") return "buy";
  if (raw === "sell" || raw === "bear" || raw === "short") return "sell";
  return "unknown";
}

function buildStrategyEventMarkers(logs: BotLogsResponse["logs"]): RuntimeTradeMarker[] {
  const out: RuntimeTradeMarker[] = [];
  const dedup = new Set<string>();

  for (const log of logs) {
    const details = getDetailAsRecord(log.details);
    const kind = extractMarkerKind(log.event, details);
    if (!kind) continue;

    const timeUtc = extractMarkerTime(log.timeUtc, details);
    if (!timeUtc) continue;

    const marker: RuntimeTradeMarker = {
      id: `${log.id}:${kind}`,
      time_utc: timeUtc,
      kind,
      side: extractMarkerSide(details),
      price: extractMarkerPrice(details),
      result: String(details.result ?? details.reason ?? details.close_reason ?? ""),
      pnl_points: asNumber(details.pnl_points ?? details.pnl ?? details.profit),
      label: kind === "break" ? "BRK" : kind === "trigger" ? "TRG" : "OUT",
    };

    const key = `${marker.kind}|${marker.time_utc}|${marker.price ?? "na"}|${marker.side ?? "na"}`;
    if (dedup.has(key)) continue;
    dedup.add(key);
    out.push(marker);
  }

  out.sort((a, b) => Date.parse(a.time_utc) - Date.parse(b.time_utc));
  return out.slice(-300);
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function fmtNumber(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pnlTone(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value) || value === 0) {
    return "text-muted-foreground";
  }
  return value > 0 ? "text-emerald-600" : "text-red-600";
}

function sortOpenTrades(trades: TradeRegistryItem[]) {
  return [...trades].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
}

function sortClosedTrades(trades: TradeRegistryItem[]) {
  return [...trades].sort((a, b) => {
    const aKey = Date.parse(a.closedAt ?? a.openedAt);
    const bKey = Date.parse(b.closedAt ?? b.openedAt);
    return bKey - aKey;
  });
}

function explainRuntimeBlocker(stage: string | undefined, isLegContinuationM5M1: boolean) {
  const entryTf = isLegContinuationM5M1 ? "M1" : "M15";
  const setupTf = isLegContinuationM5M1 ? "M5" : "H4";

  if (!stage) return "Sin stage reportado por backend.";
  if (stage === "WAITING_H4_SETUP" || stage === "WAITING_M5_SETUP") {
    return `Todavia no hay setup valido en ${setupTf}.`;
  }
  if (stage === "WAITING_H4_LEGS" || stage === "WAITING_M5_LEGS") {
    return `Todavia no se confirmo estructura de legs en ${setupTf}.`;
  }
  if (stage === "WAITING_BREAKOUT_OR_ENTRY") {
    return "Hay setup en seguimiento, pero aun no se confirmo breakout ni entrada.";
  }
  if (stage === "WAITING_M15_ENTRY" || stage === "WAITING_M1_ENTRY") {
    return `Breakout detectado, esperando gatillo de entrada en ${entryTf}.`;
  }
  return "Esperando siguiente condicion de estrategia.";
}

function RuntimeStateCard({
  runtimeState,
  runtimeActive,
  openTradesCount,
  timelineEvents = [],
  lastEntryDetectedAt,
  lastSetupExpiredAt,
  clockMs,
  livePrice,
  liveTimestamp,
  eventMarkers = [],
}: {
  runtimeState: BotStrategyRuntimeState;
  runtimeActive: boolean;
  openTradesCount: number;
  timelineEvents?: LegContinuationTimelineEvent[];
  lastEntryDetectedAt?: number | null;
  lastSetupExpiredAt?: number | null;
  clockMs: number;
  livePrice?: number;
  liveTimestamp?: number;
  eventMarkers?: RuntimeTradeMarker[];
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
  const typedCurrentSetup = getLegContinuationSetup(runtimeState.current_setup);
  const breakoutLevel = asNumber(typedCurrentSetup?.breakout_level);
  const currentSetup = (typedCurrentSetup ?? {}) as Record<string, unknown>;
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
  const rawStage = runtimeState.stage ? String(runtimeState.stage) : undefined;
  const setupSearchEndIso = toIsoFromUnknown(typedCurrentSetup?.search_end);
  const setupSearchEndMs = setupSearchEndIso ? Date.parse(setupSearchEndIso) : null;
  const setupSearchStartIso = toIsoFromUnknown(typedCurrentSetup?.search_start);
  const setupBreakoutIso = toIsoFromUnknown(typedCurrentSetup?.breakout_time);
  const setupStatusReason = String(runtimeState.setup_status_reason ?? "active");
  const setupInvalidatedAtIso = toIsoFromUnknown(runtimeState.setup_invalidated_at);
  const serverNowUtcIso = toIsoFromUnknown(runtimeState.server_now_utc);
  const nowMs = clockMs;
  const countdownMs = setupSearchEndMs !== null ? setupSearchEndMs - nowMs : null;
  const isRecentEntry = typeof lastEntryDetectedAt === "number" && nowMs - lastEntryDetectedAt < 5 * 60_000;
  const isRecentExpiration =
    typeof lastSetupExpiredAt === "number" && nowMs - lastSetupExpiredAt < 2 * 60_000 && openTradesCount === 0;

  let uiStatus: LegContinuationUiStatus = runtimeActive ? "CARGANDO_ESTRUCTURA_M5" : "INACTIVO";
  if (!runtimeActive) {
    uiStatus = "INACTIVO";
  } else if (isRecentExpiration) {
    uiStatus = "SETUP_EXPIRADO";
  } else if (rawStage === "WAITING_M5_LEGS") {
    uiStatus = "CARGANDO_ESTRUCTURA_M5";
  } else if (typedCurrentSetup) {
    if (setupBreakoutIso && openTradesCount > 0) {
      uiStatus = "BLOQUEADO_POSICION_ABIERTA";
    } else if (setupBreakoutIso) {
      uiStatus = "BREAKOUT_DETECTADO";
    } else {
      uiStatus = "SETUP_ACTIVO";
    }
  } else if (isRecentEntry || (openTradesCount > 0 && (runtimeState.pending_setups_count ?? 0) === 0)) {
    uiStatus = "ENTRADA_EJECUTADA";
  }

  const statusLabelMap: Record<LegContinuationUiStatus, string> = {
    INACTIVO: "INACTIVO",
    CARGANDO_ESTRUCTURA_M5: "CARGANDO ESTRUCTURA M5",
    SETUP_ACTIVO: "SETUP ACTIVO",
    BREAKOUT_DETECTADO: "BREAKOUT DETECTADO",
    ENTRADA_EJECUTADA: "ENTRADA EJECUTADA",
    BLOQUEADO_POSICION_ABIERTA: "BLOQUEADO POR POSICION ABIERTA",
    SETUP_EXPIRADO: "SETUP EXPIRADO",
  };

  const statusProgressMap: Record<LegContinuationUiStatus, number> = {
    INACTIVO: 0,
    CARGANDO_ESTRUCTURA_M5: 20,
    SETUP_ACTIVO: 45,
    BREAKOUT_DETECTADO: 70,
    ENTRADA_EJECUTADA: 100,
    BLOQUEADO_POSICION_ABIERTA: 75,
    SETUP_EXPIRADO: 60,
  };

  const statusToneMap: Record<LegContinuationUiStatus, string> = {
    INACTIVO: "bg-zinc-500",
    CARGANDO_ESTRUCTURA_M5: "bg-blue-600",
    SETUP_ACTIVO: "bg-cyan-600",
    BREAKOUT_DETECTADO: "bg-orange-600",
    ENTRADA_EJECUTADA: "bg-emerald-600",
    BLOQUEADO_POSICION_ABIERTA: "bg-amber-700",
    SETUP_EXPIRADO: "bg-rose-700",
  };

  const breakEvents = eventMarkers.filter((marker) => marker.kind === "break");
  const triggerEvents = eventMarkers.filter((marker) => marker.kind === "trigger");
  const exitEvents = eventMarkers.filter((marker) => marker.kind === "exit");
  const blockerHint = isLegContinuationM5M1
    ? getLegContinuationBlockReason({
      runtimeActive,
      stage: rawStage,
      setup: typedCurrentSetup,
      openTradesCount,
    })
    : explainRuntimeBlocker(rawStage, isLegContinuationM5M1);
  const hasPattern = (runtimeState.pending_setups_count ?? 0) > 0 || Boolean(typedCurrentSetup);
  const hasM1Confirmation = Boolean(setupBreakoutIso && (runtimeState.m1_last_4?.length ?? 0) > 0);
  const steps = [
    {
      key: "m5_update",
      label: "M5 buffer update",
      done: (runtimeState.m5_count ?? 0) > 0,
    },
    {
      key: "pattern",
      label: "Leg pattern detected (A-B-C)",
      done: hasPattern,
    },
    {
      key: "setup",
      label: "Setup created",
      done: Boolean(typedCurrentSetup),
    },
    {
      key: "breakout",
      label: "Breakout detected",
      done: Boolean(setupBreakoutIso),
    },
    {
      key: "m1_confirm",
      label: "M1 confirmation",
      done: hasM1Confirmation,
    },
    {
      key: "open_trade",
      label: "Open trade",
      done: openTradesCount > 0 || isRecentEntry,
    },
  ];

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
            <div className="rounded-md border bg-muted/20 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Estado principal</div>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge className={cn("text-white", statusToneMap[uiStatus])}>
                      {statusLabelMap[uiStatus]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{blockerHint}</span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Pending setups: {runtimeState.pending_setups_count ?? 0}
                </div>
              </div>
              <Progress value={statusProgressMap[uiStatus]} />
            </div>

            {typedCurrentSetup ? (
              <div className="rounded-md border bg-muted/30 p-4">
                <div className="mb-3 text-sm font-medium">Current setup</div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Side</div>
                    <div className="text-sm uppercase">{typedCurrentSetup.side ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Breakout level</div>
                    <div className="text-sm">{breakoutLevel?.toFixed(5) ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Ventana</div>
                    <div className="text-sm">{fmtDate(setupSearchStartIso)} - {fmtDate(setupSearchEndIso)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Countdown</div>
                    <div className={cn("text-sm font-medium", countdownMs !== null && countdownMs < 60_000 ? "text-red-600" : "")}>
                      {countdownMs === null ? "-" : formatCountdown(countdownMs)}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <Badge variant={setupBreakoutIso ? "default" : "outline"}>
                    BREAKOUT {setupBreakoutIso ? "ACTIVO" : "INACTIVO"}
                  </Badge>
                </div>
              </div>
            ) : null}

            <div className="rounded-md border border-amber-300/40 bg-amber-50/60 p-4">
              <div className="mb-2 text-sm font-semibold text-amber-900">Diagnostico de apertura</div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className="text-xs uppercase text-amber-800/80">Bloqueo actual</div>
                  <div className="text-sm text-amber-900">{blockerHint}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-amber-800/80">Breakout level</div>
                  <div className="text-sm text-amber-900">{breakoutLevel?.toFixed(5) ?? "No definido"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-amber-800/80">Estado setup</div>
                  <div className="text-sm text-amber-900">{setupStatusReason}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-amber-800/80">Invalido desde</div>
                  <div className="text-sm text-amber-900">{setupInvalidatedAtIso ? new Date(setupInvalidatedAtIso).toLocaleString() : "-"}</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-amber-900">
                Eventos break/trigger: {breakEvents.length} / {triggerEvents.length} | Server UTC: {serverNowUtcIso ?? "-"}
              </div>
              {breakEvents.length > 0 && triggerEvents.length === 0 ? (
                <p className="mt-3 text-xs text-amber-900">
                  Hay breakout(s) detectado(s), pero no aparece trigger de entrada en timeframe menor.
                </p>
              ) : null}
              {breakEvents.length === 0 && rawStage === "WAITING_BREAKOUT_OR_ENTRY" ? (
                <p className="mt-3 text-xs text-amber-900">
                  Todavia no hay ruptura confirmada por cierre del nivel de breakout.
                </p>
              ) : null}
              {exitEvents.length > 0 ? (
                <p className="mt-2 text-xs text-amber-900">
                  Ultimos eventos de salida detectados: {exitEvents.length}. Si no hay nuevas entradas, revisa filtros de setup/pivot.
                </p>
              ) : null}
            </div>

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

            <div className="rounded-md border bg-muted/30 p-4">
              <div className="mb-3 text-sm font-medium">Timeline en vivo</div>
              <div className="space-y-2">
                {steps.map((step) => (
                  <div key={step.key} className="flex items-center justify-between rounded-md border bg-background/60 px-3 py-2">
                    <span className="text-sm">{step.label}</span>
                    <Badge variant={step.done ? "default" : "outline"}>
                      {step.done ? "Completado" : "Pendiente"}
                    </Badge>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                <div className="text-xs uppercase text-muted-foreground">Eventos inferidos</div>
                {timelineEvents.length === 0 ? (
                  <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                    Aun no hay eventos inferidos en esta sesion.
                  </div>
                ) : (
                  timelineEvents.slice(-8).reverse().map((item) => (
                    <div key={item.id} className="rounded-md border bg-background px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{item.title}</span>
                        <span className="text-xs text-muted-foreground">{new Date(item.at).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{item.detail}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-4">
              <div className="mb-3 text-sm font-medium">Candles preview ({setupTimeframeLabel}/{entryTimeframeLabel})</div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs uppercase text-muted-foreground">{setupTimeframeLabel} last 4</div>
                  <div className="space-y-1">
                    {legContinuationSetupCandles.length === 0 ? (
                      <div className="text-xs text-muted-foreground">Sin velas</div>
                    ) : (
                      legContinuationSetupCandles.map((candle) => (
                        <div key={`setup-${candle.time_utc}`} className="grid grid-cols-2 gap-2 rounded border px-2 py-1 text-xs">
                          <span>{new Date(candle.time_utc).toLocaleTimeString()}</span>
                          <span className="text-right">C: {candle.close}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs uppercase text-muted-foreground">{entryTimeframeLabel} last 4</div>
                  <div className="space-y-1">
                    {legContinuationEntryCandles.length === 0 ? (
                      <div className="text-xs text-muted-foreground">Sin velas</div>
                    ) : (
                      legContinuationEntryCandles.map((candle) => (
                        <div key={`entry-${candle.time_utc}`} className="grid grid-cols-2 gap-2 rounded border px-2 py-1 text-xs">
                          <span>{new Date(candle.time_utc).toLocaleTimeString()}</span>
                          <span className="text-right">C: {candle.close}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <RuntimePixiChart
                title={`${setupTimeframeLabel} structure`}
                timeframeLabel={setupTimeframeLabel}
                symbol={String(runtimeState.symbol ?? "")}
                stageLabel={currentStage}
                candlesFallback={legContinuationSetupCandles}
                continuationLevel={breakoutLevel}
                livePrice={livePrice}
                liveTimestamp={liveTimestamp}
                currentLeg={m5CurrentLeg}
                showLegLabels={isLegContinuationM5M1}
                pivotStrength={asNumber(runtimeState.pivot_strength)}
                tradeMarkers={eventMarkers}
              />
              <RuntimePixiChart
                title={`${entryTimeframeLabel} entry`}
                timeframeLabel={entryTimeframeLabel}
                symbol={String(runtimeState.symbol ?? "")}
                stageLabel={currentStage}
                candlesFallback={legContinuationEntryCandles}
                continuationLevel={breakoutLevel}
                livePrice={livePrice}
                liveTimestamp={liveTimestamp}
                showLegLabels={isLegContinuationM5M1}
                overlayStructureFromTimeframe={isLegContinuationM5M1 ? setupTimeframeLabel : undefined}
                overlayStructureCandlesFallback={isLegContinuationM5M1 ? legContinuationSetupCandles : []}
                tradeMarkers={eventMarkers}
              />
              <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground md:grid-cols-2">
                <div>Stage: {currentStage}</div>
                <div>Breakout: {breakoutLevel?.toFixed(5) ?? "-"}</div>
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
  const [openTrades, setOpenTrades] = useState<TradeRegistryItem[]>([]);
  const [closedTrades, setClosedTrades] = useState<TradeRegistryItem[]>([]);
  const [dryRunResult, setDryRunResult] = useState<DryRunResponse | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<MainTabValue>("overview");
  const [mainTabIndicator, setMainTabIndicator] = useState<{
    left: number;
    width: number;
    visible: boolean;
  }>({ left: 0, width: 0, visible: false });

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [entry, setEntry] = useState("");

  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [loadingOpenTrades, setLoadingOpenTrades] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tradesError, setTradesError] = useState<string | null>(null);
  const [tradesLastSyncAt, setTradesLastSyncAt] = useState<Date | null>(null);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [lcTimelineEvents, setLcTimelineEvents] = useState<LegContinuationTimelineEvent[]>([]);
  const [lastEntryDetectedAt, setLastEntryDetectedAt] = useState<number | null>(null);
  const [lastSetupExpiredAt, setLastSetupExpiredAt] = useState<number | null>(null);
  const strategyEventMarkers = useMemo(() => buildStrategyEventMarkers(logs), [logs]);
  const mainTabsListRef = useRef<HTMLDivElement | null>(null);
  const mainTabRefs = useRef<Record<MainTabValue, HTMLButtonElement | null>>({
    overview: null,
    runtime: null,
    trades: null,
    params: null,
    dryrun: null,
    logs: null,
  });
  const previousLcSnapshotRef = useRef<LegContinuationSnapshot | null>(null);

  const primaryAction = useMemo(() => (bot ? getPrimaryAction(bot.status) : "start"), [bot]);
  const showRuntimeState = Boolean(bot?.strategyRuntimeState);

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

  const refreshMainTabIndicator = useCallback(() => {
    const list = mainTabsListRef.current;
    const activeTrigger = mainTabRefs.current[activeMainTab];
    if (!list || !activeTrigger) {
      setMainTabIndicator((current) => ({ ...current, visible: false }));
      return;
    }

    const listRect = list.getBoundingClientRect();
    const triggerRect = activeTrigger.getBoundingClientRect();
    const horizontalPadding = 4; // TabsList p-1
    const rawLeft = triggerRect.left - listRect.left;
    const maxLeft = Math.max(horizontalPadding, list.clientWidth - triggerRect.width - horizontalPadding);
    const safeLeft = Math.min(Math.max(rawLeft, horizontalPadding), maxLeft);
    setMainTabIndicator({
      left: safeLeft,
      width: triggerRect.width,
      visible: true,
    });
  }, [activeMainTab]);

  const pushLcTimelineEvent = useCallback((title: string, detail: string, at = Date.now()) => {
    setLcTimelineEvents((current) => {
      const id = `${at}:${title}:${detail}`;
      const next = [...current, { id, at, title, detail }];
      return next.slice(-80);
    });
  }, []);

  const refreshRuntimeSnapshot = useCallback(async () => {
    const [botData, logsData] = await Promise.all([getBot(botId), getBotLogs(botId, 100)]);
    setBot(botData);
    setLogs(logsData.logs ?? []);
  }, [botId]);

  const loadOpenTrades = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      try {
        if (mode === "initial") {
          setLoadingOpenTrades(true);
        }
        setTradesError(null);
        const openResponse = await getBotRegistro(botId, { status: "OPEN", limit: 200 });
        setOpenTrades(sortOpenTrades(openResponse.trades ?? []));
        setTradesLastSyncAt(new Date());
      } catch (err) {
        setTradesError(err instanceof Error ? err.message : "Could not load open trades");
      } finally {
        if (mode === "initial") {
          setLoadingOpenTrades(false);
        }
      }
    },
    [botId],
  );

  const refreshTradesSnapshot = useCallback(async () => {
    const [openResponse, closedResponse] = await Promise.all([
      getBotRegistro(botId, { status: "OPEN", limit: 200 }),
      getBotRegistro(botId, { status: "CLOSED", limit: 200 }),
    ]);
    setOpenTrades(sortOpenTrades(openResponse.trades ?? []));
    setClosedTrades(sortClosedTrades(closedResponse.trades ?? []));
    setTradesLastSyncAt(new Date());
  }, [botId]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setTradesError(null);

      const [botData, logsData, openResponse, closedResponse] = await Promise.all([
        getBot(botId),
        getBotLogs(botId, 100),
        getBotRegistro(botId, { status: "OPEN", limit: 200 }),
        getBotRegistro(botId, { status: "CLOSED", limit: 200 }),
      ]);

      setBot(botData);
      setLogs(logsData.logs ?? []);
      setOpenTrades(sortOpenTrades(openResponse.trades ?? []));
      setClosedTrades(sortClosedTrades(closedResponse.trades ?? []));
      setTradesLastSyncAt(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load bot";
      setError(message);
      setTradesError(message);
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    if (!botId) return;
    setLcTimelineEvents([]);
    setLastEntryDetectedAt(null);
    setLastSetupExpiredAt(null);
    previousLcSnapshotRef.current = null;
    void loadData();
  }, [botId, loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!bot || bot.status !== "RUNNING" || !bot.runtimeActive) {
      return;
    }

    void startActiveBotsStream().catch(() => null);
  }, [bot]);

  useEffect(() => {
    if (!bot?.runtimeActive) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshRuntimeSnapshot().catch(() => null);
    }, 3000);

    return () => window.clearInterval(timer);
  }, [bot?.runtimeActive, refreshRuntimeSnapshot]);

  useEffect(() => {
    if (!bot?.runtimeActive) {
      return;
    }

    const timer = window.setInterval(() => {
      void getBotLogs(botId, 100)
        .then((response) => setLogs(response.logs ?? []))
        .catch(() => null);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [bot?.runtimeActive, botId]);

  useEffect(() => {
    if (!bot?.runtimeActive) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshTradesSnapshot().catch(() => null);
    }, 12000);

    return () => window.clearInterval(timer);
  }, [bot?.runtimeActive, refreshTradesSnapshot]);

  useEffect(() => {
    const strategyId = String(bot?.strategyRuntimeState?.strategy ?? bot?.strategy ?? "").toLowerCase();
    if (strategyId !== "leg_continuation_m5_m1") {
      previousLcSnapshotRef.current = null;
      return;
    }

    const runtimeState = bot?.strategyRuntimeState;
    if (!runtimeState) return;

    const currentSetup = getLegContinuationSetup(runtimeState.current_setup);
    const breakoutTime = toIsoFromUnknown(currentSetup?.breakout_time);
    const setupStatusReason = String(runtimeState.setup_status_reason ?? "active");
    const now = Date.now();
    const snapshot: LegContinuationSnapshot = {
      runtimeActive: Boolean(bot?.runtimeActive),
      stage: runtimeState.stage ? String(runtimeState.stage) : undefined,
      setupKey: getSetupKey(currentSetup),
      breakoutTime,
      setupStatusReason,
      m5Count: Number(runtimeState.m5_count ?? 0),
      m1Count: Number(runtimeState.m1_count ?? 0),
      openTradesCount: openTrades.length,
    };

    const previous = previousLcSnapshotRef.current;
    if (previous) {
      if (snapshot.m5Count > previous.m5Count) {
        pushLcTimelineEvent("M5 buffer update", `M5 candles: ${previous.m5Count} -> ${snapshot.m5Count}`, now);
      }
      if (!previous.setupKey && snapshot.setupKey) {
        pushLcTimelineEvent("Setup created", "Aparecio un setup de continuacion vigente.", now);
        toast.info("Nuevo setup detectado");
      }
      if (!previous.breakoutTime && snapshot.breakoutTime) {
        pushLcTimelineEvent("Breakout detected", "Ruptura detectada, esperando confirmacion M1.", now);
        toast.success("Breakout detectado");
      }
      if (snapshot.breakoutTime && snapshot.m1Count > previous.m1Count) {
        pushLcTimelineEvent("M1 confirmation", "Ingresaron nuevas velas M1 durante breakout activo.", now);
      }
      if (snapshot.openTradesCount > previous.openTradesCount) {
        pushLcTimelineEvent("Open trade", "Se detecto una nueva operacion abierta.", now);
        setLastEntryDetectedAt(now);
        toast.success("Operacion abierta");
      }
      if (previous.setupKey && !snapshot.setupKey && snapshot.openTradesCount <= previous.openTradesCount) {
        const expired = snapshot.setupStatusReason === "expired_window";
        const invalidated = snapshot.setupStatusReason === "invalidated_structure";
        const streamGap = snapshot.setupStatusReason === "stream_gap";
        if (expired) {
          pushLcTimelineEvent("Setup expired", "La ventana del setup vencio sin entrada.", now);
          setLastSetupExpiredAt(now);
          toast.warning("Setup expirado sin entrada");
        } else if (invalidated) {
          pushLcTimelineEvent("Setup invalidated", "El setup se invalido por estructura.", now);
          setLastSetupExpiredAt(now);
          toast.warning("Setup invalidado por estructura");
        } else if (streamGap) {
          pushLcTimelineEvent("Setup paused", "Gap de stream: backend reseteo el setup.", now);
          setLastSetupExpiredAt(now);
          toast.warning("Setup reseteado por gap de stream");
        }
      }
    }

    previousLcSnapshotRef.current = snapshot;
  }, [bot?.runtimeActive, bot?.strategy, bot?.strategyRuntimeState, openTrades.length, pushLcTimelineEvent]);

  useLayoutEffect(() => {
    refreshMainTabIndicator();
  }, [refreshMainTabIndicator]);

  useEffect(() => {
    const onResize = () => refreshMainTabIndicator();
    const list = mainTabsListRef.current;
    window.addEventListener("resize", onResize);
    list?.addEventListener("scroll", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      list?.removeEventListener("scroll", onResize);
    };
  }, [refreshMainTabIndicator]);

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
      {bot.lastError ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Last backend error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border bg-destructive/10 p-3 text-xs text-destructive">
              {bot.lastError}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <Tabs
        value={activeMainTab}
        onValueChange={(value) => setActiveMainTab(value as MainTabValue)}
        className="w-full gap-4"
      >
        <TabsList
          ref={mainTabsListRef}
          className="relative h-11 w-full justify-start gap-1 overflow-x-auto rounded-xl bg-muted/70 p-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1 bottom-1 rounded-lg bg-zinc-900 transition-all duration-300 ease-out",
              mainTabIndicator.visible ? "opacity-100" : "opacity-0",
            )}
            style={{
              left: mainTabIndicator.left,
              width: mainTabIndicator.width,
            }}
          />
          {MAIN_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              ref={(node) => {
                mainTabRefs.current[tab.value] = node;
              }}
              className="relative z-10 rounded-lg border-0 px-3 data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
              </div>

              <div className="flex flex-wrap gap-2">
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
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runtime">
          {showRuntimeState ? (
            <RuntimeStateCard
              runtimeState={bot.strategyRuntimeState!}
              runtimeActive={bot.runtimeActive}
              openTradesCount={openTrades.length}
              timelineEvents={lcTimelineEvents}
              lastEntryDetectedAt={lastEntryDetectedAt}
              lastSetupExpiredAt={lastSetupExpiredAt}
              clockMs={clockMs}
              livePrice={livePrice}
              liveTimestamp={liveQuote?.timestamp}
              eventMarkers={strategyEventMarkers}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Strategy runtime</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  No runtime state available for this bot right now.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="trades">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>Trades</CardTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {tradesLastSyncAt ? (
                  <span>Updated {tradesLastSyncAt.toLocaleTimeString()}</span>
                ) : null}
                <Button
                  disabled={loadingOpenTrades}
                  variant="outline"
                  size="sm"
                  onClick={() => void loadOpenTrades("refresh")}
                >
                  Refresh open
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {tradesError ? <div className="text-sm text-destructive">{tradesError}</div> : null}
              <Tabs defaultValue="open" className="w-full">
                <TabsList>
                  <TabsTrigger value="open">Open ({openTrades.length})</TabsTrigger>
                  <TabsTrigger value="history">History ({closedTrades.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="open">
                  {openTrades.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      Sin operaciones abiertas.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="min-w-[980px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Position ID</TableHead>
                            <TableHead>Side</TableHead>
                            <TableHead className="text-right">Volume</TableHead>
                            <TableHead className="text-right">Open</TableHead>
                            <TableHead className="text-right">SL</TableHead>
                            <TableHead className="text-right">TP</TableHead>
                            <TableHead>Opened</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {openTrades.map((trade) => (
                            <TableRow key={trade.positionId}>
                              <TableCell className="font-mono text-xs">{trade.positionId}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="uppercase">{trade.side}</Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{fmtNumber(trade.volume, 0)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtNumber(trade.openPrice, 5)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtNumber(trade.stopLoss, 5)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtNumber(trade.takeProfit, 5)}</TableCell>
                              <TableCell className="text-xs tabular-nums">{fmtDate(trade.openedAt)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="history">
                  {closedTrades.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      No hay operaciones cerradas para este bot.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="min-w-[1100px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Position ID</TableHead>
                            <TableHead>Side</TableHead>
                            <TableHead className="text-right">Open</TableHead>
                            <TableHead className="text-right">Close</TableHead>
                            <TableHead className="text-right">PnL</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead>Opened</TableHead>
                            <TableHead>Closed</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {closedTrades.map((trade) => (
                            <TableRow key={trade.positionId}>
                              <TableCell className="font-mono text-xs">{trade.positionId}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="uppercase">{trade.side}</Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{fmtNumber(trade.openPrice, 5)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtNumber(trade.closePrice, 5)}</TableCell>
                              <TableCell className={cn("text-right font-medium tabular-nums", pnlTone(trade.pnl))}>
                                {fmtNumber(trade.pnl, 2)}
                              </TableCell>
                              <TableCell className="text-xs">{trade.closeReason ?? "-"}</TableCell>
                              <TableCell className="text-xs tabular-nums">{fmtDate(trade.openedAt)}</TableCell>
                              <TableCell className="text-xs tabular-nums">{fmtDate(trade.closedAt)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="params">
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
        </TabsContent>

        <TabsContent value="dryrun">
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
        </TabsContent>

        <TabsContent value="logs">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

