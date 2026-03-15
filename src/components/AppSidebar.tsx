import { LayoutDashboard, CalendarClock, FileOutput, FileInput, Landmark, FolderKanban, Briefcase, Settings, Gavel, BookOpen, Scale } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  { title: "Cruscotto", url: "/", icon: LayoutDashboard },
  { title: "Scadenzario", url: "/scadenzario", icon: CalendarClock },
  { title: "Vendite", url: "/vendite", icon: FileOutput },
  { title: "Acquisti", url: "/acquisti", icon: FileInput },
  { title: "Schede Contabili", url: "/schede-contabili", icon: BookOpen },
  { title: "Bilancio", url: "/bilancio", icon: Scale },
  { title: "Banche", url: "/banche", icon: Landmark },
  { title: "Commesse", url: "/lista-commesse", icon: Briefcase },
  { title: "Gare", url: "/offerte", icon: Gavel },
  { title: "Riepiloghi per CIG", url: "/commesse", icon: FolderKanban },
  { title: "Strumenti", url: "/strumenti", icon: Settings },
];

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="pt-4">
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
