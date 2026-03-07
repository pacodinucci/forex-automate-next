// store/useBacktestStore.ts
import { create } from "zustand";

export type OHLC = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type DaySummary = {
  date: string;
  trend: "bullish" | "bearish" | "neutral" | "no_data";
  levels: {
    type: "support" | "resistance";
    price: number;
    touches: number;
    first_time: string;
    last_time: string;
  }[];
  signal: {
    time: string;
    levelPrice: number;
    distPoints: number;
    johnWickType: "bullish" | "bearish" | "none";
  } | null;
};

type BacktestState = {
  instrument: string | null;
  start: string | null;
  end: string | null;
  d1: OHLC[];
  h1: OHLC[];
  m15: OHLC[];
  days: DaySummary[];
  selectedDate: string | null;
  setBacktest: (payload: {
    instrument: string;
    start: string;
    end: string;
    d1: OHLC[];
    h1: OHLC[];
    m15: OHLC[];
    days: DaySummary[];
  }) => void;
  setSelectedDate: (date: string | null) => void;
};

export const useBacktestStore = create<BacktestState>((set) => ({
  instrument: null,
  start: null,
  end: null,
  d1: [],
  h1: [],
  m15: [],
  days: [],
  selectedDate: null,
  setBacktest: (p) =>
    set({
      instrument: p.instrument,
      start: p.start,
      end: p.end,
      d1: p.d1,
      h1: p.h1,
      m15: p.m15,
      days: p.days,
      selectedDate: p.days[0]?.date ?? null,
    }),
  setSelectedDate: (date) => set({ selectedDate: date }),
}));
