import { useEffect, useState } from "react";
import { appApi } from "@/lib/app-api";
import type { Bot } from "@/lib/types";

export function useBots() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      const data = await appApi<Bot[]>("/bots");
      setBots(data);
    } catch (err: any) {
      setError(err?.message ?? "Error cargando bots");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return { bots, loading, error, refresh };
}
