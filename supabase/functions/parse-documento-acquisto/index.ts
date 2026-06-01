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
                    tipo_documento: { type: "string", description: "Tipologia del documento. Uno tra: 'Polizza', 'Bollo', 'ANAC', 'Fattura', 'Ricevuta', 'Nota Spese', 'Altro'. Usa 'Polizza' per polizze fideiussorie, polizze RC, polizze assicurative di qualunque tipo, INCLUSE ricevute/quietanze di pagamento di rate successive di una polizza (anche se intitolate 'Ricevuta' o 'Quietanza', se si riferiscono a una polizza assicurativa classifica come 'Polizza')." },
                    data_scadenza: { type: "string", description: "OBBLIGATORIO per polizze (incluse quietanze/ricevute di pagamento rate polizza): data di scadenza della copertura/rata in formato DD/MM/YYYY. Cerca SEMPRE diciture come 'Scadenza', 'Scade il', 'Valida fino al', 'Data scadenza', 'Fine copertura', 'Termine validità', 'Periodo di copertura ... al', 'Prossima scadenza', 'Scadenza rata', 'Copertura fino al'. Una stessa polizza può avere quietanze successive con scadenze diverse: estrai la scadenza specifica della rata/quietanza in oggetto. Stringa vuota SOLO se il documento non è una polizza o la scadenza è veramente assente." },
                    summary: { type: "string", description: "Riassunto del contenuto del documento in 1-2 frasi." },
                  },
                  required: ["descrizione", "importo", "data_documento", "numero", "fornitore", "centro_costo", "cig", "tipo_documento", "data_scadenza", "summary"],
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

    return new Response(JSON.stringify({ descrizione: "", importo: 0, data_documento: "", numero: "", fornitore: "", centro_costo: "", cig: "", tipo_documento: "", data_scadenza: "", summary: "" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("parse-documento error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Errore sconosciuto" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
