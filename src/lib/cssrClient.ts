import { createClient } from "@supabase/supabase-js";

// CSSR Commesse project - publishable credentials (read-only access via RLS)
const CSSR_URL = "https://scqwswwmhhmzpnzhvidr.supabase.co";
const CSSR_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcXdzd3dtaGhtenBuemh2aWRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MDMyMDAsImV4cCI6MjA4Nzk3OTIwMH0.o9zKDLXzWbKk3y384lnA6dIOWnjIpDqNVjl-aYvjdDo";

export const cssrSupabase = createClient(CSSR_URL, CSSR_ANON_KEY);
