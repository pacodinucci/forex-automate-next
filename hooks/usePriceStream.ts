"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveQuote } from "@/lib/market-stream";
import { getMarketWsUrl } from "@/lib/market-stream";

type StreamStatus = "idle" | "connecting" | "open" | "closed" | "error";

type SingleQuoteMessage = Partial<LiveQuote> & {
  type?: string;
  symbol?: string;
  bid?: number;
  ask?: number;
  mid?: number;
  price?: number;
  timestamp?: number;
};

type BatchPricesMessage = {
  type?: string;
  count?: number;
  symbols?: string[];
  prices?: Array<{
    symbol?: string;
    price?: number;
    bid?: number;
    ask?: number;
    mid?: number;
    timestamp?: number;
  }>;
};
function isSingleQuoteMessage(message: SingleQuoteMessage | BatchPricesMessage): message is SingleQuoteMessage {
  return (
    "symbol" in message ||
    "price" in message ||
    "bid" in message ||
    "ask" in message ||
    "mid" in message ||
    "timestamp" in message
  );
}

function normalizeSymbols(symbols: string[]) {
  return [...new Set(symbols.map((symbol) => symbol.trim()).filter(Boolean))].sort();
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

export function usePriceStream(symbols: string[], interval = 1) {
  const normalizedSymbols = useMemo(() => normalizeSymbols(symbols), [symbols]);
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [connectionStatus, setConnectionStatus] = useState<Exclude<StreamStatus, "idle">>("connecting");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (normalizedSymbols.length === 0) {
      socketRef.current?.close();
      socketRef.current = null;
      return;
    }

    const ws = new WebSocket(getMarketWsUrl(normalizedSymbols, interval));
    socketRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("open");
    };

    ws.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data) as SingleQuoteMessage | BatchPricesMessage;

        if (raw.type === "prices" && "prices" in raw && Array.isArray(raw.prices)) {
          const prices = raw.prices;
          setQuotes((current) => {
            const next = { ...current };
            for (const item of prices) {
              const quote = toLiveQuote(item);
              if (quote) {
                next[quote.symbol] = mergeQuote(current[quote.symbol], quote);
              }
            }
            return next;
          });
          return;
        }

        if (raw.type && raw.type !== "quote") {
          return;
        }

        if (!isSingleQuoteMessage(raw)) {
          return;
        }

        const quote = toLiveQuote(raw);
        if (!quote) {
          return;
        }

        setQuotes((current) => ({
          ...current,
          [quote.symbol]: mergeQuote(current[quote.symbol], quote),
        }));
      } catch {
        setConnectionStatus("error");
      }
    };

    ws.onerror = () => {
      setConnectionStatus("error");
    };

    ws.onclose = () => {
      setConnectionStatus("closed");
    };

    return () => {
      ws.close();
      if (socketRef.current === ws) {
        socketRef.current = null;
      }
    };
  }, [interval, normalizedSymbols]);

  const status: StreamStatus = normalizedSymbols.length === 0 ? "idle" : connectionStatus;

  return { quotes, status };
}



