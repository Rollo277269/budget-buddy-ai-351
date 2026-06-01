import { useState, useEffect, useCallback } from "react";
import { LayoutDashboard, CalendarClock, FileOutput, FileInput, Landmark, FolderKanban, Briefcase, Settings, Gavel, BookOpen, Scale, GripVertical, Receipt, Users, PanelLeftClose, PanelLeft, Lock, Unlock, ShieldCheck } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { useLayoutEditMode } from "@/hooks/useLayoutEditMode";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ElementType;
}

export const defaultItems: MenuItem[] = [
  { title: "Cruscotto", url: "/", icon: LayoutDashboard },
  { title: "Scadenzario", url: "/scadenzario", icon: CalendarClock },
  { title: "Polizze", url: "/polizze", icon: ShieldCheck },
  { title: "Vendite", url: "/vendite", icon: FileOutput },
  { title: "Acquisti", url: "/acquisti", icon: FileInput },
  { title: "Schede Contabili", url: "/schede-contabili", icon: BookOpen },
  { title: "Rubrica", url: "/rubrica", icon: Users },
  { title: "Bilancio", url: "/bilancio", icon: Scale },
  { title: "IVA", url: "/iva", icon: Receipt },
  { title: "Conti", url: "/banche", icon: Landmark },
  { title: "Commesse", url: "/lista-commesse", icon: Briefcase },
  { title: "Gare", url: "/offerte", icon: Gavel },
  { title: "Riepiloghi per CIG", url: "/commesse", icon: FolderKanban },
  { title: "Strumenti", url: "/strumenti", icon: Settings },
];

const STORAGE_KEY = "sidebar-menu-order";

function loadOrder(): MenuItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultItems;
    const urls: string[] = JSON.parse(saved);
    const map = new Map(defaultItems.map((i) => [i.url, i]));
    const ordered = urls.map((u) => map.get(u)).filter(Boolean) as MenuItem[];
    // append any new items not in saved order
    defaultItems.forEach((i) => {
      if (!ordered.find((o) => o.url === i.url)) ordered.push(i);
    });
    return ordered;
  } catch {
    return defaultItems;
  }
}

function saveOrder(items: MenuItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.map((i) => i.url)));
}

export function AppSidebar({ locked, onToggleLock }: { locked: boolean; onToggleLock: () => void }) {
  const { state } = useSidebar();
  const [editLayout, , toggleEditLayout] = useLayoutEditMode();
  const collapsed = state === "collapsed";
  const [items, setItems] = useState<MenuItem[]>(loadOrder);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  useEffect(() => {
    saveOrder(items);
  }, [items]);

  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setOverIdx(idx);
  }, []);

  const handleDrop = useCallback((idx: number) => {
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIdx(null);
    setOverIdx(null);
  }, [dragIdx]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setOverIdx(null);
  }, []);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex flex-row items-center gap-1 px-2 pt-3 pb-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onToggleLock}
          title={locked ? "Sblocca menu laterale" : "Blocca menu laterale"}
        >
          {locked ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
        </Button>
        <Button
          variant={editLayout ? "default" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={toggleEditLayout}
          title={editLayout ? "Blocca layout (fine modifica)" : "Modifica layout: riordina pulsanti delle pagine"}
        >
          {editLayout ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item, idx) => (
                <SidebarMenuItem
                  key={item.url}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={handleDragEnd}
                  className={`transition-all ${
                    dragIdx === idx ? "opacity-40" : ""
                  } ${overIdx === idx && dragIdx !== idx ? "border-t-2 border-primary" : ""}`}
                >
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent group"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      {!collapsed && (
                        <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-grab" />
                      )}
                      <item.icon className={collapsed ? "h-7 w-7" : "h-4 w-4"} />
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
