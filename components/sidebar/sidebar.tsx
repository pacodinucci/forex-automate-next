"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ChartCandlestick,
  Bot,
  ChartNetwork,
  TestTubeDiagonal,
  Spotlight,
} from "lucide-react";

import {
  Sidebar as UiSidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";

import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV_ITEMS = [
  { label: "Bots", href: "/bots", icon: Bot },
  { label: "Estrategias", href: "/strategies", icon: ChartNetwork },
  {
    label: "Manual",
    href: "/manual",
    icon: ChartCandlestick,
  },
  {
    label: "Backtesting",
    href: "/backtesting",
    icon: TestTubeDiagonal,
  },
  {
    label: "Spot Prices",
    href: "/spot",
    icon: Spotlight,
  },
];

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const user = session?.user;

  return (
    <UiSidebar variant="floating" className="p-2">
      <SidebarHeader className="px-3 py-3">
        <div className="rounded-xl border border-sidebar-border/60 bg-sidebar-accent/80 px-3 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/70">
            Workspace
          </p>
          <div className="mt-1 text-lg font-semibold tracking-tight text-sidebar-foreground">
            Forex <span className="text-sidebar-primary">Automate</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 pb-2">
        <Separator className="mb-2" />

        <SidebarMenu>
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  className={cn(
                    "justify-start rounded-xl border border-transparent px-3 py-2.5 text-sidebar-foreground/90",
                    active && "border-sidebar-primary/30 bg-sidebar-primary/20 text-sidebar-foreground"
                  )}
                >
                  <Link href={item.href}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="border-t px-3 py-3">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full">
              <div className="flex w-full items-center gap-3 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/75 px-2.5 py-2.5 transition-colors hover:bg-sidebar-accent">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {user.name?.[0]?.toUpperCase() ??
                      user.email?.[0]?.toUpperCase() ??
                      "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-medium leading-tight">
                    {user.name ?? user.email ?? "Usuario"}
                  </span>
                  {user.email && (
                    <span className="max-w-[160px] truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  )}
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Mi cuenta</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => router.push("/account")}>
                Perfil
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  await authClient.signOut();
                  router.push("/login");
                }}
              >
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            onClick={() => router.push("/login")}
            className="w-full rounded-xl border border-sidebar-border/70 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-sidebar-accent"
          >
            Iniciar sesión
          </button>
        )}
      </SidebarFooter>
    </UiSidebar>
  );
}
