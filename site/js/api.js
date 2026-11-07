// Talks to the Cloudflare Worker that stores your chats (messages, reactions, stars, schedule, shared list).
// Files, login and realtime pings stay on Supabase.
import { API_URL } from "./config.js";
import { supabase } from "./supabase.js";

export async function api(method, path, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  const res = await fetch(API_URL.replace(/\/+$/, "") + path, {
    method,
    headers: { Authorization: "Bearer " + session.access_token, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) { const e = new Error((data && data.error) || "Request failed (" + res.status + ")"); e.status = res.status; throw e; }
  return data;
}
/** True when the request never reached the server (offline, blocked, wrong URL). */
export const isNetworkError = (e) => !navigator.onLine || e instanceof TypeError || (e && e.status === undefined);
