"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConditionNodeData } from "@/lib/strategies/types";

export function ConditionNode({ data, selected }: NodeProps) {
  const condition = data as ConditionNodeData;

  return (
    <div
      className={cn(
        "min-w-56 rounded-xl border border-amber-500/40 bg-card/95 p-3 shadow-md",
        selected && "ring-2 ring-amber-500/60"
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">{condition.label}</div>
        <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20">
          Condition
        </Badge>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <div>Indicador: {condition.indicator}</div>
        <div>Operador: {condition.operator}</div>
        <div>Valor: {condition.value}</div>
      </div>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-amber-500" />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-amber-500" />
    </div>
  );
}
