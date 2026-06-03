import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, AlertTriangle, Clock, Landmark, ShieldCheck, ExternalLink, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";

export interface CalendarEvent {
  tipo: "credito" | "debito" | "finanziamento" | "credito_fiscale" | "polizza";
  numero: string;
  soggetto: string;
  totale: number;
  scadenza: string;
  scadenzaDate: Date | null;
  stato: "scaduta" | "in_scadenza" | "regolare";
  cig?: string;
  descrizione?: string;
  giorniRimasti?: number;
}

type ViewMode = "month" | "week" | "day";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MONTH_NAMES = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

const HOUR_START = 7;
const HOUR_END = 20;
const HOUR_HEIGHT = 40;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

function eventHour(ev: CalendarEvent): number {
  const d = ev.scadenzaDate;
  if (!d) return 9;
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return 9;
  return h + m / 60;
}

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
        : event.tipo === "polizza"
          ? "bg-[hsl(var(--warning))]"
          : "bg-expense";
  return (
    <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", color)} title={`${event.soggetto} — ${formatCurrency(event.totale)}`} />
  );
}

function EventCard({ event, onClick }: { event: CalendarEvent; onClick?: () => void }) {
  const isOverdue = event.stato === "scaduta";
  const isWarning = event.stato === "in_scadenza";
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={cn(
      "w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded border truncate cursor-pointer hover:ring-1 hover:ring-primary/40 hover:shadow-sm transition",
      isOverdue ? "bg-destructive/10 border-destructive/30 text-destructive" :
      isWarning ? "bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/30" :
      "bg-muted/50 border-border"
    )}>
      <div className="flex items-center gap-1">
        {(event.tipo === "finanziamento" || event.tipo === "credito_fiscale") && <Landmark className="h-2.5 w-2.5 shrink-0" />}
        {event.tipo === "polizza" && <ShieldCheck className="h-2.5 w-2.5 shrink-0" />}
        {isOverdue && event.tipo !== "finanziamento" && event.tipo !== "credito_fiscale" && event.tipo !== "polizza" && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
        {isWarning && event.tipo !== "finanziamento" && event.tipo !== "credito_fiscale" && event.tipo !== "polizza" && !isOverdue && <Clock className="h-2.5 w-2.5 shrink-0" />}
        <span className="truncate font-medium">{event.soggetto}</span>
      </div>
      <span className={cn("font-mono", event.tipo === "credito" ? "text-income" : event.tipo === "polizza" ? "text-[hsl(var(--warning))]" : "text-expense")}>
        {formatCurrency(event.totale)}
      </span>
    </button>
  );
}

interface Props {
  events: CalendarEvent[];
}

