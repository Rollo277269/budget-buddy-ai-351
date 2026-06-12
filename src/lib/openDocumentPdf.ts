import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/** Best-effort bucket detection: `commesse/...` → documenti-commesse, else documenti-acquisto. */
function bucketsFor(storagePath: string): string[] {
  const isCommessePath = /^commesse\//i.test(storagePath);
  return isCommessePath
    ? ["documenti-commesse", "documenti-acquisto"]
    : ["documenti-acquisto", "documenti-commesse"];
}

/** Open the PDF in a new tab, trying both storage buckets transparently. */
export async function openDocumentPdf(storagePath: string): Promise<void> {
  if (!storagePath) {
    toast.error("Percorso file mancante");
    return;
  }
  for (const bucket of bucketsFor(storagePath)) {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, 60 * 10);
      if (!error && data?.signedUrl) {
        window.open(data.signedUrl, "_blank");
        return;
      }
    } catch {
      // try next bucket
    }
  }
  // Last-ditch fallback: try blob download from primary bucket
  for (const bucket of bucketsFor(storagePath)) {
    try {
      const { data: blob } = await supabase.storage.from(bucket).download(storagePath);
      if (blob) {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        return;
      }
    } catch {
      // try next
    }
  }
  toast.error("Errore apertura PDF");
}