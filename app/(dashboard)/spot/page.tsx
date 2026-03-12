"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePriceStream } from "@/hooks/usePriceStream";
import { cn } from "@/lib/utils";

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "USDCAD"];

const SpotPage = () => {
  const { quotes, status } = usePriceStream(SYMBOLS, 1);
  const [search, setSearch] = useState("");

  const sortedSymbols = useMemo(() => Object.keys(quotes).sort(), [quotes]);
  const filteredSymbols = useMemo(() => {
    const query = search.trim().toUpperCase();
    if (!query) return sortedSymbols;
    return sortedSymbols.filter((symbol) => symbol.includes(query));
  }, [search, sortedSymbols]);

  return (
    <div className="p-6">
      <h1 className="mb-2 text-2xl font-semibold">Spot Prices</h1>

      <p className="mb-5 text-sm">
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

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <div className="relative max-w-md">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search or filter..."
              className="h-10 rounded-full border-0 bg-muted/65 pr-4 pl-9 shadow-none focus-visible:ring-2"
            />
          </div>
        </div>

        {sortedSymbols.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            Aun no hay cotizaciones recibidas.
          </div>
        ) : filteredSymbols.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No hay resultados para ese filtro.
          </div>
        ) : (
          <Table className="min-w-[860px] text-sm">
            <TableHeader>
              <TableRow className="border-b bg-muted/35 hover:bg-muted/35">
                <TableHead className="h-11 px-4 text-[11px] font-semibold tracking-[0.04em] uppercase">
                  Status
                </TableHead>
                <TableHead className="h-11 px-4 text-[11px] font-semibold tracking-[0.04em] uppercase">
                  Symbol
                </TableHead>
                <TableHead className="h-11 px-4 text-right text-[11px] font-semibold tracking-[0.04em] uppercase">
                  Price
                </TableHead>
                <TableHead className="h-11 px-4 text-right text-[11px] font-semibold tracking-[0.04em] uppercase">
                  Bid
                </TableHead>
                <TableHead className="h-11 px-4 text-right text-[11px] font-semibold tracking-[0.04em] uppercase">
                  Ask
                </TableHead>
                <TableHead className="h-11 px-4 text-right text-[11px] font-semibold tracking-[0.04em] uppercase">
                  Updated
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSymbols.map((sym) => {
                const q = quotes[sym];
                const price = q.mid ?? q.price ?? q.bid ?? q.ask;

                return (
                  <TableRow
                    key={sym}
                    className={cn(
                      "h-12 border-b border-border/70 bg-card hover:bg-emerald-50/35",
                      "odd:bg-card even:bg-slate-50/40"
                    )}
                  >
                    <TableCell className="px-4">
                      <span className="inline-flex h-4 w-7 items-center rounded-full bg-emerald-100 p-0.5">
                        <span className="h-3 w-3 rounded-full bg-emerald-500" />
                      </span>
                    </TableCell>
                    <TableCell className="px-4 font-medium tracking-[0.02em] text-slate-700">
                      {q.symbol}
                    </TableCell>
                    <TableCell className="px-4 text-right font-medium tabular-nums text-slate-800">
                      {price !== undefined ? price.toFixed(5) : "-"}
                    </TableCell>
                    <TableCell className="px-4 text-right tabular-nums text-slate-700">
                      {q.bid !== undefined ? q.bid.toFixed(5) : "-"}
                    </TableCell>
                    <TableCell className="px-4 text-right tabular-nums text-slate-700">
                      {q.ask !== undefined ? q.ask.toFixed(5) : "-"}
                    </TableCell>
                    <TableCell className="px-4 text-right tabular-nums text-slate-600">
                      {q.timestamp
                        ? new Date(q.timestamp * 1000).toLocaleTimeString()
                        : "-"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};

export default SpotPage;
