import { SidebarProvider } from "@/components/ui/sidebar";
import { Sidebar } from "@/components/sidebar/sidebar";
import { DashboardHeader } from "@/components/header/dashboard-header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="min-h-screen w-full flex bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <DashboardHeader />
          <main className="flex-1 p-6 bg-stone-100">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
