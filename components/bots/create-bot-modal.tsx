"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  BulkCreateBotsPayload,
  BulkCreateBotsResponse,
  CreateBotPayload,
  StrategyDefinition,
} from "@/lib/types";
import { createBot, createBotsBulk, getMajorSymbols, getStrategies } from "@/lib/bots-api";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

const FALLBACK_MAJOR_SYMBOLS = [
  "EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF", "USDJPY",
  "EURGBP", "EURAUD", "EURNZD", "EURCAD", "EURCHF", "EURJPY",
  "GBPAUD", "GBPNZD", "GBPCAD", "GBPCHF", "GBPJPY",
  "AUDNZD", "AUDCAD", "AUDCHF", "AUDJPY",
  "NZDCAD", "NZDCHF", "NZDJPY", "CADCHF", "CADJPY",
];

type CreateMode = "auto" | "single" | "bulk";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => Promise<void> | void;
  mode?: CreateMode;
};

function toInitialParams(strategy?: StrategyDefinition): Record<string, string> {
  if (!strategy) return {};

  return strategy.params.reduce<Record<string, string>>((acc, param) => {
    if (param.default !== undefined && param.default !== null) {
      acc[param.key] = String(param.default);
      return acc;
    }

    acc[param.key] = "";
    return acc;
  }, {});
}

function isPeakDip(strategyId: string) {
  return strategyId.toLowerCase().includes("peak_dip") || strategyId.toLowerCase().includes("peak-dip");
}

function toUniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export default function CreateBotModal({ open, onOpenChange, onCreated, mode = "auto" }: Props) {
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [slPoints, setSlPoints] = useState("");
  const [tpPoints, setTpPoints] = useState("");
  const [autoStart, setAutoStart] = useState(true);

  const [availableSymbols, setAvailableSymbols] = useState<string[]>(FALLBACK_MAJOR_SYMBOLS);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([FALLBACK_MAJOR_SYMBOLS[0]]);

  const [strategies, setStrategies] = useState<StrategyDefinition[]>([]);
  const [strategyId, setStrategyId] = useState("");
  const [strategyParams, setStrategyParams] = useState<Record<string, string>>({});

  const [bulkResult, setBulkResult] = useState<BulkCreateBotsResponse | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStrategy = useMemo(
    () => strategies.find((strategy) => strategy.id === strategyId),
    [strategies, strategyId]
  );

  const isBulk = useMemo(() => {
    if (mode === "bulk") return true;
    if (mode === "single") return false;
    return selectedSymbols.length > 1;
  }, [mode, selectedSymbols.length]);

  useEffect(() => {
    if (!open) return;

    async function loadMeta() {
      try {
        setLoadingMeta(true);
        setError(null);
        setBulkResult(null);

        const [strategyData, symbolsData] = await Promise.all([
          getStrategies(),
          getMajorSymbols().catch(() => null),
        ]);

        const strategyList = strategyData?.strategies ?? [];
        setStrategies(strategyList);

        const firstStrategy = strategyList[0];
        if (firstStrategy) {
          setStrategyId(firstStrategy.id);
          setStrategyParams(toInitialParams(firstStrategy));
        }

        const symbolsFromApi = toUniqueSorted(symbolsData?.symbols ?? FALLBACK_MAJOR_SYMBOLS);
        setAvailableSymbols(symbolsFromApi);

        if (mode === "bulk") {
          setSelectedSymbols(symbolsFromApi);
        } else {
          setSelectedSymbols([symbolsFromApi[0] ?? FALLBACK_MAJOR_SYMBOLS[0]]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load strategies");
      } finally {
        setLoadingMeta(false);
      }
    }

    void loadMeta();
  }, [open, mode]);

  function updateParam(key: string, value: string) {
    setStrategyParams((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleStrategyChange(nextStrategyId: string) {
    setStrategyId(nextStrategyId);
    const nextStrategy = strategies.find((item) => item.id === nextStrategyId);
    setStrategyParams(toInitialParams(nextStrategy));
  }

  function toggleSymbol(symbol: string, checked: boolean) {
    setSelectedSymbols((current) => {
      if (checked) {
        return toUniqueSorted([...current, symbol]);
      }

      const next = current.filter((item) => item !== symbol);
      return next.length > 0 ? next : [symbol];
    });
  }

  function parseOptionalNumber(value: string, field: string) {
    if (!value.trim()) {
      return undefined;
    }

    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid number for ${field}`);
    }

    return parsed;
  }

  function parseParams(): Record<string, unknown> {
    if (!selectedStrategy) {
      throw new Error("Select a strategy");
    }

    const parsed: Record<string, unknown> = {};

    for (const param of selectedStrategy.params) {
      const rawValue = strategyParams[param.key] ?? "";

      if (param.required && rawValue.trim() === "") {
        throw new Error(`Missing param: ${param.key}`);
      }

      if (rawValue.trim() === "") {
        continue;
      }

      if (param.type === "int") {
        const value = Number.parseInt(rawValue, 10);
        if (Number.isNaN(value)) {
          throw new Error(`Invalid integer for ${param.key}`);
        }
        parsed[param.key] = value;
        continue;
      }

      if (param.type === "float") {
        const value = Number.parseFloat(rawValue);
        if (Number.isNaN(value)) {
          throw new Error(`Invalid number for ${param.key}`);
        }
        parsed[param.key] = value;
        continue;
      }

      if (param.type === "boolean") {
        parsed[param.key] = rawValue === "true";
        continue;
      }

      parsed[param.key] = rawValue;
    }

    const parsedVolume = parsed.volume;
    if (typeof parsedVolume === "number" && parsedVolume < 100000) {
      throw new Error("Volume must be >= 100000");
    }

    return parsed;
  }

  function resetForm() {
    setName("");
    setAccountId("");
    setSlPoints("");
    setTpPoints("");
    setAutoStart(true);
    setError(null);
    setBulkResult(null);

    const firstStrategy = strategies[0];
    setStrategyId(firstStrategy?.id ?? "");
    setStrategyParams(toInitialParams(firstStrategy));

    const firstSymbol = availableSymbols[0] ?? FALLBACK_MAJOR_SYMBOLS[0];
    setSelectedSymbols(mode === "bulk" ? availableSymbols : [firstSymbol]);
  }

  function appendShortcutParams(payload: Record<string, unknown>) {
    const parsedSlPoints = parseOptionalNumber(slPoints, "sl_points");
    const parsedTpPoints = parseOptionalNumber(tpPoints, "tp_points");

    if (parsedSlPoints !== undefined) {
      payload.sl_points = parsedSlPoints;
    }

    if (parsedTpPoints !== undefined) {
      payload.tp_points = parsedTpPoints;
    }
  }

  async function handleCreate() {
    try {
      setSaving(true);
      setError(null);
      setBulkResult(null);

      if (!strategyId) {
        throw new Error("Select a strategy");
      }

      if (!accountId.trim()) {
        throw new Error("Account ID is required");
      }

      if (selectedSymbols.length === 0) {
        throw new Error("Select at least one symbol");
      }

      const parsedParams = parseParams();

      if (isBulk) {
        const perBotBase: Record<string, unknown> = {
          ...parsedParams,
        };
        appendShortcutParams(perBotBase);

        const bulkPayload: BulkCreateBotsPayload = {
          strategy: strategyId,
          accountId: accountId.trim(),
          namePrefix: name.trim() || `${strategyId}_multi`,
          autoStart,
          bots: selectedSymbols.map((item) => ({
            symbol: item,
            ...perBotBase,
          })),
        };

        const result = await createBotsBulk(bulkPayload);
        setBulkResult(result);
        const { created_count, total, started_count, failed_count } = result;
        if (failed_count > 0) {
          toast.warning(
            "Bulk finalizado: " + created_count + "/" + total + " creados, " + started_count + " iniciados, " + failed_count + " fallidos."
          );
        } else {
          toast.success(
            "Bulk OK: " + created_count + "/" + total + " bots creados" + (autoStart ? ", " + started_count + " iniciados" : "") + "."
          );
        }
        await onCreated?.();
        return;
      }

      const symbol = selectedSymbols[0];
      const payload: CreateBotPayload = {
        symbol,
        strategy: strategyId,
        accountId: accountId.trim(),
        strategyParams: parsedParams,
        name: name.trim() || undefined,
      };

      const shortcutParams: Record<string, unknown> = {};
      appendShortcutParams(shortcutParams);
      if (typeof shortcutParams.sl_points === "number") {
        payload.sl_points = shortcutParams.sl_points;
      }
      if (typeof shortcutParams.tp_points === "number") {
        payload.tp_points = shortcutParams.tp_points;
      }

      const volumeFromParams = parsedParams.volume;
      if (typeof volumeFromParams === "number") {
        payload.volume = volumeFromParams;
        payload.volumeUnits = volumeFromParams;
      }

      await createBot(payload);
      toast.success("Bot creado correctamente.");
      onOpenChange(false);
      resetForm();
      await onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create bot");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border-border/80 bg-background/95 p-0 sm:max-w-5xl">
        <DialogHeader>
          <div className="border-b border-border/70 px-6 py-5">
            <span className="premium-chip bg-accent/45">{isBulk ? "Bulk Setup" : "Single Setup"}</span>
            <DialogTitle className="mt-2">{isBulk ? "Create Multiple Bots" : "Create Bot"}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 py-4 pr-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
            <div className="space-y-4 rounded-2xl border border-border/70 bg-card/85 p-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.08em] text-muted-foreground" htmlFor="bot-name">Name {isBulk ? "prefix" : "(optional)"}</Label>
                <Input
                  id="bot-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={isBulk ? "multi_peak" : "Peak/Dip EURUSD"}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-[0.08em] text-muted-foreground" htmlFor="account-id">Account ID *</Label>
                  <Input
                    id="account-id"
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                    placeholder="45440970"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Strategy</Label>
                  <Select value={strategyId} onValueChange={handleStrategyChange} disabled={loadingMeta || strategies.length === 0}>
                    <SelectTrigger className="w-full bg-background/90">
                      <SelectValue placeholder="Select strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      {strategies.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedStrategy?.params.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {selectedStrategy.params.map((param) => (
                    <div key={param.key} className="space-y-2">
                      <Label className="text-xs uppercase tracking-[0.08em] text-muted-foreground" htmlFor={`param-${param.key}`}>
                        {param.key}
                        {param.required ? " *" : ""}
                      </Label>
                      {param.type === "boolean" ? (
                        <Select
                          value={strategyParams[param.key] || "false"}
                          onValueChange={(value) => updateParam(param.key, value)}
                        >
                          <SelectTrigger className="w-full bg-background/90" id={`param-${param.key}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">true</SelectItem>
                            <SelectItem value="false">false</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={`param-${param.key}`}
                          type={param.type === "int" || param.type === "float" ? "number" : "text"}
                          value={strategyParams[param.key] ?? ""}
                          onChange={(event) => updateParam(param.key, event.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : null}

              {isPeakDip(strategyId) ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-[0.08em] text-muted-foreground" htmlFor="sl-points">SL points (optional)</Label>
                    <Input
                      id="sl-points"
                      type="number"
                      value={slPoints}
                      onChange={(event) => setSlPoints(event.target.value)}
                      placeholder="150"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-[0.08em] text-muted-foreground" htmlFor="tp-points">TP points (optional)</Label>
                    <Input
                      id="tp-points"
                      type="number"
                      value={tpPoints}
                      onChange={(event) => setTpPoints(event.target.value)}
                      placeholder="300"
                    />
                  </div>
                </div>
              ) : null}

              {isBulk ? (
                <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-secondary/30 p-3">
                  <Checkbox checked={autoStart} onCheckedChange={(value) => setAutoStart(value === true)} />
                  <Label className="text-sm">Auto-start bots after create</Label>
                </div>
              ) : null}
            </div>

            <div className="space-y-2 rounded-2xl border border-border/70 bg-card/85 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Symbols</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSymbols(availableSymbols)}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSymbols([availableSymbols[0] ?? FALLBACK_MAJOR_SYMBOLS[0]])}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-[360px] rounded-xl border border-border/70 bg-background/80 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {availableSymbols.map((item) => {
                    const checked = selectedSymbols.includes(item);
                    return (
                      <label key={item} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm transition-colors hover:bg-secondary/45">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => toggleSymbol(item, value === true)}
                        />
                        <span>{item}</span>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                {selectedSymbols.length} selected {isBulk ? "(bulk create)" : "(single create)"}
              </p>
            </div>
          </div>

          {bulkResult ? (
            <div className="rounded-xl border border-border/70 bg-card/85 p-3 text-sm">
              <div className="font-medium">Bulk result</div>
              <div className="mt-1 text-muted-foreground">
                Created {bulkResult.created_count}/{bulkResult.total}, started {bulkResult.started_count}, failed {bulkResult.failed_count}
              </div>
              <div className="mt-3 max-h-44 overflow-auto rounded-xl border border-border/70 bg-background/70">
                {bulkResult.results.map((result, index) => (
                  <div key={`${result.symbol ?? "item"}-${index}`} className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs last:border-b-0">
                    <span className="font-medium">{result.symbol ?? `#${index + 1}`}</span>
                    <span className={result.status === "ok" ? "text-emerald-600" : "text-red-600"}>
                      {result.status ?? "unknown"}
                      {result.detail ? ` - ${result.detail}` : ""}
                      {result.error ? ` - ${result.error}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t border-border/70 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving || loadingMeta || !strategyId}>
            {saving ? "Creating..." : isBulk ? `Create ${selectedSymbols.length} bots` : "Create bot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}





