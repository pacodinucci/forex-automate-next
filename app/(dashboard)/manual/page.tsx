"use client";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  instrument: z.string().min(1, "Elegí un instrumento"),
  side: z.enum(["long", "short"]),
});

type FormValues = z.infer<typeof formSchema>;

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function ManualPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      instrument: "GBP_USD",
      side: "long",
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);

      const res = await fetch(`${API_BASE}/manual/open`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        console.error("Error manual order:", errorData);

        toast.error(errorData?.detail ?? "Error al abrir la operación manual.");
        return;
      }

      const data = await res.json().catch(() => null);
      console.log("Manual order OK:", data);

      toast.success("Operación abierta correctamente ✅");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo conectar con la API.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Apertura manual de operación</CardTitle>
          <CardDescription>
            Abrí una operación directa contra la API (mercado actual).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Instrumento */}
              <FormField
                control={form.control}
                name="instrument"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instrumento</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Elegí un instrumento" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="GBP_USD">GBP_USD</SelectItem>
                        <SelectItem value="EUR_USD">EUR_USD</SelectItem>
                        <SelectItem value="USD_JPY">USD_JPY</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Dirección */}
              <FormField
                control={form.control}
                name="side"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirección</FormLabel>
                    <div className="flex gap-2">
                      {/* LONG */}
                      <Button
                        type="button"
                        onClick={() => field.onChange("long")}
                        className={cn(
                          "flex-1",
                          field.value === "long"
                            ? "bg-emerald-600 text-white border border-emerald-700 hover:bg-emerald-700"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                        )}
                      >
                        Long
                      </Button>

                      {/* SHORT */}
                      <Button
                        type="button"
                        onClick={() => field.onChange("short")}
                        className={cn(
                          "flex-1",
                          field.value === "short"
                            ? "bg-red-600 text-white border border-red-700 hover:bg-red-700"
                            : "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                        )}
                      >
                        Short
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Abrir operación
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
