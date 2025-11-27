"use client";

import { appApi } from "@/lib/app-api";
import { BotCard } from "@/components/bots/bot-card";
import { useState } from "react";
import { useBots } from "@/hooks/useBots";
import { Button } from "@/components/ui/button";
import CreateBotModal from "@/components/bots/create-bot-modal";

export default function BotsPage() {
  const { bots, loading, error, refresh } = useBots();
  const [openCreate, setOpenCreate] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  async function startBot(botId: string) {
    try {
      setActingId(botId);
      await appApi(`/bots/${botId}/start`, { method: "POST" });
      await refresh();
    } finally {
      setActingId(null);
    }
  }

  async function stopBot(botId: string) {
    try {
      setActingId(botId);
      await appApi(`/bots/${botId}/stop`, { method: "POST" });
      await refresh();
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bots</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={refresh}>
            Refresh
          </Button>
          <Button onClick={() => setOpenCreate(true)}>Nuevo bot</Button>
        </div>
      </div>

      {/* estados */}
      {loading && <div>Cargando bots...</div>}
      {error && <div className="text-red-500">{error}</div>}

      {/* empty */}
      {!loading && bots.length === 0 && (
        <div className="rounded-lg border p-6 text-center text-muted-foreground">
          No hay bots creados todavía.
          <div className="mt-3">
            <Button onClick={() => setOpenCreate(true)}>
              Crear primer bot
            </Button>
          </div>
        </div>
      )}

      {!loading && bots.length > 0 && (
        <div className="flex flex-col gap-3">
          {bots.map((b) => (
            <BotCard
              key={b.id}
              bot={b}
              actingId={actingId}
              onStart={startBot}
              onStop={stopBot}
            />
          ))}
        </div>
      )}

      <CreateBotModal
        open={openCreate}
        onOpenChange={setOpenCreate}
        onCreated={async () => {
          await refresh();
        }}
      />
    </div>
  );
}
