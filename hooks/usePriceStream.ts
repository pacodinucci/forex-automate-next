"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveQuote } from "@/lib/market-stream";
import { getMarketWsUrl } from "@/lib/market-stream";

type StreamStatus = "idle" | "connecting" | "open" | "closed" | "error";

type QuoteLike = {
  symbol?: string;
  price?: number;
  bid?: number;
  ask?: number;
  mid?: number;
  timestamp?: number;
};

function normalizeSymbols(symbols: string[]) {
  return [...new Set(symbols.map((symbol) => symbol.trim()).filter(Boolean))].sort();
}

function normalizeSymbolKey(value: string | undefined | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function toLiveQuote(message: {
  symbol?: string;
  price?: number;
  bid?: number;
  ask?: number;
  mid?: number;
  timestamp?: number;
}): LiveQuote | null {
  if (!message.symbol) {
    return null;
  }

  const bid = message.bid !== undefined ? Number(message.bid) : undefined;
  const ask = message.ask !== undefined ? Number(message.ask) : undefined;
  const price = message.price !== undefined ? Number(message.price) : undefined;
  const mid = message.mid !== undefined
    ? Number(message.mid)
    : bid !== undefined && ask !== undefined
      ? (bid + ask) / 2
      : price;

  return {
    symbol: message.symbol,
    price,
    bid,
    ask,
    mid,
    timestamp: message.timestamp !== undefined ? Number(message.timestamp) : Math.floor(Date.now() / 1000),
    direction: "flat",
  };
}

function getPrimaryPrice(quote: LiveQuote) {
  return quote.mid ?? quote.price ?? quote.bid ?? quote.ask;
}

function mergeQuote(previous: LiveQuote | undefined, incoming: LiveQuote) {
  const previousPrice = previous ? getPrimaryPrice(previous) : undefined;
  const nextPrice = getPrimaryPrice(incoming);

  let direction: LiveQuote["direction"] = "flat";
  if (previousPrice !== undefined && nextPrice !== undefined && previousPrice !== nextPrice) {
    direction = nextPrice > previousPrice ? "up" : "down";
  }

  return {
    ...incoming,
    direction,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function asQuoteLike(value: unknown): QuoteLike | null {
  if (!isObject(value)) {
    return null;
  }

  const symbol = typeof value.symbol === "string"
    ? normalizeSymbolKey(value.symbol)
    : typeof value.instrument === "string"
      ? normalizeSymbolKey(value.instrument)
      : undefined;

  const price = pickNumber(value.price);
  const bid = pickNumber(value.bid);
  const ask = pickNumber(value.ask);
  const mid = pickNumber(value.mid);
  const timestamp = pickNumber(value.timestamp ?? value.ts ?? value.time);

  if (!symbol && price === undefined && bid === undefined && ask === undefined && mid === undefined) {
    return null;
  }

  return {
    symbol,
    price,
    bid,
    ask,
    mid,
    timestamp,
  };
}

function extractQuotes(payload: unknown): QuoteLike[] {
  if (Array.isArray(payload)) {
    return payload.map(asQuoteLike).filter((item): item is QuoteLike => Boolean(item));
  }

  const direct = asQuoteLike(payload);
  if (direct) {
    return [direct];
  }

  if (!isObject(payload)) {
    return [];
  }

  const candidates = [
    payload.prices,
    payload.quotes,
    payload.items,
    payload.data,
    payload.payload,
    payload.tick,
    payload.quote,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const quotes = candidate.map(asQuoteLike).filter((item): item is QuoteLike => Boolean(item));
      if (quotes.length > 0) {
        return quotes;
      }
    }

    const nested = asQuoteLike(candidate);
    if (nested) {
      return [nested];
    }
  }

  return [];
}

export function usePriceStream(symbols: string[], interval = 1) {
  const normalizedSymbols = useMemo(() => normalizeSymbols(symbols), [symbols]);
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [connectionStatus, setConnectionStatus] = useState<Exclude<StreamStatus, "idle">>("connecting");
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const lastMessageAtRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const [reconnectNonce, setReconnectNonce] = useState(0);

  useEffect(() => {
    if (normalizedSymbols.length === 0) {
      socketRef.current?.close();
      socketRef.current = null;
      return;
    }

    setConnectionStatus("connecting");
    const ws = new WebSocket(getMarketWsUrl(normalizedSymbols, interval));
    socketRef.current = ws;
    lastMessageAtRef.current = Date.now();

    const clearReconnectTimeout = () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (reconnectTimeoutRef.current !== null) {
        return;
      }
      reconnectTimeoutRef.current = window.setTimeout(() => {
        reconnectTimeoutRef.current = null;
        setReconnectNonce((value) => value + 1);
      }, 900);
    };

    ws.onopen = () => {
      setConnectionStatus("open");
    };

    ws.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data) as unknown;
        const now = Date.now();
        lastMessageAtRef.current = now;
        setLastMessageAt(now);
        const extracted = extractQuotes(raw);
        if (extracted.length === 0) {
          return;
        }

        setQuotes((current) => {
          const next = { ...current };
          for (const item of extracted) {
            const quote = toLiveQuote(item);
            if (!quote) continue;
            next[quote.symbol] = mergeQuote(current[quote.symbol], quote);
          }
          return next;
        });
      } catch {
        setConnectionStatus("error");
      }
    };

    ws.onerror = () => {
      setConnectionStatus("error");
    };

    ws.onclose = () => {
      setConnectionStatus("closed");
      if (socketRef.current === ws && normalizedSymbols.length > 0) {
        scheduleReconnect();
      }
    };

    const staleWatchdog = window.setInterval(() => {
      if (socketRef.current !== ws) {
        return;
      }

      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }

      if (Date.now() - lastMessageAtRef.current > 10_000) {
        ws.close(4000, "stale_stream");
      }
    }, 2500);

    return () => {
      clearReconnectTimeout();
      window.clearInterval(staleWatchdog);
      ws.close();
      if (socketRef.current === ws) {
        socketRef.current = null;
      }
    };
  }, [interval, normalizedSymbols, reconnectNonce]);

  const status: StreamStatus = normalizedSymbols.length === 0 ? "idle" : connectionStatus;

  return { quotes, status, lastMessageAt };
}



