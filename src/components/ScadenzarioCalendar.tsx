import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, AlertTriangle, Clock, Landmark } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CalendarEvent {
  tipo: "credito" | "debito" | "finanziamento" | "credito_fiscale";
  numero: string;
  soggetto: string;
  totale: number;
  scadenza: string;
  scadenzaDate: Date | null;
  stato: "scaduta" | "in_scadenza" | "regolare";
}

type ViewMode = "month" | "week" | "day";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MONTH_NAMES = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getMonday(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function EventDot({ event }: { event: CalendarEvent }) {
  const color = event.tipo === "credito"
    ? "bg-income"
    : event.tipo === "credito_fiscale"
      ? "bg-primary"
      : event.tipo === "finanziamento"
        ? "bg-accent-foreground"
        : "bg-expense";
  return (
    <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", color)} title={`${event.soggetto} — ${formatCurrency(event.totale)}`} />
  );
}

function EventCard({ event }: { event: CalendarEvent }) {
  const isOverdue = event.stato === "scaduta";
  const isWarning = event.stato === "in_scadenza";
  return (
    <div className={cn(
      "text-[10px] leading-tight px-1.5 py-1 rounded border truncate",
      isOverdue ? "bg-destructive/10 border-destructive/30 text-destructive" :
      isWarning ? "bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/30" :
      "bg-muted/50 border-border"
    )}>
      <div className="flex items-center gap-1">
        {(event.tipo === "finanziamento" || event.tipo === "credito_fiscale") && <Landmark className="h-2.5 w-2.5 shrink-0" />}
        {isOverdue && event.tipo !== "finanziamento" && event.tipo !== "credito_fiscale" && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
        {isWarning && event.tipo !== "finanziamento" && event.tipo !== "credito_fiscale" && !isOverdue && <Clock className="h-2.5 w-2.5 shrink-0" />}
        <span className="truncate font-medium">{event.soggetto}</span>
      </div>
      <span className={cn("font-mono", event.tipo === "credito" ? "text-income" : "text-expense")}>
        {formatCurrency(event.totale)}
      </span>
    </div>
  );
}

interface Props {
  events: CalendarEvent[];
}

export function ScadenzarioCalendar({ events }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((ev) => {
      if (!ev.scadenzaDate) return;
      const key = `${ev.scadenzaDate.getFullYear()}-${ev.scadenzaDate.getMonth()}-${ev.scadenzaDate.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    });
    return map;
  }, [events]);

  const getEventsForDay = (date: Date) => {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    return eventsByDate.get(key) || [];
  };

  const navigate = (dir: -1 | 1) => {
    const d = new Date(currentDate);
    if (viewMode === "month") d.setMonth(d.getMonth() + dir);
    else if (viewMode === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date());

  const title = useMemo(() => {
    if (viewMode === "month") return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    if (viewMode === "week") {
      const mon = getMonday(currentDate);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const fmtD = (d: Date) => `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
      return `${fmtD(mon)} — ${fmtD(sun)} ${sun.getFullYear()}`;
    }
    return `${currentDate.getDate()} ${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  }, [currentDate, viewMode]);

  // Month view
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;

    const days: { date: Date; inMonth: boolean }[] = [];
    // Fill leading days from prev month
    for (let i = startDay - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: d, inMonth: false });
    }
    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), inMonth: true });
    }
    // Trailing days
    while (days.length % 7 !== 0) {
      const last = days[days.length - 1].date;
      const d = new Date(last); d.setDate(d.getDate() + 1);
      days.push({ date: d, inMonth: false });
    }
    return days;
  }, [currentDate]);

  // Week view
  const weekDays = useMemo(() => {
    const mon = getMonday(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return d;
    });
  }, [currentDate]);

  const today = new Date();

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={goToday}>
              Oggi
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold ml-2">{title}</span>
          </div>
          <div className="flex rounded-md border overflow-hidden">
            {(["month", "week", "day"] as ViewMode[]).map((v) => (
              <Button
                key={v}
                variant={viewMode === v ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs rounded-none px-3"
                onClick={() => setViewMode(v)}
              >
                {{ month: "Mese", week: "Settimana", day: "Giorno" }[v]}
              </Button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-income" />Crediti</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-expense" />Debiti</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent-foreground" />Rate</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" />Cred. Fiscali</span>
          <span className="flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5 text-destructive" />Scadute</span>
          <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5 text-[hsl(var(--warning))]" />In scadenza</span>
        </div>

        {/* Month View */}
        {viewMode === "month" && (
          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-7 bg-muted/50">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1.5 border-b">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthDays.map(({ date, inMonth }, idx) => {
                const dayEvents = getEventsForDay(date);
                const isToday = sameDay(date, today);
                return (
                  <div
                    key={idx}
                    className={cn(
                      "min-h-[80px] p-1 border-b border-r text-[10px] transition-colors",
                      !inMonth && "bg-muted/20 text-muted-foreground/50",
                      isToday && "bg-primary/5"
                    )}
                  >
                    <div className={cn(
                      "text-right text-[11px] mb-0.5",
                      isToday && "font-bold text-primary"
                    )}>
                      {date.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((ev, i) => (
                        <EventCard key={i} event={ev} />
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-muted-foreground text-[9px] pl-1">+{dayEvents.length - 3} altre</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Week View */}
        {viewMode === "week" && (
          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-7 bg-muted/50">
              {weekDays.map((d, i) => (
                <div key={i} className={cn(
                  "text-center py-2 border-b",
                  sameDay(d, today) && "bg-primary/10"
                )}>
                  <div className="text-[10px] font-semibold text-muted-foreground">{WEEKDAYS[i]}</div>
                  <div className={cn("text-sm font-medium", sameDay(d, today) && "text-primary font-bold")}>{d.getDate()}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {weekDays.map((d, i) => {
                const dayEvents = getEventsForDay(d);
                return (
                  <div key={i} className={cn(
                    "min-h-[200px] p-1.5 border-r space-y-1",
                    sameDay(d, today) && "bg-primary/5"
                  )}>
                    {dayEvents.map((ev, j) => (
                      <EventCard key={j} event={ev} />
                    ))}
                    {dayEvents.length === 0 && (
                      <span className="text-[10px] text-muted-foreground/40 block text-center mt-8">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Day View */}
        {viewMode === "day" && (
          <div className="border rounded-md">
            <div className={cn("px-4 py-3 border-b bg-muted/30", sameDay(currentDate, today) && "bg-primary/5")}>
              <span className="text-sm font-semibold">
                {WEEKDAYS[(currentDate.getDay() + 6) % 7]} {currentDate.getDate()} {MONTH_NAMES[currentDate.getMonth()]}
              </span>
            </div>
            <div className="p-3 space-y-2">
              {getEventsForDay(currentDate).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nessuna scadenza per questa giornata</p>
              ) : (
                getEventsForDay(currentDate).map((ev, i) => (
                  <div key={i} className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    ev.stato === "scaduta" ? "bg-destructive/5 border-destructive/20" :
                    ev.stato === "in_scadenza" ? "bg-[hsl(var(--warning))]/5 border-[hsl(var(--warning))]/20" :
                    "bg-card"
                  )}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex flex-col items-center">
                        {ev.tipo === "credito_fiscale" ? (
                          <Badge className="bg-primary text-primary-foreground text-[10px]">Cred. Fiscale</Badge>
                        ) : ev.tipo === "finanziamento" ? (
                          <Badge className="bg-accent text-accent-foreground text-[10px]">Rata</Badge>
                        ) : (
                          <Badge variant={ev.tipo === "credito" ? "secondary" : "outline"} className="text-[10px]">
                            {ev.tipo === "credito" ? "Credito" : "Debito"}
                          </Badge>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{ev.soggetto}</p>
                        <p className="text-xs text-muted-foreground">{ev.numero}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn("text-sm font-mono font-semibold", ev.tipo === "credito" ? "text-income" : "text-expense")}>
                        {formatCurrency(ev.totale)}
                      </p>
                      {ev.stato === "scaduta" && <span className="text-[10px] text-destructive">Scaduta</span>}
                      {ev.stato === "in_scadenza" && <span className="text-[10px] text-[hsl(var(--warning))]">In scadenza</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
