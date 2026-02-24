import { useState, useCallback, useMemo } from "react";

const STORAGE_KEY = "commessa-manual-links";

export interface ManualLink {
  invoiceKey: string; // "anno-numero"
  invoiceType: "vendita" | "acquisto";
  cig: string;
}

function loadLinks(): ManualLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLinks(links: ManualLink[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

export function useCommessaLinks() {
  const [links, setLinks] = useState<ManualLink[]>(loadLinks);

  const addLink = useCallback((link: ManualLink) => {
    setLinks((prev) => {
      const exists = prev.some(
        (l) => l.invoiceKey === link.invoiceKey && l.invoiceType === link.invoiceType && l.cig === link.cig
      );
      if (exists) return prev;
      const next = [...prev, link];
      saveLinks(next);
      return next;
    });
  }, []);

  const removeLink = useCallback((invoiceKey: string, invoiceType: "vendita" | "acquisto", cig: string) => {
    setLinks((prev) => {
      const next = prev.filter(
        (l) => !(l.invoiceKey === invoiceKey && l.invoiceType === invoiceType && l.cig === cig)
      );
      saveLinks(next);
      return next;
    });
  }, []);

  const getLinksForCig = useCallback(
    (cig: string) => links.filter((l) => l.cig === cig),
    [links]
  );

  return { links, addLink, removeLink, getLinksForCig };
}
