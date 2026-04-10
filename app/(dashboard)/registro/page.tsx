"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getRegistro } from "@/lib/bots-api";
import type {
  TradeRegistryItem,
  TradeRegistryStatusFilter,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type RegistryFilters = {
  status: TradeRegistryStatusFilter;
  symbol: string;
  limit: number;
};

const LIMIT_OPTIONS = [50, 100, 200] as const;
const POLLING_MS = 15000;

function fmtDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function fmtNumber(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pnlTone(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value) || value === 0) {
    return "text-muted-foreground";
  }
  return value > 0 ? "text-emerald-600" : "text-red-600";
}

function statusVariant(status: TradeRegistryItem["status"]) {
  return status === "OPEN" ? "secondary" : "default";
}

export default function RegistroPage() {
  const [filters, setFilters] = useState<RegistryFilters>({
    status: "ALL",
    symbol: "",
    limit: 100,
  });
  const [appliedFilters, setAppliedFilters] = useState<RegistryFilters>({
    status: "ALL",
    symbol: "",
    limit: 100,
  });

  const [trades, setTrades] = useState<TradeRegistryItem[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  const queryPayload = useMemo(
    () => ({
      status: appliedFilters.status,
      limit: appliedFilters.limit,
      symbol: appliedFilters.symbol.trim() || undefined,
    }),
    [appliedFilters],
  );

  const loadRegistro = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      try {
        if (mode === "initial") {
          setLoading(true);
        } else {
          setRefreshing(true);
        }
        setError(null);

        const response = await getRegistro(queryPayload);
        setTrades(response.trades ?? []);
        setCount(response.count ?? 0);
        setLastSyncAt(new Date());
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "No se pudo cargar el registro",
        );
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [queryPayload],
  );

  useEffect(() => {
    void loadRegistro("initial");
  }, [loadRegistro]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadRegistro("refresh");
    }, POLLING_MS);

    return () => window.clearInterval(timer);
  }, [loadRegistro]);

  function applyFilters() {
    setAppliedFilters({
      ...filters,
      symbol: filters.symbol.trim().toUpperCase(),
    });
  }

  function resetFilters() {
    const next = { status: "ALL" as const, symbol: "", limit: 100 };
    setFilters(next);
    setAppliedFilters(next);
  }

  return (
    <div className="space-y-5">
      <div className="premium-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-background/65 px-4 py-4 md:px-5">
          <div className="space-y-1">
            <span className="premium-chip bg-accent/45">Trade Registry</span>
            <h1 className="text-2xl font-semibold tracking-tight">Registro</h1>
            <p className="text-sm text-muted-foreground">
              Historial de aperturas y cierres de operaciones.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {lastSyncAt ? (
              <span className="text-xs text-muted-foreground">
                Actualizado {lastSyncAt.toLocaleTimeString()}
              </span>
            ) : null}
            <Button
              variant="outline"
              onClick={() => void loadRegistro("refresh")}
              disabled={refreshing}
            >
              <RefreshCw
                className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-3 px-4 py-4 md:grid-cols-4 md:px-5">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Estado
            </label>
            <Select
              value={filters.status}
              onValueChange={(value: TradeRegistryStatusFilter) =>
                setFilters((current) => ({ ...current, status: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">ALL</SelectItem>
                <SelectItem value="OPEN">OPEN</SelectItem>
                <SelectItem value="CLOSED">CLOSED</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Simbolo
            </label>
            <Input
              value={filters.symbol}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  symbol: event.target.value.toUpperCase(),
                }))
              }
              placeholder="EURUSD"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Limite
            </label>
            <Select
              value={String(filters.limit)}
              onValueChange={(value) =>
                setFilters((current) => ({ ...current, limit: Number(value) }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Limit" />
              </SelectTrigger>
              <SelectContent>
                {LIMIT_OPTIONS.map((limitValue) => (
                  <SelectItem key={limitValue} value={String(limitValue)}>
                    {limitValue}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end justify-end gap-2">
            <Button variant="outline" onClick={resetFilters}>
              Reset
            </Button>
            <Button onClick={applyFilters}>Aplicar filtros</Button>
          </div>
        </div>
      </div>

      {loading ? <div>Cargando registro...</div> : null}
      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      {!loading ? (
        <div className="premium-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 text-sm md:px-5">
            <span>
              Mostrando {trades.length} de {count} operaciones
            </span>
            <span className="text-muted-foreground">
              Ordenadas por apertura mas reciente
            </span>
          </div>

          {trades.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No hay operaciones para los filtros seleccionados.
            </div>
          ) : (
            <Table className="min-w-[1280px]">
              <TableHeader>
                <TableRow className="border-b bg-secondary/45 hover:bg-secondary/45">
                  <TableHead className="px-4">Fecha apertura</TableHead>
                  <TableHead className="px-4">Simbolo</TableHead>
                  <TableHead className="px-4">Lado</TableHead>
                  <TableHead className="px-4 text-right">Volumen</TableHead>
                  <TableHead className="px-4 text-right">Entrada</TableHead>
                  <TableHead className="px-4 text-right">SL</TableHead>
                  <TableHead className="px-4 text-right">TP</TableHead>
                  <TableHead className="px-4">Estado</TableHead>
                  <TableHead className="px-4 text-right">Resultado (PnL)</TableHead>
                  <TableHead className="px-4">Fuente</TableHead>
                  <TableHead className="px-4">Bot</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.map((trade) => (
                  <TableRow key={trade.id} className="odd:bg-card even:bg-secondary/20">
                    <TableCell className="px-4 text-xs tabular-nums">
                      {fmtDate(trade.openedAt)}
                    </TableCell>
                    <TableCell className="px-4 font-medium">{trade.symbol}</TableCell>
                    <TableCell className="px-4 uppercase">{trade.side}</TableCell>
                    <TableCell className="px-4 text-right tabular-nums">
                      {fmtNumber(trade.volume, 0)}
                    </TableCell>
                    <TableCell className="px-4 text-right tabular-nums">
                      {fmtNumber(trade.openPrice, 5)}
                    </TableCell>
                    <TableCell className="px-4 text-right tabular-nums">
                      {fmtNumber(trade.stopLoss, 5)}
                    </TableCell>
                    <TableCell className="px-4 text-right tabular-nums">
                      {fmtNumber(trade.takeProfit, 5)}
                    </TableCell>
                    <TableCell className="px-4">
                      <Badge variant={statusVariant(trade.status)}>
                        {trade.status}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "px-4 text-right font-medium tabular-nums",
                        pnlTone(trade.pnl),
                      )}
                    >
                      {fmtNumber(trade.pnl, 2)}
                    </TableCell>
                    <TableCell className="px-4 lowercase">{trade.source}</TableCell>
                    <TableCell className="px-4">
                      {trade.botId ? (
                        <span className="font-mono text-xs">{trade.botId}</span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      ) : null}
    </div>
  );
}
