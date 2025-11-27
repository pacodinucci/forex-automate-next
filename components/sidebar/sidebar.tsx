"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChartCandlestick, Bot } from "lucide-react";

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

// 👇 shadcn ui extras para el user button
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
  { label: "Estrategias", href: "/strategies", icon: ChartCandlestick },
];

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  // ✅ sesión del usuario
  const { data: session } = authClient.useSession();
  const user = session?.user;

  return (
    <UiSidebar>
      {/* Título */}
      <SidebarHeader className="px-4 py-4">
        <div className="text-xl font-semibold tracking-tight">
          Forex <span className="font-bold">Automate</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {/* Separador entre título y menú */}
        <Separator className="mb-2" />

        {/* Menú */}
        <SidebarMenu>
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "justify-start",
                    active && "bg-muted text-foreground"
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

      {/* 👇 User Button en el footer */}
      <SidebarFooter className="border-t px-3 py-3">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full">
              <div className="flex w-full items-center gap-3 rounded-md px-2 py-2 hover:bg-muted">
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
                    <span className="text-xs text-muted-foreground truncate max-w-[160px]">
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
            className="w-full rounded-md px-3 py-2 text-sm font-medium hover:bg-muted text-left"
          >
            Iniciar sesión
          </button>
        )}
      </SidebarFooter>
    </UiSidebar>
  );
}
