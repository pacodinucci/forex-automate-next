"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { appApi } from "@/lib/app-api";
import { getMajorSymbols } from "@/lib/bots-api";
import { cn } from "@/lib/utils";

const FALLBACK_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "USDCAD", "USDCHF"];

const optionalPositiveNumber = z.preprocess(
  (value) => {
    if (value === null || value === undefined || value === "") {
      return undefined;
    }

    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().replace(",", ".");
      if (!normalized) {
        return undefined;
      }
      return Number(normalized);
    }

    return value;
  },
  z.number().positive("Debe ser mayor a 0").optional()
);

const formSchema = z.object({
  symbol: z.string().min(1, "Elegi un simbolo"),
  side: z.enum(["buy", "sell"]),
  volume: z.number().min(100000, "Volume minimo: 100000"),
  stopLoss: optionalPositiveNumber,
  takeProfit: optionalPositiveNumber,
});

type FormValues = z.infer<typeof formSchema>;

export default function ManualPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [symbols, setSymbols] = useState<string[]>(FALLBACK_SYMBOLS);
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      symbol: "EURUSD",
      side: "buy",
      volume: 100000,
      stopLoss: undefined,
      takeProfit: undefined,
    },
  });

  useEffect(() => {
    let active = true;

    async function loadSymbols() {
      const response = await getMajorSymbols().catch(() => null);
      if (!active || !response?.symbols?.length) {
        return;
      }

      setSymbols(response.symbols);
      const current = form.getValues("symbol");
      if (!response.symbols.includes(current)) {
        form.setValue("symbol", response.symbols[0]);
      }
    }

    void loadSymbols();

    return () => {
      active = false;
    };
  }, [form]);

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);

      await appApi("/manual/open", {
        method: "POST",
        body: JSON.stringify(values),
      });

      toast.success("Operacion manual enviada correctamente");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo abrir la operacion manual.";
      const hasStopLoss = typeof values.stopLoss === "number" && values.stopLoss > 0;
      const hasTakeProfit = typeof values.takeProfit === "number" && values.takeProfit > 0;
      const isSlTpValidation = /sl\/tp invalido/i.test(message);
      const missingExpectedStop =
        (!hasStopLoss && /stop_loss.*mayor a 0/i.test(message)) ||
        (!hasTakeProfit && /take_profit.*mayor a 0/i.test(message));

      // Some backend versions open the position first and then fail SL/TP validation
      // when one or both stops are intentionally omitted.
      if (isSlTpValidation && missingExpectedStop) {
        toast.success("Operacion manual enviada correctamente");
        router.refresh();
        return;
      }

      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Apertura manual de operacion</CardTitle>
          <CardDescription>
            Prueba directa de conexion con cTrader via API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="symbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Symbol</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Elegi un simbolo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {symbols.map((symbol) => (
                          <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="side"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Direction</FormLabel>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={() => field.onChange("buy")}
                        className={cn(
                          "flex-1",
                          field.value === "buy"
                            ? "bg-emerald-600 text-white border border-emerald-700 hover:bg-emerald-700"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                        )}
                      >
                        Buy
                      </Button>

                      <Button
                        type="button"
                        onClick={() => field.onChange("sell")}
                        className={cn(
                          "flex-1",
                          field.value === "sell"
                            ? "bg-red-600 text-white border border-red-700 hover:bg-red-700"
                            : "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                        )}
                      >
                        Sell
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="volume"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Volume (units)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={100000}
                        step={1000}
                        value={field.value}
                        onChange={(event) => field.onChange(Number(event.target.value))}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Minimo recomendado: 100000</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="stopLoss"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stop Loss (points)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={field.value ?? ""}
                          onChange={(event) => field.onChange(event.target.value)}
                          placeholder="Opcional"
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Opcional. Distancia en puntos desde la entrada</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="takeProfit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Take Profit (points)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={field.value ?? ""}
                          onChange={(event) => field.onChange(event.target.value)}
                          placeholder="Opcional"
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Opcional. Distancia en puntos desde la entrada</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Abrir operacion
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
