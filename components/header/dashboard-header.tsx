"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";

export function DashboardHeader() {
  return (
    <header className="h-14 px-4 flex items-center bg-background">
      <SidebarTrigger />
    </header>
  );
}
