import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { text, centri, cig, namingRuleTypes } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const centriCosto = (centri || []).filter((c: any) => c.tipo === "costo");
    const centriList = centriCosto.length > 0
      ? centriCosto.map((c: any) => `${c.codice}: ${c.descrizione}`).join("\n")
      : "Nessun centro di costo definito";

    const ruleTypesList = Array.isArray(namingRuleTypes) && namingRuleTypes.length > 0
      ? namingRuleTypes.join(", ")
      : "Fattura Acquisto, Polizza, Bolli, ANAC, Ricevuta, Nota Spese, Altro";

    const systemPrompt = `Sei un assistente contabile italiano. Analizza il testo estratto da un documento PDF di spesa (ricevuta, scontrino, fattura, polizza, bolli, contributo ANAC, nota spese, ecc.) e estrai le informazioni principali per registrarlo come fattura di acquisto.

${centriCosto.length > 0 ? `Centri di costo disponibili:\n${centriList}\n\nSuggerisci il centro di costo più appropriato.` : ""}

Tipi di documento configurati nel sistema per la ridenominazione file: ${ruleTypesList}
Classifica il documento usando uno di questi tipi esatti se possibile, altrimenti usa "Altro".

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
            { role: "user", content: `Analizza questo documento di spesa per la commessa con CIG ${cig || "non specificato"}:\n\n${text.substring(0, 4000)}` },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_expense_info",
                description: "Estrai informazioni dal documento di spesa",
                parameters: {
                  type: "object",
                  properties: {
                    fornitore: { type: "string", description: "Nome del fornitore o emittente" },
                    descrizione: { type: "string", description: "Breve descrizione della spesa" },
                    importo_totale: { type: "number", description: "Importo totale IVA inclusa. 0 se non trovato." },
                    imponibile: { type: "number", description: "Imponibile senza IVA. Se non distinguibile, uguale al totale." },
                    imposta: { type: "number", description: "Importo IVA. 0 se non trovato o esente." },
                    data_documento: { type: "string", description: "Data del documento in formato DD/MM/YYYY. Vuoto se non trovata." },
                    centro_costo: { type: "string", description: "Codice del centro di costo suggerito. Vuoto se non determinabile." },
                    tipo_documento: { type: "string", description: `Tipo di documento. Usa uno dei tipi configurati: ${ruleTypesList}. Se nessuno corrisponde, usa "Altro".` },
                  },
                  required: ["fornitore", "descrizione", "importo_totale", "imponibile", "imposta", "data_documento", "centro_costo", "tipo_documento"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "extract_expense_info" } },
        }),
      }
    );

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit superato, riprova tra poco." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crediti AI esauriti." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "Errore gateway AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    let aiData: any = {};
    if (toolCall?.function?.arguments) {
      aiData = JSON.parse(toolCall.function.arguments);
    }

    return new Response(JSON.stringify(aiData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-spesa-commessa error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Errore sconosciuto" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
