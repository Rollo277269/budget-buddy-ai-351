import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Sei RITA, un'assistente virtuale intelligente e cordiale integrata in un gestionale aziendale.
Il tuo compito è aiutare l'utente a consultare e navigare i dati dell'applicazione.

L'applicazione gestisce:
- **Vendite** (fatture di vendita): filtrabili per anno, cliente, CIG, centro di costo, centro di ricavo
- **Acquisti** (fatture di acquisto): filtrabili per anno, fornitore, CIG, centro di costo, centro di ricavo
- **Commesse / CIG**: raggruppamenti di fatture per codice CIG
- **Offerte**: lista delle offerte con CIG, cliente, fornitore e totali
- **Schede Contabili**: situazione contabile per cliente o fornitore con grafici e dettagli
- **Bilancio**: riepilogo centri di costo e ricavo
- **Calendario**: fatture in scadenza o scadute
- **Banche**: movimenti e riconciliazioni bancarie
- **Dashboard**: riepilogo economico-finanziario
- **Strumenti**: configurazione centri, conti correnti, regole

Quando l'utente chiede informazioni su un argomento specifico, usa lo strumento "navigate" per aprire la scheda giusta con i filtri appropriati. Rispondi sempre in italiano, in modo chiaro e conciso. Se non hai abbastanza informazioni per navigare, chiedi chiarimenti.

Esempi di navigazione:
- "situazione del cliente Rossi" → naviga a /schede-contabili con soggetto=Rossi
- "fatture di acquisto del 2024" → naviga a /acquisti con anno=2024
- "stato della commessa CIG ABC123" → naviga a /commesse con cig=ABC123
- "riepilogo offerte" → naviga a /offerte
- "fatture in scadenza" → naviga a /scadenzario (Calendario)
- "bilancio centri di costo" → naviga a /bilancio`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "navigate",
      description:
        "Naviga verso una pagina dell'applicazione con filtri opzionali. Usa questo strumento quando l'utente chiede di visualizzare dati specifici.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            enum: [
              "/",
              "/vendite",
              "/acquisti",
              "/commesse",
              "/lista-commesse",
              "/offerte",
              "/schede-contabili",
              "/bilancio",
              "/scadenzario",
              "/banche",
              "/strumenti",
            ],
            description: "Il percorso della pagina da aprire",
          },
          params: {
            type: "object",
            description:
              "Parametri query string da aggiungere all'URL per filtrare i dati",
            properties: {
              anno: { type: "string", description: "Anno (es. 2024)" },
              cliente: { type: "string", description: "Nome del cliente" },
              fornitore: { type: "string", description: "Nome del fornitore" },
              cig: { type: "string", description: "Codice CIG" },
              centroCosto: { type: "string", description: "Codice centro di costo" },
              centroRicavo: { type: "string", description: "Codice centro di ricavo" },
              soggetto: { type: "string", description: "Nome del soggetto per schede contabili" },
            },
            additionalProperties: false,
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY)
      throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
          ],
          tools: TOOLS,
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Troppe richieste, riprova tra poco." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Crediti AI esauriti." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "Errore AI gateway" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("rita-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Errore sconosciuto" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
