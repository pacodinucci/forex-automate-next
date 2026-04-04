"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 px-3 py-2 backdrop-blur md:px-4">
      <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="text-foreground/80 hover:bg-muted/80" />
          <span className="premium-chip hidden sm:inline-flex">Trading Control Center</span>
        </div>
        <span className="premium-chip bg-accent/35 text-[11px] uppercase tracking-[0.08em]">
          Live Desk
        </span>
      </div>
    </header>
  );
}
