import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

type OverridesMap = Record<string, string>;

interface Ctx {
  overrides: OverridesMap;
  setLocal: (key: string, value: string) => void;
  loaded: boolean;
}

const TextOverridesContext = createContext<Ctx>({ overrides: {}, setLocal: () => {}, loaded: false });

export function TextOverridesProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<OverridesMap>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("ui_text_overrides" as any).select("key,value");
      if (cancelled) return;
      if (!error && data) {
        const map: OverridesMap = {};
        for (const r of data as any[]) map[r.key] = r.value;
        setOverrides(map);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const setLocal = useCallback((key: string, value: string) => {
    setOverrides((prev) => ({ ...prev, [key]: value }));
  }, []);

  const value = useMemo(() => ({ overrides, setLocal, loaded }), [overrides, setLocal, loaded]);
  return <TextOverridesContext.Provider value={value}>{children}</TextOverridesContext.Provider>;
}

export function useTextOverride(key: string, defaultValue: string) {
  const { overrides } = useContext(TextOverridesContext);
  return overrides[key] ?? defaultValue;
}

interface EditableTextProps {
  /** Stable unique key identifying this text in the DB. */
  textKey: string;
  /** Default/original text shown when no override exists. */
  children: string;
  as?: ElementType;
  className?: string;
  /** Allow multi-line editing (textarea instead of input). */
  multiline?: boolean;
  /** Max length applied to the input. */
  maxLength?: number;
}

/**
 * Renders a text element. Admin users can double-click to edit it inline;
 * value is persisted in `ui_text_overrides` and shown to everyone.
 */
export function EditableText({
  textKey,
  children,
  as: Tag = "span",
  className,
  multiline = false,
  maxLength = 500,
}: EditableTextProps) {
  const { isAdmin } = useUserRole();
  const { overrides, setLocal } = useContext(TextOverridesContext);
  const current = overrides[textKey] ?? children;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select?.();
    }
  }, [editing]);

  const start = () => {
    if (!isAdmin) return;
    setDraft(current);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(current);
  };

  const save = async () => {
    const trimmed = draft.trim().slice(0, maxLength);
    if (trimmed === current) { setEditing(false); return; }
    setSaving(true);
    const { error } = await supabase
      .from("ui_text_overrides" as any)
      .upsert({ key: textKey, value: trimmed }, { onConflict: "key" });
    setSaving(false);
    if (error) {
      toast.error("Salvataggio non riuscito: " + error.message);
      return;
    }
    setLocal(textKey, trimmed);
    setEditing(false);
    toast.success("Testo aggiornato");
  };

  if (editing) {
    const common = {
      ref: inputRef as any,
      value: draft,
      onChange: (e: any) => setDraft(e.target.value),
      onBlur: save,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
        else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
      },
      disabled: saving,
      maxLength,
      className: (className ? className + " " : "") + "outline-none ring-2 ring-primary/50 rounded px-1 bg-background min-w-[2ch]",
    };
    return multiline ? <textarea rows={2} {...common} /> : <input type="text" {...common} />;
  }

  return (
    <Tag
      className={
        (className ? className + " " : "") +
        (isAdmin ? "group/edit relative cursor-text hover:bg-primary/5 hover:ring-1 hover:ring-primary/30 rounded transition-colors" : "")
      }
      onDoubleClick={start}
      title={isAdmin ? "Doppio clic per modificare" : undefined}
    >
      {current}
      {isAdmin && (
        <Pencil className="inline-block ml-1 h-3 w-3 opacity-0 group-hover/edit:opacity-60 align-baseline" />
      )}
    </Tag>
  );
}
