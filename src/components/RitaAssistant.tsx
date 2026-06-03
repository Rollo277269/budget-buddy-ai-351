import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, X, Send, Loader2, Bot, User, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rita-chat`;

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface NavigateAction {
  path: string;
  params?: Record<string, string>;
}

function parseNavigateFromStream(fullText: string): NavigateAction | null {
  // Not used for streaming — tool calls come via delta.tool_calls
  return null;
}

export function RitaAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const handleNavigate = useCallback(
    (action: NavigateAction) => {
      const params = new URLSearchParams();
      if (action.params) {
        Object.entries(action.params).forEach(([k, v]) => {
          if (v) params.set(k, v);
        });
      }
      const qs = params.toString();
      navigate(qs ? `${action.path}?${qs}` : action.path);
    },
    [navigate]
  );

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const userMsg: Msg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    let assistantSoFar = "";
    let toolCallArgs = "";
    let hasToolCall = false;

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Errore di rete" }));
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠️ ${err.error || "Errore sconosciuto"}` },
        ]);
        setLoading(false);
        return;
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta;

            // Handle tool calls
            if (delta?.tool_calls) {
              hasToolCall = true;
              for (const tc of delta.tool_calls) {
                if (tc.function?.arguments) {
                  toolCallArgs += tc.function.arguments;
                }
              }
            }

            // Handle content
            const content = delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) =>
                    i === prev.length - 1 ? { ...m, content: assistantSoFar } : m
                  );
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Process tool call if present
      if (hasToolCall && toolCallArgs) {
        try {
          const action = JSON.parse(toolCallArgs) as NavigateAction;
          handleNavigate(action);
          
          // Add navigation message if no text response
          if (!assistantSoFar) {
            const pageName = getPageName(action.path);
            const filterDesc = action.params
              ? Object.entries(action.params)
                  .filter(([, v]) => v)
                  .map(([k, v]) => `**${k}**: ${v}`)
                  .join(", ")
              : "";
            const navMsg = `🔍 Ti ho aperto la sezione **${pageName}**${filterDesc ? ` con filtro ${filterDesc}` : ""}. Dai un'occhiata!`;
            setMessages((prev) => [...prev, { role: "assistant", content: navMsg }]);
          }
        } catch (e) {
          console.error("Failed to parse tool call:", e);
        }
      }

      // If no content and no tool call
      if (!assistantSoFar && !hasToolCall) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Non ho capito la richiesta. Puoi riformulare?" },
        ]);
      }
    } catch (e) {
      console.error("RITA error:", e);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Si è verificato un errore. Riprova tra poco." },
      ]);
    }

    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all flex items-center justify-center group"
        title="Chiedi a RITA"
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <div className="relative">
            <MessageCircle className="h-6 w-6" />
            <Sparkles className="h-3 w-3 absolute -top-1 -right-1 text-yellow-300 animate-pulse" />
          </div>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[400px] max-h-[600px] rounded-2xl border bg-card shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="bg-primary px-4 py-3 flex items-center gap-3 shrink-0">
            <div className="h-9 w-9 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-bold text-primary-foreground text-sm">RITA</h3>
              <p className="text-primary-foreground/70 text-[11px]">Assistente Virtuale</p>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[420px]">
            {messages.length === 0 && (
              <div className="text-center py-8 space-y-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Ciao! Sono RITA 👋</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Chiedimi informazioni su commesse, fatture, clienti, fornitori e altro.
                  </p>
                </div>
                <div className="space-y-1.5 pt-2">
                  {[
                    "Situazione del cliente Rossi",
                    "Fatture di acquisto 2024",
                    "Riepilogo commessa CIG...",
                    "Fatture in scadenza",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setInput(s);
                        inputRef.current?.focus();
                      }}
                      className="block w-full text-left text-xs px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                      💬 {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                    m.role === "user" ? "bg-secondary" : "bg-primary/10"
                  }`}
                >
                  {m.role === "user" ? (
                    <User className="h-3.5 w-3.5 text-secondary-foreground" />
                  ) : (
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  )}
                </div>
                <div
                  className={`rounded-2xl px-3.5 py-2 max-w-[85%] text-[13px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:m-0 [&_p]:leading-relaxed [&_strong]:text-foreground">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t p-3 shrink-0">
            <div className="flex gap-2 items-center">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Scrivi un messaggio..."
                className="flex-1 bg-muted rounded-xl px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-primary/30"
                disabled={loading}
              />
              <Button
                size="icon"
                className="h-10 w-10 rounded-xl shrink-0"
                title="Invia messaggio"
                onClick={send}
                disabled={!input.trim() || loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function getPageName(path: string): string {
  const map: Record<string, string> = {
     "/": "Rubrica",
    "/vendite": "Vendite",
    "/acquisti": "Acquisti",
    "/commesse": "Riepilogo CIG",
    "/lista-commesse": "Lista Commesse",
     "/offerte": "Gare",
    "/schede-contabili": "Schede Contabili",
    "/bilancio": "Bilancio",
    "/scadenzario": "Scadenzario",
    "/banche": "Banche",
    "/strumenti": "Strumenti",
  };
  return map[path] || path;
}
