import type { Edge, Node, XYPosition } from "@xyflow/react";

export const STRATEGY_SCHEMA_VERSION = 1;

export type StrategyNodeType = "trigger" | "condition" | "action";

export type TriggerNodeData = {
  label: string;
  event: "candle_close" | "price_tick";
  symbol: string;
  timeframe: "M1" | "M5" | "M15" | "H1" | "H4" | "D1";
};

export type ConditionNodeData = {
  label: string;
  indicator: "RSI" | "EMA" | "SMA" | "PRICE";
  operator: ">" | "<" | ">=" | "<=" | "==" | "cross_up" | "cross_down";
  value: number;
};

export type ActionNodeData = {
  label: string;
  side: "BUY" | "SELL" | "CLOSE";
  orderType: "MARKET" | "LIMIT" | "STOP";
  quantity: number;
  stopLossPips: number;
  takeProfitPips: number;
};

export type StrategyNodeData = TriggerNodeData | ConditionNodeData | ActionNodeData;

export type StrategyFlowNode = Node<StrategyNodeData, StrategyNodeType>;

export type StrategyFlow = {
  schemaVersion: number;
  nodes: StrategyFlowNode[];
  edges: Edge[];
  updatedAt: string;
};

const defaultNodeDataMap: Record<StrategyNodeType, StrategyNodeData> = {
  trigger: {
    label: "Trigger",
    event: "candle_close",
    symbol: "EURUSD",
    timeframe: "M15",
  },
  condition: {
    label: "Condition",
    indicator: "RSI",
    operator: ">",
    value: 50,
  },
  action: {
    label: "Action",
    side: "BUY",
    orderType: "MARKET",
    quantity: 1,
    stopLossPips: 20,
    takeProfitPips: 40,
  },
};

export function createStrategyNode(
  type: StrategyNodeType,
  position: XYPosition
): StrategyFlowNode {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    position,
    data: structuredClone(defaultNodeDataMap[type]),
  };
}

export function isConnectionAllowed(
  sourceNode: StrategyFlowNode | undefined,
  targetNode: StrategyFlowNode | undefined,
  edges: Edge[],
  source?: string | null,
  target?: string | null
) {
  if (!source || !target || !sourceNode || !targetNode) return false;
  if (source === target) return false;

  const duplicate = edges.some((edge) => edge.source === source && edge.target === target);
  if (duplicate) return false;

  if (sourceNode.type === "action") return false;
  if (targetNode.type === "trigger") return false;

  const hasIncomingEdge = edges.some((edge) => edge.target === target);
  if (hasIncomingEdge) return false;

  if (sourceNode.type === "trigger" && targetNode.type === "action") return true;
  if (sourceNode.type === "trigger" && targetNode.type === "condition") return true;
  if (sourceNode.type === "condition" && targetNode.type === "condition") return true;
  if (sourceNode.type === "condition" && targetNode.type === "action") return true;

  return false;
}

export function validateStrategy(nodes: StrategyFlowNode[], edges: Edge[]): string[] {
  const errors: string[] = [];
  const triggers = nodes.filter((node) => node.type === "trigger");
  const actions = nodes.filter((node) => node.type === "action");

  if (triggers.length === 0) {
    errors.push("La estrategia necesita al menos un nodo Trigger.");
  }

  if (actions.length === 0) {
    errors.push("La estrategia necesita al menos un nodo Action.");
  }

  for (const node of nodes) {
    const inUse = edges.some((edge) => edge.source === node.id || edge.target === node.id);
    if (!inUse) {
      errors.push(`El nodo "${node.data.label}" no esta conectado.`);
    }
  }

  for (const node of nodes) {
    if (node.type === "trigger") {
      const data = node.data as TriggerNodeData;
      if (!data.symbol.trim()) {
        errors.push(`El nodo "${data.label}" necesita un simbolo.`);
      }
    }

    if (node.type === "condition") {
      const data = node.data as ConditionNodeData;
      if (Number.isNaN(data.value)) {
        errors.push(`El nodo "${data.label}" necesita un valor numerico.`);
      }
    }

    if (node.type === "action") {
      const data = node.data as ActionNodeData;
      if (data.quantity <= 0) {
        errors.push(`El nodo "${data.label}" necesita quantity > 0.`);
      }
    }
  }

  if (triggers.length > 0 && actions.length > 0) {
    const graph = new Map<string, string[]>();
    for (const edge of edges) {
      const list = graph.get(edge.source) ?? [];
      list.push(edge.target);
      graph.set(edge.source, list);
    }

    const actionIds = new Set(actions.map((node) => node.id));
    let hasPath = false;
    const visited = new Set<string>();

    const dfs = (nodeId: string) => {
      if (hasPath) return;
      if (actionIds.has(nodeId)) {
        hasPath = true;
        return;
      }
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      for (const next of graph.get(nodeId) ?? []) {
        dfs(next);
      }
    };

    for (const trigger of triggers) {
      dfs(trigger.id);
      if (hasPath) break;
    }

    if (!hasPath) {
      errors.push("No existe camino desde Trigger hasta Action.");
    }
  }

  return errors;
}
