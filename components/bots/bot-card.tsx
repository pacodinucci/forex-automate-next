"use client";

import Link from "next/link";
import { Play, Pause, Square, Trash2, Activity, Loader2, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { LiveQuote } from "@/lib/market-stream";
import type { Bot, BotStatus } from "@/lib/types";

type BotAction = "start" | "resume" | "pause" | "stop" | "delete";
type StreamStatus = "idle" | "connecting" | "open" | "closed" | "error";

type BotCardProps = {
  bot: Bot;
  actingId: string | null;
  onAction: (botId: string, action: BotAction) => Promise<void>;
  quote?: LiveQuote;
  streamStatus: StreamStatus;
};

function statusVariant(status: BotStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "RUNNING") return "default";
  if (status === "ERROR") return "destructive";
  if (status === "PAUSED") return "secondary";
  return "outline";
}

function getPrimaryAction(status: BotStatus): Exclude<BotAction, "delete"> {
  if (status === "RUNNING") return "pause";
  if (status === "PAUSED") return "resume";
  return "start";
}

function getPrimaryLabel(status: BotStatus) {
  return status === "RUNNING" ? "Pause" : "Start";
}

function formatPrice(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return value.toFixed(5);
}

function getPriceTone(direction: LiveQuote["direction"]) {
  if (direction === "up") {
    return "text-emerald-600";
  }

  if (direction === "down") {
    return "text-red-600";
  }

  return "text-foreground";
}

export function BotCard({ bot, actingId, onAction, quote, streamStatus }: BotCardProps) {
  const isActing = actingId === bot.id;
  const primaryAction = getPrimaryAction(bot.status);
  const canStop = bot.status === "RUNNING" || bot.status === "PAUSED" || bot.status === "ERROR";
  const isLive = bot.status === "RUNNING" && bot.runtimeActive;
  const primaryPrice = quote?.mid ?? quote?.price ?? quote?.bid ?? quote?.ask;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span>{bot.name || `${bot.symbol} (${bot.strategy})`}</span>
          </div>
          <Badge variant={statusVariant(bot.status)}>{bot.status}</Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid gap-1 text-sm text-muted-foreground md:grid-cols-4">
          <div>
            <span className="font-medium text-foreground">Symbol:</span> {bot.symbol}
          </div>
          <div>
            <span className="font-medium text-foreground">Strategy:</span> {bot.strategy}
          </div>
          <div>
            <span className="font-medium text-foreground">Account:</span> {bot.accountId || "-"}
          </div>
          <div>
            <span className="font-medium text-foreground">Runtime:</span> {bot.runtimeActive ? "Active" : "Idle"}
          </div>
        </div>

        {isLive ? (
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Radio className="h-4 w-4 text-emerald-600" />
                Live market feed
              </div>
              <div className="text-xs text-muted-foreground">
                Stream: {streamStatus}
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-sm font-medium text-muted-foreground">Price</span>
              <span className={`text-3xl font-semibold tabular-nums transition-colors duration-300 ${getPriceTone(quote?.direction)}`}>
                {formatPrice(primaryPrice)}
              </span>
            </div>
          </div>
        ) : null}

        {bot.lastError ? (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
            {bot.lastError}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/bots/${bot.id}`}>Detalle</Link>
          </Button>

          <Button size="sm" onClick={() => onAction(bot.id, primaryAction)} disabled={isActing}>
            {isActing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : bot.status === "RUNNING" ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
            {getPrimaryLabel(bot.status)}
          </Button>

          {bot.status === "PAUSED" ? (
            <Button size="sm" variant="secondary" onClick={() => onAction(bot.id, "resume")} disabled={isActing}>
              <Play className="mr-2 h-4 w-4" />
              Resume
            </Button>
          ) : null}

          {canStop ? (
            <Button size="sm" variant="secondary" onClick={() => onAction(bot.id, "stop")} disabled={isActing}>
              {isActing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
              Stop
            </Button>
          ) : null}

          <Button
            size="sm"
            variant="destructive"
            onClick={() => onAction(bot.id, "delete")}
            disabled={isActing}
          >
            {isActing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
