// src/components/trading-chart.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type CandlestickSeriesPartialOptions,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";

type Candle = {
  time: string; // ISO que viene del backend
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type HistoryResponse = {
  instrument: string;
  timeframe: string;
  count: number;
  candles: Candle[];
};

type TradingChartProps = {
  instrument: string;
  timeframe: string;
  start?: string;
  end?: string;
  limit?: number;
};

export function TradingChart({
  instrument,
  timeframe,
  start,
  end,
  limit = 500,
}: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

        const params = new URLSearchParams();
        params.set("limit", String(limit));
        if (start) params.set("start", start);
        if (end) params.set("end", end);

        const url = `${baseUrl}/history/${instrument}/${timeframe}?${params.toString()}`;

        const res = await fetch(url);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Histórico error ${res.status}: ${text}`);
        }

        const data: HistoryResponse = await res.json();

        if (!data.candles || data.candles.length === 0) {
          throw new Error("La API no devolvió velas");
        }

        const seriesData: CandlestickData<UTCTimestamp>[] = data.candles.map(
          (c): CandlestickData<UTCTimestamp> => ({
            // segundos desde epoch → UTCTimestamp
            time: Math.floor(new Date(c.time).getTime() / 1000) as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })
        );

        if (!containerRef.current || cancelled) return;

        // destruir chart anterior
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }

        const chart = createChart(containerRef.current, {
          autoSize: true,
          layout: {
            background: { color: "#ffffff" },
            textColor: "#222222",
          },
          grid: {
            vertLines: { color: "#e5e5e5" },
            horzLines: { color: "#e5e5e5" },
          },
          rightPriceScale: {
            borderColor: "#d1d5db",
          },
          timeScale: {
            borderColor: "#d1d5db",
          },
        });

        chartRef.current = chart;

        const candleOptions: CandlestickSeriesPartialOptions = {
          wickUpColor: "#16a34a",
          wickDownColor: "#dc2626",
          upColor: "#16a34a",
          downColor: "#dc2626",
          borderUpColor: "#16a34a",
          borderDownColor: "#dc2626",
        };

        const series = chart.addCandlestickSeries(candleOptions);
        series.setData(seriesData);
        chart.timeScale().fitContent();
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          const message =
            err instanceof Error
              ? err.message
              : typeof err === "string"
              ? err
              : "Error desconocido";

          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();

    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [instrument, timeframe, start, end, limit]);

  return (
    <div className="flex flex-col gap-2 w-full h-full">
      <div className="flex items-center justify-between px-3 pt-2">
        <h2 className="text-sm font-medium text-neutral-700">
          {instrument} · {timeframe}
        </h2>
        {loading && (
          <span className="text-xs text-neutral-500">Cargando velas...</span>
        )}
        {error && <span className="text-xs text-red-500">Error: {error}</span>}
      </div>

      <div
        ref={containerRef}
        className="w-full h-[480px] border-t border-neutral-200"
      />
    </div>
  );
}
