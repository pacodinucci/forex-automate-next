"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type CandlestickSeriesOptions,
  type DeepPartial,
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

type BacktestPlayerProps = {
  instrument: string;
  timeframe: string;
  start: string; // "2025-11-01"
  end: string; // "2025-11-30"
  speedMs?: number; // velocidad de simulación
};

type CandleSeries = ISeriesApi<"Candlestick">;
type CandleSeriesPartialOptions = DeepPartial<CandlestickSeriesOptions>;

export function BacktestPlayer({
  instrument,
  timeframe,
  start,
  end,
  speedMs = 200,
}: BacktestPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<CandleSeries | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [candles, setCandles] = useState<CandlestickData<UTCTimestamp>[]>([]);

  const idxRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1️⃣ Cargar velas del período y crear el chart
  useEffect(() => {
    let cancelled = false;

    const fetchHistory = async () => {
      setLoading(true);
      setError(null);

      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

        const params = new URLSearchParams();
        params.set("start", start);
        params.set("end", end);

        // usamos timeframe fijo (H1 en tu caso)
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
            time: Math.floor(new Date(c.time).getTime() / 1000) as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })
        );

        if (cancelled) return;

        setCandles(seriesData);
        idxRef.current = 0; // arrancamos desde el inicio

        if (!containerRef.current) return;

        // destruir chart viejo si existe
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
          seriesRef.current = null;
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

        const candleOptions: CandleSeriesPartialOptions = {
          wickUpColor: "#16a34a",
          wickDownColor: "#dc2626",
          upColor: "#16a34a",
          downColor: "#dc2626",
          borderUpColor: "#16a34a",
          borderDownColor: "#dc2626",
        };

        const series = chart.addCandlestickSeries(candleOptions);
        seriesRef.current = series;

        // mostramos solo la primera vela para arrancar
        series.setData(seriesData.slice(0, 1));
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

    fetchHistory();

    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [instrument, timeframe, start, end]);

  // 2️⃣ Lógica de Play / Pause
  const handlePlay = () => {
    if (playing) return;
    if (!seriesRef.current) return;
    if (candles.length === 0) return;

    setPlaying(true);

    timerRef.current = setInterval(() => {
      const i = idxRef.current + 1;

      // si llegamos al final, frenamos
      if (i >= candles.length) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setPlaying(false);
        return;
      }

      idxRef.current = i;
      const c = candles[i];

      // vamos agregando vela por vela
      seriesRef.current?.update(c);
      chartRef.current?.timeScale().fitContent();
    }, speedMs);
  };

  const handlePause = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPlaying(false);
  };

  const handleReset = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPlaying(false);
    idxRef.current = 0;

    if (seriesRef.current && candles.length > 0) {
      seriesRef.current.setData(candles.slice(0, 1));
      chartRef.current?.timeScale().fitContent();
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-700">
          {instrument} · {timeframe} · {start} → {end}
        </h2>

        <div className="flex items-center gap-2">
          {loading && (
            <span className="text-xs text-neutral-500">Cargando velas...</span>
          )}
          {error && (
            <span className="text-xs text-red-500">Error: {error}</span>
          )}

          <button
            className="text-xs px-2 py-1 rounded bg-emerald-500 text-white disabled:opacity-50"
            onClick={handlePlay}
            disabled={loading || playing || candles.length === 0}
          >
            ▶ Play
          </button>
          <button
            className="text-xs px-2 py-1 rounded bg-amber-500 text-white disabled:opacity-50"
            onClick={handlePause}
            disabled={!playing}
          >
            ⏸ Pause
          </button>
          <button
            className="text-xs px-2 py-1 rounded bg-neutral-300 text-neutral-800 disabled:opacity-50"
            onClick={handleReset}
            disabled={candles.length === 0}
          >
            ⏮ Reset
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="w-full h-[500px] border border-neutral-200 rounded-md"
      />
    </div>
  );
}

