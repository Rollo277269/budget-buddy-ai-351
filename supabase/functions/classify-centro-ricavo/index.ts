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
    // tipo: "costo" | "ricavo", tipoFattura: "vendita" | "acquisto"
    const { invoices, centri, tipo = "ricavo", tipoFattura = "vendita" } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const centriFiltrati = (centri || []).filter((c: any) => c.tipo === tipo);
    if (centriFiltrati.length === 0) {
      return new Response(
        JSON.stringify({ error: `Nessun centro di ${tipo} definito` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const centriList = centriFiltrati
      .map((c: any) => `${c.codice}: ${c.descrizione}`)
      .join("\n");

    const soggettoField = tipoFattura === "vendita" ? "cliente" : "fornitore";
    const soggettoLabel = tipoFattura === "vendita" ? "Cliente" : "Fornitore";

    const invoiceList = invoices
      .map(
        (inv: any) =>
          `ID:${inv.anno}-${inv.numero} | ${soggettoLabel}:${inv[soggettoField] || "N/A"} | Importo:${inv.totale} | Desc:${inv.descrizione || "N/A"} | CIG:${inv.cig || "N/A"}`
      )
      .join("\n");

    const systemPrompt = `Sei un assistente contabile. Devi classificare fatture di ${tipoFattura} assegnando a ciascuna un centro di ${tipo}.

Centri di ${tipo} disponibili:
${centriList}

Per ogni fattura, rispondi SOLO con il codice del centro di ${tipo} più appropriato basandoti su ${soggettoLabel.toLowerCase()}, descrizione, importo e CIG.
Se non riesci a determinare il centro, rispondi con "N/A".`;

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
            {
              role: "user",
              content: `Classifica queste fatture.\n\n${invoiceList}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "classify_invoices",
                description: `Classifica le fatture assegnando un centro di ${tipo} a ciascuna`,
                parameters: {
                  type: "object",
                  properties: {
                    classifications: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", description: "ID fattura nel formato anno-numero" },
                          codice: { type: "string", description: `Codice del centro di ${tipo} assegnato, o N/A` },
                        },
                        required: ["id", "codice"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["classifications"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "classify_invoices" } },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite richieste superato, riprova tra poco." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crediti AI esauriti." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Errore gateway AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ classifications: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("classify error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Errore sconosciuto" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
