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
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Campo 'text' mancante" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY non configurato");

    const systemPrompt = `Sei un assistente che analizza polizze assicurative italiane (fideiussorie, RC, cauzioni, ecc.) per estrarre la data di scadenza/validità.
Cerca diciture come: 'Scadenza', 'Valida fino al', 'Data scadenza', 'Fine copertura', 'Termine validità', 'Scade il', 'Periodo di validità'.
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
            { role: "user", content: `Analizza questo documento e individua se è una polizza e qual è la sua data di scadenza:\n\n${text.substring(0, 6000)}` },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_polizza_info",
                description: "Estrai tipo documento e scadenza",
                parameters: {
                  type: "object",
                  properties: {
                    is_polizza: { type: "boolean", description: "true se il documento è una polizza assicurativa di qualunque tipo." },
                    tipo_documento: { type: "string", description: "Etichetta del tipo: 'Polizza' se è una polizza, altrimenti 'Altro'." },
                    data_scadenza: { type: "string", description: "Data di scadenza in formato DD/MM/YYYY. Stringa vuota se non leggibile." },
                  },
                  required: ["is_polizza", "tipo_documento", "data_scadenza"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "extract_polizza_info" } },
        }),
      }
    );

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit superato." }),
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
    const parsed = toolCall?.function?.arguments
      ? JSON.parse(toolCall.function.arguments)
      : { is_polizza: false, tipo_documento: "", data_scadenza: "" };

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-polizza-scadenza error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Errore sconosciuto" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});