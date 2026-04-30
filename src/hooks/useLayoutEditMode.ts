import { useEffect, useState, useCallback } from "react";

/**
 * Global "edit layout" toggle shared between the sidebar header button and
 * every ReorderableToolbar instance. State is in-memory only; pages remember
 * their custom order in localStorage (handled by ReorderableToolbar itself).
 */
const EVENT_NAME = "layout-edit-mode-change";
let current = false;

export function setLayoutEditMode(value: boolean) {
  current = value;
  // eslint-disable-next-line no-console
  console.log(
    `%c[LayoutEditMode] ${value ? "ON 🔓 — drag attivo" : "OFF 🔒 — drag disattivato"}`,
    `color: ${value ? "#16a34a" : "#dc2626"}; font-weight: bold;`,
  );
  window.dispatchEvent(new CustomEvent<boolean>(EVENT_NAME, { detail: value }));
}

export function getLayoutEditMode() {
  return current;
}

export function useLayoutEditMode(): [boolean, (v: boolean) => void, () => void] {
  const [value, setValue] = useState<boolean>(current);

  useEffect(() => {
    const handler = (e: Event) => setValue((e as CustomEvent<boolean>).detail);
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  const set = useCallback((v: boolean) => setLayoutEditMode(v), []);
  const toggle = useCallback(() => setLayoutEditMode(!current), []);

  return [value, set, toggle];
}