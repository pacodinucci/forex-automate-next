import { create } from "zustand";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  MarkerType,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from "@xyflow/react";
import {
  STRATEGY_SCHEMA_VERSION,
  createStrategyNode,
  isConnectionAllowed,
  type StrategyFlow,
  type StrategyFlowNode,
  type StrategyNodeData,
  type StrategyNodeType,
} from "@/lib/strategies/types";

const STORAGE_KEY = "strategy-builder-flow-v1";

function seededFlow() {
  const triggerNode = createStrategyNode("trigger", { x: 80, y: 180 });
  const actionNode = createStrategyNode("action", { x: 500, y: 180 });

  const edge: Edge = {
    id: `edge-${triggerNode.id}-${actionNode.id}`,
    source: triggerNode.id,
    target: actionNode.id,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: true,
  };

  return {
    nodes: [triggerNode, actionNode],
    edges: [edge],
  };
}

type StrategyBuilderState = {
  nodes: StrategyFlowNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  onNodesChange: (changes: NodeChange<StrategyFlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<Edge>[]) => void;
  connect: (connection: Connection) => void;
  selectNode: (nodeId: string | null) => void;
  addNode: (type: StrategyNodeType) => void;
  duplicateNode: (nodeId: string) => void;
  deleteNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, data: Partial<StrategyNodeData>) => void;
  exportFlow: () => StrategyFlow;
  importFlow: (payload: StrategyFlow) => boolean;
  saveToLocalStorage: () => void;
  loadFromLocalStorage: () => boolean;
  resetFlow: () => void;
};

export const useStrategyBuilderStore = create<StrategyBuilderState>((set, get) => ({
  ...seededFlow(),
  selectedNodeId: null,
  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
    }));
  },
  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    }));
  },
  connect: (connection) => {
    set((state) => {
      const sourceNode = state.nodes.find((node) => node.id === connection.source);
      const targetNode = state.nodes.find((node) => node.id === connection.target);

      if (
        !isConnectionAllowed(
          sourceNode,
          targetNode,
          state.edges,
          connection.source,
          connection.target
        )
      ) {
        return state;
      }

      return {
        edges: addEdge(
          {
            ...connection,
            id: `edge-${connection.source}-${connection.target}`,
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed },
            animated: true,
          },
          state.edges
        ),
      };
    });
  },
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  addNode: (type) =>
    set((state) => {
      const basePosition: XYPosition = {
        x: 180 + state.nodes.length * 30,
        y: 120 + state.nodes.length * 25,
      };
      return {
        nodes: [...state.nodes, createStrategyNode(type, basePosition)],
      };
    }),
  duplicateNode: (nodeId) =>
    set((state) => {
      const sourceNode = state.nodes.find((node) => node.id === nodeId);
      if (!sourceNode) return state;

      const newNode = createStrategyNode(sourceNode.type, {
        x: sourceNode.position.x + 60,
        y: sourceNode.position.y + 40,
      });

      newNode.data = structuredClone(sourceNode.data);

      return {
        nodes: [...state.nodes, newNode],
        selectedNodeId: newNode.id,
      };
    }),
  deleteNode: (nodeId) =>
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== nodeId),
      edges: state.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
    })),
  updateNodeData: (nodeId, data) =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          data: {
            ...node.data,
            ...data,
          },
        };
      }),
    })),
  exportFlow: () => ({
    schemaVersion: STRATEGY_SCHEMA_VERSION,
    nodes: get().nodes,
    edges: get().edges,
    updatedAt: new Date().toISOString(),
  }),
  importFlow: (payload) => {
    if (!payload || !Array.isArray(payload.nodes) || !Array.isArray(payload.edges)) {
      return false;
    }
    if (payload.schemaVersion !== STRATEGY_SCHEMA_VERSION) {
      return false;
    }

    set({
      nodes: payload.nodes,
      edges: payload.edges,
      selectedNodeId: null,
    });
    return true;
  },
  saveToLocalStorage: () => {
    if (typeof window === "undefined") return;
    const data = get().exportFlow();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },
  loadFromLocalStorage: () => {
    if (typeof window === "undefined") return false;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;

    try {
      const payload = JSON.parse(raw) as StrategyFlow;
      return get().importFlow(payload);
    } catch {
      return false;
    }
  },
  resetFlow: () => {
    set({
      ...seededFlow(),
      selectedNodeId: null,
    });
  },
}));
