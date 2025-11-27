"use client";

import { useState } from "react";
// import { tradingApi } from "@/lib/trading-api";
import { appApi } from "@/lib/app-api";
import type { Bot, CreateBotPayload } from "@/lib/types";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (bot: Bot) => void | Promise<void>;
};

const INSTRUMENTS = [
  "EUR_USD",
  "GBP_USD",
  "USD_JPY",
  "AUD_USD",
  "USD_CAD",
  "NZD_USD",
];

export default function CreateBotModal({
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const [instrument, setInstrument] = useState(INSTRUMENTS[0]);
  const [riskPct, setRiskPct] = useState("2");
  const [autoStart, setAutoStart] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setLoading(true);
    setError(null);

    try {
      const payload: CreateBotPayload = {
        instrument,
        riskPct: Number(riskPct) || 2,
        autoStart,
      };

      const res = await appApi<any>("/bots", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // tolerante a distintos shapes de back
      const bot: Bot = res?.bot ?? res?.data ?? res;

      if (!bot?.id) {
        throw new Error("La API no devolvió un bot válido");
      }

      onOpenChange(false);
      await onCreated?.(bot);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Crear nuevo bot</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Instrument */}
          <div className="space-y-1">
            <Label>Instrumento</Label>
            <Select value={instrument} onValueChange={setInstrument}>
              <SelectTrigger>
                <SelectValue placeholder="Elegí un par" />
              </SelectTrigger>
              <SelectContent>
                {INSTRUMENTS.map((i) => (
                  <SelectItem key={i} value={i}>
                    {i}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Risk */}
          <div className="space-y-1">
            <Label>Riesgo por operación (%)</Label>
            <Input
              type="number"
              min="0.1"
              step="0.1"
              value={riskPct}
              onChange={(e) => setRiskPct(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Default recomendado: 2%
            </p>
          </div>

          {/* Auto start */}
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label>Iniciar automáticamente</Label>
              <p className="text-xs text-muted-foreground">
                Si está activo, el bot arranca apenas se crea.
              </p>
            </div>
            <Switch checked={autoStart} onCheckedChange={setAutoStart} />
          </div>

          {error && (
            <div className="text-sm text-red-500 border border-red-200 bg-red-50 p-2 rounded">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? "Creando..." : "Crear bot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
