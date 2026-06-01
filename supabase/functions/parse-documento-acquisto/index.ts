import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, centri } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const centriCosto = (centri || []).filter((c: any) => c.tipo === "costo");
    const centriList = centriCosto.length > 0
      ? centriCosto.map((c: any) => `${c.codice}: ${c.descrizione}`).join("\n")
      : "Nessun centro di costo definito";

    const systemPrompt = `Sei un assistente contabile italiano. Analizza il testo estratto da un documento di acquisto (ricevuta, scontrino, fattura non elettronica, marca da bollo, ecc.) e estrai le informazioni principali.

${centriCosto.length > 0 ? `Centri di costo disponibili:\n${centriList}\n\nSuggerisci il centro di costo più appropriato basandoti sul contenuto del documento.` : "Non ci sono centri di costo definiti, lascia centro_costo vuoto."}

Rispondi SOLO con la funzione tool.`;

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
            { role: "system", content: systemPrompt },
            { role: "user", content: `Analizza questo documento:\n\n${text.substring(0, 4000)}` },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_document_info",
                description: "Estrai informazioni dal documento di acquisto",
                parameters: {
                  type: "object",
                  properties: {
                    descrizione: { type: "string", description: "Breve descrizione del documento (es. 'Acquisto marche da bollo', 'Canone affitto gennaio 2024')" },
                    importo: { type: "number", description: "Importo totale del documento. 0 se non trovato." },
                    data_documento: { type: "string", description: "Data del documento in formato DD/MM/YYYY. Stringa vuota se non trovata." },
                    numero: { type: "string", description: "Numero identificativo del documento (es. numero polizza, numero ricevuta, numero contratto). Stringa vuota se non trovato." },
                    fornitore: { type: "string", description: "Nome del fornitore o emittente. Stringa vuota se non trovato." },
                    centro_costo: { type: "string", description: "Codice del centro di costo suggerito. Stringa vuota se non determinabile." },
                    cig: { type: "string", description: "Codice CIG (Codice Identificativo di Gara) se presente nel documento. È un codice alfanumerico di esattamente 10 caratteri (lettere maiuscole e numeri). Cerca diciture come 'CIG', 'Codice CIG', 'C.I.G.'. Stringa vuota se non trovato o se non ha esattamente 10 caratteri." },
                    summary: { type: "string", description: "Riassunto del contenuto del documento in 1-2 frasi." },
                  },
                  required: ["descrizione", "importo", "data_documento", "numero", "fornitore", "centro_costo", "cig", "summary"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "extract_document_info" } },
        }),
      }
    );

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Errore gateway AI" }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ descrizione: "", importo: 0, data_documento: "", numero: "", fornitore: "", centro_costo: "", cig: "", summary: "" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("parse-documento error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Errore sconosciuto" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
