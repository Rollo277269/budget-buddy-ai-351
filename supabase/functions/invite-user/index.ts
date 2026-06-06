import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "missing authorization" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "invalid session" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "forbidden: admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "invite") {
      const email = String(body.email || "").trim().toLowerCase();
      const role = (body.role === "admin" ? "admin" : "viewer") as "admin" | "viewer";
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: "email non valida" }, 400);
      }
      const redirectTo = body.redirectTo || undefined;
      const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
      });
      if (invErr) return json({ error: invErr.message }, 400);
      const newId = invited?.user?.id;
      if (newId) {
        await admin.from("user_roles").upsert(
          { user_id: newId, role },
          { onConflict: "user_id,role" },
        );
        // Se viewer, rimuovi eventuale admin di default
        if (role === "viewer") {
          await admin.from("user_roles").delete().eq("user_id", newId).eq("role", "admin");
        }
      }
      return json({ ok: true, user: invited?.user });
    }

    if (action === "list_users") {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
      if (listErr) return json({ error: listErr.message }, 400);
      const { data: roles } = await admin.from("user_roles").select("user_id, role");
      const rolesMap: Record<string, string[]> = {};
      (roles || []).forEach((r: any) => {
        rolesMap[r.user_id] = [...(rolesMap[r.user_id] || []), r.role];
      });
      const users = (list?.users || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        invited_at: u.invited_at,
        last_sign_in_at: u.last_sign_in_at,
        confirmed_at: u.confirmed_at || u.email_confirmed_at,
        roles: rolesMap[u.id] || [],
      }));
      return json({ users });
    }

    if (action === "set_role") {
      const userId = String(body.userId || "");
      const role = (body.role === "admin" ? "admin" : "viewer") as "admin" | "viewer";
      if (!userId) return json({ error: "userId required" }, 400);
      if (userId === userData.user.id && role !== "admin") {
        return json({ error: "non puoi rimuovere il tuo ruolo admin" }, 400);
      }
      // Cancella ruoli esistenti e imposta quello nuovo
      await admin.from("user_roles").delete().eq("user_id", userId);
      const { error } = await admin.from("user_roles").insert({ user_id: userId, role });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "delete_user") {
      const userId = String(body.userId || "");
      if (!userId) return json({ error: "userId required" }, 400);
      if (userId === userData.user.id) {
        return json({ error: "non puoi eliminare te stesso" }, 400);
      }
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "resend_invite") {
      const email = String(body.email || "").trim().toLowerCase();
      const redirectTo = body.redirectTo || undefined;
      const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "set_password") {
      const userId = String(body.userId || "");
      const password = String(body.password || "");
      if (!userId) return json({ error: "userId required" }, 400);
      if (password.length < 8) return json({ error: "password troppo corta (min 8)" }, 400);
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return json({ error: error.message }, 400);
      if (body.sendResetEmail) {
        await sendResetEmail(body.email, body.redirectTo);
      }
      return json({ ok: true });
    }

    if (action === "generate_password") {
      const userId = String(body.userId || "");
      if (!userId) return json({ error: "userId required" }, 400);
      const password = generatePassword(16);
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return json({ error: error.message }, 400);
      if (body.sendResetEmail) {
        await sendResetEmail(body.email, body.redirectTo);
      }
      return json({ ok: true, password });
    }

    if (action === "send_reset") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) return json({ error: "email required" }, 400);
      const redirectTo = body.redirectTo || undefined;
      const anon = createClient(SUPABASE_URL, ANON_KEY);
      const { error } = await anon.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generatePassword(len = 16): string {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%*";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

async function sendResetEmail(email: unknown, redirectTo: unknown) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return;
  try {
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    await anon.auth.resetPasswordForEmail(e, { redirectTo: redirectTo ? String(redirectTo) : undefined });
  } catch (_) { /* ignore */ }
}