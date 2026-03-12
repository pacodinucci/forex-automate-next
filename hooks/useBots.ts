import { useEffect, useState } from "react";
import { getBots } from "@/lib/bots-api";
import type { Bot } from "@/lib/types";

export function useBots() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      const data = await getBots();
      setBots(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading bots");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return { bots, loading, error, refresh };
}
