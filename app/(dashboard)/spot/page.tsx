"use client";

import { useEffect, useState } from "react";

type Quote = {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  timestamp: number;
};

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "USDCAD"];

const SpotPage = () => {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [status, setStatus] = useState<
    "connecting" | "open" | "closed" | "error"
  >("connecting");

  useEffect(() => {
    // 👇 Ajustá esta URL a donde esté corriendo tu FastAPI
    const ws = new WebSocket(
      process.env.NEXT_PUBLIC_API_WS_URL ?? "ws://localhost:8000/ws/prices"
    );

    ws.onopen = () => {
      setStatus("open");
      // primer mensaje: suscribirse a símbolos
      ws.send(
        JSON.stringify({
          type: "subscribe",
          symbols: SYMBOLS,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "quote") {
          const quote: Quote = {
            symbol: msg.symbol,
            bid: msg.bid,
            ask: msg.ask,
            mid: msg.mid,
            timestamp: msg.timestamp,
          };

          // para ir viendo también en consola:
          console.log("QUOTE WS:", quote);

          setQuotes((prev) => ({
            ...prev,
            [quote.symbol]: quote,
          }));
        }
      } catch (err) {
        console.error("Error parseando mensaje WS:", err);
      }
    };

    ws.onerror = (event) => {
      console.error("WS error:", event);
      setStatus("error");
    };

    ws.onclose = () => {
      setStatus("closed");
    };

    return () => {
      ws.close();
    };
  }, []);

  const symbols = Object.keys(quotes).sort();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Spot Page</h1>

      <p className="text-sm mb-4">
        Estado WebSocket:{" "}
        <span
          className={
            status === "open"
              ? "text-green-600"
              : status === "error"
              ? "text-red-600"
              : "text-yellow-600"
          }
        >
          {status}
        </span>
      </p>

      {symbols.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay cotizaciones recibidas. Revisá la consola del navegador.
        </p>
      ) : (
        <table className="min-w-full border text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="border px-2 py-1 text-left">Symbol</th>
              <th className="border px-2 py-1 text-right">Bid</th>
              <th className="border px-2 py-1 text-right">Ask</th>
              <th className="border px-2 py-1 text-right">Mid</th>
              <th className="border px-2 py-1 text-right">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {symbols.map((sym) => {
              const q = quotes[sym];
              return (
                <tr key={sym}>
                  <td className="border px-2 py-1">{q.symbol}</td>
                  <td className="border px-2 py-1 text-right">
                    {q.bid.toFixed(5)}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {q.ask.toFixed(5)}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {q.mid.toFixed(5)}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {new Date(q.timestamp * 1000).toLocaleTimeString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default SpotPage;
