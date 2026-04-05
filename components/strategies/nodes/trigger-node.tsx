"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TriggerNodeData } from "@/lib/strategies/types";

export function TriggerNode({ data, selected }: NodeProps) {
  const trigger = data as TriggerNodeData;

  return (
    <div
      className={cn(
        "min-w-56 rounded-xl border border-emerald-500/40 bg-card/95 p-3 shadow-md",
        selected && "ring-2 ring-emerald-500/60"
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">{trigger.label}</div>
        <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20">
          Trigger
        </Badge>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <div>Evento: {trigger.event === "candle_close" ? "Candle close" : "Price tick"}</div>
        <div>Simbolo: {trigger.symbol}</div>
        <div>Timeframe: {trigger.timeframe}</div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-emerald-500" />
    </div>
  );
}
