// app/(dashboard)/backtesting/page.tsx
"use client";

import { BacktestPlayer } from "@/components/backtesting/backtest-player";

export default function BacktestingPage() {
  return (
    <div className="p-6 flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Backtesting Page</h1>

      <BacktestPlayer
        instrument="EURUSD"
        timeframe="H1"
        start="2025-11-01"
        end="2025-11-30"
        speedMs={150} // puedes jugar con la velocidad
      />
    </div>
  );
}
