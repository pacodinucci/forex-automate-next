"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ActionNodeData } from "@/lib/strategies/types";

export function ActionNode({ data, selected }: NodeProps) {
  const action = data as ActionNodeData;

  return (
    <div
      className={cn(
        "min-w-56 rounded-xl border border-sky-500/40 bg-card/95 p-3 shadow-md",
        selected && "ring-2 ring-sky-500/60"
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">{action.label}</div>
        <Badge className="bg-sky-500/15 text-sky-700 hover:bg-sky-500/20">Action</Badge>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <div>Side: {action.side}</div>
        <div>Orden: {action.orderType}</div>
        <div>Qty: {action.quantity}</div>
        <div>
          SL/TP: {action.stopLossPips} / {action.takeProfitPips} pips
        </div>
      </div>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-sky-500" />
    </div>
  );
}
