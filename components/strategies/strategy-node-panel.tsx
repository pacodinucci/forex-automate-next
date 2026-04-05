"use client";

import type {
  ActionNodeData,
  ConditionNodeData,
  StrategyFlowNode,
  StrategyNodeData,
  TriggerNodeData,
} from "@/lib/strategies/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StrategyNodePanelProps = {
  node: StrategyFlowNode | null;
  onUpdate: (nodeId: string, patch: Partial<StrategyNodeData>) => void;
  onDelete: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
};

const inputClassName = "mt-1";
const labelClassName = "text-xs font-medium text-muted-foreground";

export function StrategyNodePanel({
  node,
  onUpdate,
  onDelete,
  onDuplicate,
}: StrategyNodePanelProps) {
  if (!node) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-card/70 p-4 text-sm text-muted-foreground">
        Selecciona un nodo para editar su configuracion.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-card/90 p-4">
      <div>
        <p className="text-sm font-semibold">Configuracion de nodo</p>
        <p className="text-xs text-muted-foreground">
          Tipo: <span className="font-medium uppercase">{node.type}</span>
        </p>
      </div>

      <div>
        <label className={labelClassName}>Label</label>
        <Input
          className={inputClassName}
          value={String(node.data.label ?? "")}
          onChange={(event) => onUpdate(node.id, { label: event.target.value })}
        />
      </div>

      {node.type === "trigger" && (
        <>
          <div>
            <label className={labelClassName}>Evento</label>
            <Select
              value={String((node.data as { event: string }).event)}
              onValueChange={(value) =>
                onUpdate(node.id, { event: value as TriggerNodeData["event"] })
              }
            >
              <SelectTrigger className={inputClassName + " w-full"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="candle_close">Candle close</SelectItem>
                <SelectItem value="price_tick">Price tick</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={labelClassName}>Simbolo</label>
            <Input
              className={inputClassName}
              value={String((node.data as { symbol: string }).symbol)}
              onChange={(event) => onUpdate(node.id, { symbol: event.target.value.toUpperCase() })}
            />
          </div>

          <div>
            <label className={labelClassName}>Timeframe</label>
            <Select
              value={String((node.data as { timeframe: string }).timeframe)}
              onValueChange={(value) =>
                onUpdate(node.id, { timeframe: value as TriggerNodeData["timeframe"] })
              }
            >
              <SelectTrigger className={inputClassName + " w-full"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="M1">M1</SelectItem>
                <SelectItem value="M5">M5</SelectItem>
                <SelectItem value="M15">M15</SelectItem>
                <SelectItem value="H1">H1</SelectItem>
                <SelectItem value="H4">H4</SelectItem>
                <SelectItem value="D1">D1</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {node.type === "condition" && (
        <>
          <div>
            <label className={labelClassName}>Indicador</label>
            <Select
              value={String((node.data as { indicator: string }).indicator)}
              onValueChange={(value) =>
                onUpdate(node.id, { indicator: value as ConditionNodeData["indicator"] })
              }
            >
              <SelectTrigger className={inputClassName + " w-full"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RSI">RSI</SelectItem>
                <SelectItem value="EMA">EMA</SelectItem>
                <SelectItem value="SMA">SMA</SelectItem>
                <SelectItem value="PRICE">PRICE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={labelClassName}>Operador</label>
            <Select
              value={String((node.data as { operator: string }).operator)}
              onValueChange={(value) =>
                onUpdate(node.id, { operator: value as ConditionNodeData["operator"] })
              }
            >
              <SelectTrigger className={inputClassName + " w-full"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=">">{">"}</SelectItem>
                <SelectItem value="<">{"<"}</SelectItem>
                <SelectItem value=">=">{">="}</SelectItem>
                <SelectItem value="<=">{"<="}</SelectItem>
                <SelectItem value="==">{"=="}</SelectItem>
                <SelectItem value="cross_up">Cross up</SelectItem>
                <SelectItem value="cross_down">Cross down</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={labelClassName}>Valor</label>
            <Input
              className={inputClassName}
              type="number"
              value={Number((node.data as { value: number }).value)}
              onChange={(event) => onUpdate(node.id, { value: Number(event.target.value) })}
            />
          </div>
        </>
      )}

      {node.type === "action" && (
        <>
          <div>
            <label className={labelClassName}>Side</label>
            <Select
              value={String((node.data as { side: string }).side)}
              onValueChange={(value) =>
                onUpdate(node.id, { side: value as ActionNodeData["side"] })
              }
            >
              <SelectTrigger className={inputClassName + " w-full"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BUY">BUY</SelectItem>
                <SelectItem value="SELL">SELL</SelectItem>
                <SelectItem value="CLOSE">CLOSE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={labelClassName}>Tipo de orden</label>
            <Select
              value={String((node.data as { orderType: string }).orderType)}
              onValueChange={(value) =>
                onUpdate(node.id, { orderType: value as ActionNodeData["orderType"] })
              }
            >
              <SelectTrigger className={inputClassName + " w-full"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MARKET">MARKET</SelectItem>
                <SelectItem value="LIMIT">LIMIT</SelectItem>
                <SelectItem value="STOP">STOP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={labelClassName}>Cantidad</label>
            <Input
              className={inputClassName}
              type="number"
              value={Number((node.data as { quantity: number }).quantity)}
              onChange={(event) => onUpdate(node.id, { quantity: Number(event.target.value) })}
            />
          </div>

          <div>
            <label className={labelClassName}>Stop Loss (pips)</label>
            <Input
              className={inputClassName}
              type="number"
              value={Number((node.data as { stopLossPips: number }).stopLossPips)}
              onChange={(event) => onUpdate(node.id, { stopLossPips: Number(event.target.value) })}
            />
          </div>

          <div>
            <label className={labelClassName}>Take Profit (pips)</label>
            <Input
              className={inputClassName}
              type="number"
              value={Number((node.data as { takeProfitPips: number }).takeProfitPips)}
              onChange={(event) =>
                onUpdate(node.id, { takeProfitPips: Number(event.target.value) })
              }
            />
          </div>
        </>
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1" onClick={() => onDuplicate(node.id)}>
          Duplicar
        </Button>
        <Button variant="destructive" className="flex-1" onClick={() => onDelete(node.id)}>
          Eliminar
        </Button>
      </div>
    </div>
  );
}
