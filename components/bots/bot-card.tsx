"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Pause, Loader2, Info } from "lucide-react";
import { Bot } from "@/lib/types";

type BotCardProps = {
  bot: Bot;
  actingId: string | null;
  onStart: (id: string) => Promise<void> | void;
  onStop: (id: string) => Promise<void> | void;
};

export function BotCard({ bot, actingId, onStart, onStop }: BotCardProps) {
  const isActing = actingId === bot.id;
  const isRunning = bot.status === "RUNNING";

  console.log(bot);

  const createdLabel = new Date(bot.createdAt).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          {/* Izquierda: instrumento + punto de estado */}
          <div className="flex items-center gap-2">
            <span>{bot.instrument}</span>
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isRunning ? "bg-green-500" : "bg-red-500"
              }`}
              aria-label={isRunning ? "Running" : "Stopped"}
              title={isRunning ? "Running" : "Stopped"}
            />
          </div>

          {/* Derecha: botones */}
          <div className="flex items-center gap-2">
            {isRunning ? (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onStop(bot.id)}
                disabled={isActing}
              >
                {isActing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Pause className="h-6 w-6" />
                )}
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={() => onStart(bot.id)}
                disabled={isActing}
              >
                {isActing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Play className="h-6 w-6" />
                )}
              </Button>
            )}

            <Button size="icon" variant="secondary" asChild>
              <a href={`/bots/${bot.id}`}>
                <Info className="h-6 w-6" />
              </a>
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-wrap gap-6 text-xs py-1">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Trend TF:</span>
          <span>{bot.trendTimeframe}</span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Signal TF:</span>
          <span>{bot.signalTimeframe}</span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Creado:</span>
          <span>{createdLabel}</span>
        </div>
      </CardContent>
    </Card>
  );
}
