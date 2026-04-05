import { StrategyBuilder } from "@/components/strategies/strategy-builder";

export default function StrategiesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Estrategias</h1>
        <p className="text-sm text-muted-foreground">
          Editor visual con React Flow para armar la logica de trading.
        </p>
      </div>
      <StrategyBuilder />
    </div>
  );
}
