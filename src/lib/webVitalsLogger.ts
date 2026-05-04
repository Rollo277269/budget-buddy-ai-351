import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";
import { supabase } from "@/integrations/supabase/client";

// Persistent session id so we can correlate metrics from the same tab.
function getSessionId(): string {
  try {
    let id = sessionStorage.getItem("wv-session-id");
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem("wv-session-id", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

const sent = new Set<string>();

async function flush(metric: Metric) {
  // web-vitals can fire the same metric multiple times (e.g. LCP updates).
  // We keep the latest value but only insert once per metric per page load
  // when the value is finalized (delta === value on the last call).
  const key = `${metric.name}-${getSessionId()}-${location.pathname}`;
  if (sent.has(key)) return;
  sent.add(key);

  try {
    await supabase.from("web_vitals").insert({
      metric_name: metric.name,
      value: Number(metric.value.toFixed(3)),
      rating: metric.rating,
      pathname: location.pathname,
      session_id: getSessionId(),
      navigation_type: metric.navigationType ?? "",
      user_agent: navigator.userAgent.slice(0, 200),
    });
  } catch (e) {
    // Never break the app because of analytics.
    console.warn("[web-vitals] failed to log", metric.name, e);
  }
}

let started = false;

/** Register Web Vitals listeners. Safe to call once at app mount. */
export function startWebVitalsLogger() {
  if (started || typeof window === "undefined") return;
  started = true;

  // `reportAllChanges: false` means we only get the final value of each
  // metric (typically on hidden/pagehide), which is what we want to store.
  onCLS(flush);
  onFCP(flush);
  onINP(flush);
  onLCP(flush);
  onTTFB(flush);
}