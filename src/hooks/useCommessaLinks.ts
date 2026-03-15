import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ManualLink {
  invoiceKey: string; // "anno-numero"
  invoiceType: "vendita" | "acquisto";
  cig: string;
}

function loadLinksFromLocalStorage(): ManualLink[] {
  try {
    const raw = localStorage.getItem("commessa-manual-links");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function loadLinksFromDb(): Promise<ManualLink[]> {
  const { data, error } = await supabase
    .from("commessa_links" as any)
    .select("invoice_key, invoice_type, cig");
  if (error) { console.error("Error loading commessa links:", error); return []; }
  return (data as any[] || []).map((d: any) => ({
    invoiceKey: d.invoice_key,
    invoiceType: d.invoice_type as "vendita" | "acquisto",
    cig: d.cig,
  }));
}

async function migrateLocalStorageToDb(links: ManualLink[]) {
  if (links.length === 0) return;
  const rows = links.map(l => ({
    invoice_key: l.invoiceKey,
    invoice_type: l.invoiceType,
    cig: l.cig,
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    await supabase.from("commessa_links" as any).upsert(batch as any, { onConflict: "invoice_key,invoice_type,cig" });
  }
  localStorage.removeItem("commessa-manual-links");
  console.log(`[CommessaLinks] Migrated ${links.length} links from localStorage to DB`);
}

export function useCommessaLinks() {
  const [links, setLinks] = useState<ManualLink[]>([]);

  const refresh = useCallback(async () => {
    const dbLinks = await loadLinksFromDb();
    setLinks(dbLinks);
  }, []);

  useEffect(() => {
    (async () => {
      const lsLinks = loadLinksFromLocalStorage();
      if (lsLinks.length > 0) {
        await migrateLocalStorageToDb(lsLinks);
      }
      await refresh();
    })();
  }, [refresh]);

  const addLink = useCallback(async (link: ManualLink) => {
    const exists = links.some(
      (l) => l.invoiceKey === link.invoiceKey && l.invoiceType === link.invoiceType && l.cig === link.cig
    );
    if (exists) return;

    await supabase.from("commessa_links" as any).upsert({
      invoice_key: link.invoiceKey,
      invoice_type: link.invoiceType,
      cig: link.cig,
    } as any, { onConflict: "invoice_key,invoice_type,cig" });

    setLinks((prev) => [...prev, link]);
  }, [links]);

  const removeLink = useCallback(async (invoiceKey: string, invoiceType: "vendita" | "acquisto", cig: string) => {
    await supabase
      .from("commessa_links" as any)
      .delete()
      .eq("invoice_key", invoiceKey)
      .eq("invoice_type", invoiceType)
      .eq("cig", cig);

    setLinks((prev) => prev.filter(
      (l) => !(l.invoiceKey === invoiceKey && l.invoiceType === invoiceType && l.cig === cig)
    ));
  }, []);

  const getLinksForCig = useCallback(
    (cig: string) => links.filter((l) => l.cig === cig),
    [links]
  );

  return { links, addLink, removeLink, getLinksForCig };
}
