"use client";

import { useMemo, useRef, type ChangeEvent } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, Download, Save, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useStrategyBuilderStore } from "@/lib/store/use-strategy-builder-store";
import { isConnectionAllowed, validateStrategy, type StrategyFlow } from "@/lib/strategies/types";
import { TriggerNode } from "@/components/strategies/nodes/trigger-node";
import { ConditionNode } from "@/components/strategies/nodes/condition-node";
import { ActionNode } from "@/components/strategies/nodes/action-node";
import { StrategyNodePanel } from "@/components/strategies/strategy-node-panel";

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
};

function StrategyBuilderContent() {
  const importInputRef = useRef<HTMLInputElement>(null);
  const nodes = useStrategyBuilderStore((state) => state.nodes);
  const edges = useStrategyBuilderStore((state) => state.edges);
  const selectedNodeId = useStrategyBuilderStore((state) => state.selectedNodeId);
  const onNodesChange = useStrategyBuilderStore((state) => state.onNodesChange);
  const onEdgesChange = useStrategyBuilderStore((state) => state.onEdgesChange);
  const connect = useStrategyBuilderStore((state) => state.connect);
  const selectNode = useStrategyBuilderStore((state) => state.selectNode);
  const addNode = useStrategyBuilderStore((state) => state.addNode);
  const duplicateNode = useStrategyBuilderStore((state) => state.duplicateNode);
  const deleteNode = useStrategyBuilderStore((state) => state.deleteNode);
  const updateNodeData = useStrategyBuilderStore((state) => state.updateNodeData);
  const exportFlow = useStrategyBuilderStore((state) => state.exportFlow);
  const importFlow = useStrategyBuilderStore((state) => state.importFlow);
  const saveToLocalStorage = useStrategyBuilderStore((state) => state.saveToLocalStorage);
  const loadFromLocalStorage = useStrategyBuilderStore((state) => state.loadFromLocalStorage);
  const resetFlow = useStrategyBuilderStore((state) => state.resetFlow);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  const errors = useMemo(() => validateStrategy(nodes, edges), [nodes, edges]);

  const handleDownloadJson = () => {
    const payload = exportFlow();
    const file = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `strategy-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as StrategyFlow;
        importFlow(parsed);
      } catch {
        // ignore invalid files for now
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <div className="premium-panel p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => addNode("trigger")}>
            + Trigger
          </Button>
          <Button size="sm" variant="secondary" onClick={() => addNode("condition")}>
            + Condition
          </Button>
          <Button size="sm" variant="outline" onClick={() => addNode("action")}>
            + Action
          </Button>
          <Button size="sm" variant="outline" onClick={saveToLocalStorage}>
            <Save className="h-4 w-4" />
            Guardar local
          </Button>
          <Button size="sm" variant="outline" onClick={loadFromLocalStorage}>
            Cargar local
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownloadJson}>
            <Download className="h-4 w-4" />
            Exportar JSON
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              importInputRef.current?.click();
            }}
          >
            <Upload className="h-4 w-4" />
            Importar JSON
          </Button>
          <Button size="sm" variant="ghost" onClick={resetFlow}>
            Reset
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_330px]">
        <Card className="h-[72vh] overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle className="text-lg">Strategy Builder</CardTitle>
            <CardDescription>
              Conecta Trigger {">"} Conditions {">"} Action. Solo se permiten conexiones validas.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[calc(72vh-88px)] p-0">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={connect}
              onNodeClick={(_, node) => selectNode(node.id)}
              onPaneClick={() => selectNode(null)}
              isValidConnection={(connection) => {
                const sourceNode = nodes.find((node) => node.id === connection.source);
                const targetNode = nodes.find((node) => node.id === connection.target);
                return isConnectionAllowed(
                  sourceNode,
                  targetNode,
                  edges,
                  connection.source,
                  connection.target
                );
              }}
              proOptions={{ hideAttribution: true }}
            >
              <MiniMap pannable zoomable />
              <Controls />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            </ReactFlow>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <StrategyNodePanel
            node={selectedNode}
            onDelete={deleteNode}
            onDuplicate={duplicateNode}
            onUpdate={(nodeId, patch) => updateNodeData(nodeId, patch)}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Validacion del flujo</CardTitle>
              <CardDescription>Chequeo rapido antes de guardar/backtest.</CardDescription>
            </CardHeader>
            <CardContent>
              {errors.length === 0 ? (
                <p className="text-sm text-emerald-600">Estrategia valida para la primera etapa.</p>
              ) : (
                <ul className="space-y-2">
                  {errors.map((error) => (
                    <li key={error} className="flex items-start gap-2 text-sm text-amber-700">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function StrategyBuilder() {
  return (
    <ReactFlowProvider>
      <StrategyBuilderContent />
    </ReactFlowProvider>
  );
}