export function ScadenzarioCalendar({ events }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const router = useNavigate();

  const openEvent = (ev: CalendarEvent) => setSelected(ev);

  const goToDocument = (ev: CalendarEvent) => {
    if (ev.tipo === "credito") router("/vendite");
    else if (ev.tipo === "debito") router("/acquisti");
    else if (ev.tipo === "polizza") router("/polizze");
    else if (ev.tipo === "finanziamento" || ev.tipo === "credito_fiscale") router("/banche");
    setSelected(null);
  };

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

  const renderHourGutter = () => (
    <div className="border-r bg-muted/20">
      <div className="h-6 border-b" />
      {HOURS.map((h) => (
        <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b text-[9px] text-muted-foreground text-right pr-1 pt-0.5">
          {String(h).padStart(2, "0")}:00
        </div>
      ))}
    </div>
  );

  const renderDayColumn = (dayEvents: CalendarEvent[], highlight: boolean) => {
    const totalH = HOURS.length * HOUR_HEIGHT;
    return (
      <div className={cn("relative border-r", highlight && "bg-primary/5")} style={{ height: totalH }}>
        {HOURS.map((h, i) => (
          <div key={h} style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }} className="absolute left-0 right-0 border-b" />
        ))}
        {(() => {
          const buckets = new Map<number, CalendarEvent[]>();
          dayEvents.forEach((ev) => {
            const key = Math.floor(eventHour(ev));
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key)!.push(ev);
          });
          const nodes: JSX.Element[] = [];
          buckets.forEach((list, key) => {
            const top = (key - HOUR_START) * HOUR_HEIGHT;
            if (top < 0 || top > (HOURS.length - 1) * HOUR_HEIGHT + 8) return;
            nodes.push(
              <div key={key} className="absolute left-0.5 right-0.5 flex flex-col gap-0.5" style={{ top }}>
                {list.map((ev, i) => (
                  <EventCard key={i} event={ev} onClick={() => openEvent(ev)} />
                ))}
              </div>
            );
          });
          return nodes;
        })()}
      </div>
    );
  };

  return (
    <>
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
                        <EventCard key={i} event={ev} onClick={() => openEvent(ev)} />
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
            <div className="overflow-auto max-h-[600px]">
              <div className="grid" style={{ gridTemplateColumns: `40px repeat(7, minmax(0,1fr))` }}>
                <div className="bg-muted/50 border-b border-r h-6" />
                {weekDays.map((d, i) => (
                  <div key={`h-${i}`} className={cn(
                    "border-b border-r bg-muted/50 h-6 flex items-center justify-center gap-1",
                    sameDay(d, today) && "bg-primary/10"
                  )}>
                    <span className="text-[10px] font-semibold text-muted-foreground">{WEEKDAYS[i]}</span>
                    <span className={cn("text-[11px] font-medium", sameDay(d, today) && "text-primary font-bold")}>{d.getDate()}</span>
                  </div>
                ))}
                {renderHourGutter()}
                {weekDays.map((d, i) => (
                  <div key={`c-${i}`}>
                    {renderDayColumn(getEventsForDay(d), sameDay(d, today))}
                  </div>
                ))}
              </div>
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
            <div className="overflow-auto max-h-[600px]">
              <div className="grid" style={{ gridTemplateColumns: `48px 1fr` }}>
                {renderHourGutter()}
                <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                  {HOURS.map((h, i) => (
                    <div key={h} style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }} className="absolute left-0 right-0 border-b" />
                  ))}
                  {(() => {
                    const evs = getEventsForDay(currentDate);
                    const buckets = new Map<number, typeof evs>();
                    evs.forEach((ev) => {
                      const hour = eventHour(ev);
                      const key = Math.floor(hour);
                      if (!buckets.has(key)) buckets.set(key, [] as any);
                      buckets.get(key)!.push(ev);
                    });
                    const nodes: JSX.Element[] = [];
                    buckets.forEach((list, key) => {
                      const top = (key - HOUR_START) * HOUR_HEIGHT;
                      if (top < 0 || top > (HOURS.length - 1) * HOUR_HEIGHT + 8) return;
                      nodes.push(
                        <div key={key} className="absolute left-2 right-2 flex flex-col gap-1" style={{ top }}>
                          {list.map((ev, i) => {
                            const hour = eventHour(ev);
                            const hh = String(Math.floor(hour)).padStart(2, "0");
                            const mm = String(Math.round((hour % 1) * 60)).padStart(2, "0");
                            return (
                              <button
                                key={i}
                          type="button"
                          onClick={() => openEvent(ev)}
                          className={cn(
                          "flex items-center justify-between p-2 rounded-md border",
                          "w-full text-left hover:ring-1 hover:ring-primary/40 hover:shadow-sm transition",
                          ev.stato === "scaduta" ? "bg-destructive/5 border-destructive/20" :
                          ev.stato === "in_scadenza" ? "bg-[hsl(var(--warning))]/5 border-[hsl(var(--warning))]/20" :
                          "bg-card"
                        )}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-mono text-muted-foreground w-10 shrink-0">{hh}:{mm}</span>
                            {ev.tipo === "credito_fiscale" ? (
                              <Badge className="bg-primary text-primary-foreground text-[10px]">Cred. Fiscale</Badge>
                            ) : ev.tipo === "finanziamento" ? (
                              <Badge className="bg-accent text-accent-foreground text-[10px]">Rata</Badge>
                            ) : ev.tipo === "polizza" ? (
                              <Badge className="bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] text-[10px]">Polizza</Badge>
                            ) : (
                              <Badge variant={ev.tipo === "credito" ? "secondary" : "outline"} className="text-[10px]">
                                {ev.tipo === "credito" ? "Credito" : "Debito"}
                              </Badge>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{ev.soggetto}</p>
                              <p className="text-[10px] text-muted-foreground">{ev.numero}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className={cn("text-xs font-mono font-semibold", ev.tipo === "credito" ? "text-income" : ev.tipo === "polizza" ? "text-[hsl(var(--warning))]" : "text-expense")}>
                              {formatCurrency(ev.totale)}
                            </p>
                            {ev.stato === "scaduta" && <span className="text-[9px] text-destructive">Scaduta</span>}
                            {ev.stato === "in_scadenza" && <span className="text-[9px] text-[hsl(var(--warning))]">In scadenza</span>}
                          </div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    });
                    return nodes;
                  })()}
                  {getEventsForDay(currentDate).length === 0 && (
                    <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Nessuna scadenza per questa giornata</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
      <DialogContent className="sm:max-w-md">
        {selected && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {selected.soggetto}
              </DialogTitle>
              <DialogDescription>
                Dettaglio scadenza
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Tipo</span>
                <span className="font-medium">
                  {selected.tipo === "credito" && "Credito (fattura vendita)"}
                  {selected.tipo === "debito" && "Debito (fattura acquisto)"}
                  {selected.tipo === "finanziamento" && "Rata finanziamento"}
                  {selected.tipo === "credito_fiscale" && "Credito fiscale"}
                  {selected.tipo === "polizza" && "Polizza"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Numero / Riferimento</span>
                <span className="font-mono text-xs">{selected.numero}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Scadenza</span>
                <span className="font-medium">{selected.scadenza || "—"}</span>
              </div>
              {typeof selected.giorniRimasti === "number" && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Giorni</span>
                  <span className={cn(
                    "font-mono",
                    selected.giorniRimasti < 0 ? "text-destructive" :
                    selected.giorniRimasti <= 30 ? "text-[hsl(var(--warning))]" : "text-muted-foreground"
                  )}>
                    {selected.giorniRimasti < 0 ? `${Math.abs(selected.giorniRimasti)}g fa` : `tra ${selected.giorniRimasti}g`}
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Importo</span>
                <span className={cn(
                  "font-mono font-semibold",
                  selected.tipo === "credito" ? "text-income" :
                  selected.tipo === "polizza" ? "text-[hsl(var(--warning))]" : "text-expense"
                )}>
                  {formatCurrency(selected.totale)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Stato</span>
                {selected.stato === "scaduta" ? (
                  <Badge variant="destructive" className="text-[10px]"><AlertTriangle className="h-3 w-3 mr-1" />Scaduta</Badge>
                ) : selected.stato === "in_scadenza" ? (
                  <Badge className="bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] text-[10px]"><Clock className="h-3 w-3 mr-1" />In scadenza</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">Regolare</Badge>
                )}
              </div>
              {selected.cig && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">CIG</span>
                  <span className="font-mono text-xs">{selected.cig}</span>
                </div>
              )}
              {selected.descrizione && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Descrizione</p>
                  <p className="text-xs">{selected.descrizione}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Chiudi</Button>
              <Button size="sm" onClick={() => goToDocument(selected)}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Apri documento
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
