// Private Chat API on Cloudflare Workers + D1.
// Chats (messages, reactions, stars, scheduled messages, shared list) live in D1.
// Login, media files (Storage), realtime pings and push still use your Supabase project.
//
// Bindings / variables (Worker > Settings):
//   DB                         D1 database binding
//   SUPABASE_URL               https://<ref>.supabase.co
//   SUPABASE_ANON_KEY          public anon key
//   SUPABASE_SERVICE_ROLE_KEY  SECRET
//   PUSH_SECRET                SECRET (same value as push_config.webhook_secret in Supabase)
//   CONVERSATION_ID            11111111-1111-4111-8111-111111111111
//   ALLOWED_ORIGINS            comma list, e.g. https://your-site.vercel.app
const ALLOWED_EMAILS = ["stacy@chat.local", "symoh@chat.local"];
const KINDS = ["text", "voice", "file", "sticker", "call"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_MAX = 500;

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const nowIso = () => new Date().toISOString();
const isUuid = (v) => typeof v === "string" && UUID.test(v);
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...extra } });

/* ---------- CORS ---------- */
function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const list = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = list.includes("*") || list.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin || "*" : list[0] || "",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Access-Control-Max-Age": "86400", Vary: "Origin",
  };
}

/* ---------- auth: verify the Supabase access token ---------- */
const tokenCache = new Map();
async function authUser(req, env) {
  const h = req.headers.get("Authorization") || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!tok) throw new HttpError(401, "Not signed in");
  const hit = tokenCache.get(tok);
  if (hit && hit.exp > Date.now()) return hit.user;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${tok}` } });
  if (!res.ok) throw new HttpError(401, "Session expired. Sign in again.");
  const u = await res.json();
  const email = String(u.email || "").toLowerCase();
  if (!ALLOWED_EMAILS.includes(email)) throw new HttpError(403, "Not allowed");
  const user = { id: u.id, email };
  if (tokenCache.size > 50) tokenCache.clear();
  tokenCache.set(tok, { user, exp: Date.now() + 60000 });
  return user;
}

/* ---------- Supabase helpers (service role) ---------- */
const srvHeaders = (env, extra = {}) => ({ apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...extra });
let disappearCache = { v: null, exp: 0 };
async function getDisappear(env) {
  if (disappearCache.exp > Date.now()) return disappearCache.v;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/conversations?id=eq.${env.CONVERSATION_ID}&select=disappear_seconds`, { headers: srvHeaders(env) });
    const rows = r.ok ? await r.json() : [];
    disappearCache = { v: rows[0]?.disappear_seconds ?? null, exp: Date.now() + 20000 };
  } catch { disappearCache.exp = Date.now() + 5000; }
  return disappearCache.v;
}
async function removeFiles(env, paths) {
  const list = [...new Set(paths.filter(Boolean))];
  for (let i = 0; i < list.length; i += 100) {
    try {
      await fetch(`${env.SUPABASE_URL}/storage/v1/object/chat-media`, {
        method: "DELETE", headers: srvHeaders(env, { "Content-Type": "application/json" }), body: JSON.stringify({ prefixes: list.slice(i, i + 100) }),
      });
    } catch {}
  }
}
const broadcast = (env, payload) =>
  fetch(`${env.SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: "POST", headers: srvHeaders(env, { "Content-Type": "application/json" }),
    body: JSON.stringify({ messages: [{ topic: `room:${env.CONVERSATION_ID}`, event: "data", payload, private: false }] }),
  }).catch(() => {});
const pushNotify = (env, row) =>
  fetch(`${env.SUPABASE_URL}/functions/v1/send-push`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-push-secret": env.PUSH_SECRET || "" },
    body: JSON.stringify({ direct: { sender_id: row.sender_id, conversation_id: row.conversation_id, kind: row.kind, content: row.content, media_path: row.media_path, view_once: row.view_once } }),
  }).catch(() => {});

/* ---------- row mapping ---------- */
function toRow(r) {
  if (!r) return null;
  let wf = null; try { wf = r.waveform ? JSON.parse(r.waveform) : null; } catch {}
  return { ...r, pinned: !!r.pinned, view_once: !!r.view_once, waveform: wf };
}
const alive = "(expires_at IS NULL OR expires_at > ?)";
async function getMessage(env, id) {
  return toRow(await env.DB.prepare("SELECT * FROM messages WHERE id = ? AND conversation_id = ?").bind(id, env.CONVERSATION_ID).first());
}
const needMessage = async (env, id) => { if (!isUuid(id)) throw new HttpError(400, "Bad id"); const m = await getMessage(env, id); if (!m) throw new HttpError(404, "Message not found"); return m; };

/* ---------- one-time import of your existing chats from Supabase ---------- */
let importedFlag = false;
async function ensureImported(env) {
  if (importedFlag) return;
  const done = await env.DB.prepare("SELECT value FROM meta WHERE key = 'legacy_imported'").first();
  if (done) { importedFlag = true; return; }
  const get = async (path) => {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: srvHeaders(env, { Range: `${from}-${from + 999}`, "Range-Unit": "items" }) });
      if (!r.ok) throw new Error(`Supabase ${path}: ${r.status}`);
      const page = await r.json(); all.push(...page); if (page.length < 1000) break;
    }
    return all;
  };
  const iso = (t) => (t ? new Date(t).toISOString() : null);
  const [msgs, rx, stars, sched, shared] = await Promise.all([
    get("messages?select=*&order=created_at.asc"), get("message_reactions?select=*"), get("message_stars?select=*"),
    get("scheduled_messages?select=*"), get("shared_items?select=*"),
  ]);
  const st = [];
  for (const m of msgs) {
    st.push(env.DB.prepare("INSERT OR IGNORE INTO messages (id,conversation_id,sender_id,kind,content,media_path,thumb_path,media_duration,waveform,reply_to,pinned,view_once,viewed_at,view_closed_at,delivered_at,read_at,edited_at,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(m.id, m.conversation_id, m.sender_id, m.kind, m.content, m.media_path, m.thumb_path ?? null, m.media_duration ?? null, m.waveform ? JSON.stringify(m.waveform) : null, m.reply_to ?? null,
        m.pinned ? 1 : 0, m.view_once ? 1 : 0, iso(m.viewed_at), iso(m.view_closed_at), iso(m.delivered_at), iso(m.read_at), iso(m.edited_at), iso(m.expires_at), iso(m.created_at)));
  }
  for (const r of rx) st.push(env.DB.prepare("INSERT OR IGNORE INTO message_reactions (message_id,user_id,emoji,created_at) VALUES (?,?,?,?)").bind(r.message_id, r.user_id, r.emoji, iso(r.created_at)));
  for (const s of stars) st.push(env.DB.prepare("INSERT OR IGNORE INTO message_stars (message_id,user_id,created_at) VALUES (?,?,?)").bind(s.message_id, s.user_id, iso(s.created_at)));
  for (const s of sched) st.push(env.DB.prepare("INSERT OR IGNORE INTO scheduled_messages (id,conversation_id,sender_id,content,send_at,created_at) VALUES (?,?,?,?,?,?)").bind(s.id, s.conversation_id, s.sender_id, s.content, iso(s.send_at), iso(s.created_at)));
  for (const s of shared) st.push(env.DB.prepare("INSERT OR IGNORE INTO shared_items (id,conversation_id,kind,title,done,target_at,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(s.id, s.conversation_id, s.kind, s.title, s.done ? 1 : 0, iso(s.target_at), s.created_by, iso(s.created_at)));
  for (let i = 0; i < st.length; i += 50) await env.DB.batch(st.slice(i, i + 50));
  await env.DB.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('legacy_imported', ?)").bind(nowIso()).run();
  importedFlag = true;
}

/* ---------- expiry + scheduled + orphan sweep ---------- */
async function purgeExpired(env) {
  const now = nowIso();
  const { results } = await env.DB.prepare("SELECT id, media_path, thumb_path FROM messages WHERE conversation_id = ? AND expires_at IS NOT NULL AND expires_at <= ? LIMIT 200").bind(env.CONVERSATION_ID, now).all();
  if (!results.length) return 0;
  await env.DB.batch(results.map((r) => env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(r.id)));
  await removeFiles(env, results.flatMap((r) => [r.media_path, r.thumb_path]));
  await Promise.all(results.slice(0, 50).map((r) => broadcast(env, { t: "del", id: r.id })));
  return results.length;
}
async function createMessage(env, ctx, user, b) {
  const conv = env.CONVERSATION_ID, id = isUuid(b.id) ? b.id.toLowerCase() : crypto.randomUUID();
  const kind = KINDS.includes(b.kind) ? b.kind : "text";
  const content = typeof b.content === "string" && b.content.length ? b.content.slice(0, 4000) : null;
  const prefix = `${conv}/${user.id}/`;
  const path = (p) => { if (p == null) return null; if (typeof p !== "string" || !p.startsWith(prefix) || p.length > 300) throw new HttpError(400, "Bad file path"); return p; };
  const media = path(b.media_path), thumb = path(b.thumb_path);
  if (content === null && !media) throw new HttpError(400, "Empty message");
  const dur = Number.isInteger(b.media_duration) && b.media_duration >= 0 && b.media_duration < 36e5 ? b.media_duration : null;
  const wave = Array.isArray(b.waveform) && b.waveform.length <= 64 && b.waveform.every((n) => Number.isInteger(n) && n >= 0 && n <= 100) ? JSON.stringify(b.waveform) : null;
  let reply = null;
  if (isUuid(b.reply_to)) reply = (await env.DB.prepare("SELECT id FROM messages WHERE id = ? AND conversation_id = ?").bind(b.reply_to, conv).first())?.id ?? null;
  const once = b.view_once === true && kind === "file" && media ? 1 : 0;
  const secs = await getDisappear(env), created = new Date();
  const expires = secs ? new Date(created.getTime() + secs * 1000).toISOString() : null;
  const res = await env.DB.prepare("INSERT OR IGNORE INTO messages (id,conversation_id,sender_id,kind,content,media_path,thumb_path,media_duration,waveform,reply_to,view_once,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, conv, user.id, kind, content, media, thumb, dur, wave, reply, once, expires, created.toISOString()).run();
  const row = await getMessage(env, id);
  if (!row || row.sender_id !== user.id) throw new HttpError(409, "Conflict");
  if (res.meta.changes > 0) ctx.waitUntil(Promise.all([broadcast(env, { t: "msg", row }), pushNotify(env, row)]));
  return row;
}
async function sendDueScheduled(env, ctx) {
  const { results } = await env.DB.prepare("SELECT * FROM scheduled_messages WHERE send_at <= ? ORDER BY send_at LIMIT 50").bind(nowIso()).all();
  for (const s of results) {
    const del = await env.DB.prepare("DELETE FROM scheduled_messages WHERE id = ?").bind(s.id).run();
    if (del.meta.changes > 0) await createMessage(env, ctx, { id: s.sender_id }, { kind: "text", content: s.content });
  }
  return results.length;
}
async function listStorage(env) {
  const list = async (prefix) => {
    const out = [];
    for (let offset = 0; ; offset += 100) {
      const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/chat-media`, { method: "POST", headers: srvHeaders(env, { "Content-Type": "application/json" }), body: JSON.stringify({ prefix, limit: 100, offset }) });
      if (!r.ok) throw new Error("storage list failed");
      const page = await r.json(); out.push(...page); if (page.length < 100) break;
    }
    return out;
  };
  const files = [];
  const walk = async (prefix, depth) => {
    for (const e of await list(prefix)) {
      const full = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id) files.push({ name: full, created_at: e.created_at }); else if (depth < 3) await walk(full, depth + 1);
    }
  };
  await walk("", 0);
  return files;
}
/** Deletes files in Storage that no message points to (older than 1 hour). Has safety guards. */
async function sweepOrphans(env) {
  const ready = await env.DB.prepare("SELECT value FROM meta WHERE key = 'legacy_imported'").first();
  if (!ready) return { skipped: "not imported yet" };
  const { results } = await env.DB.prepare("SELECT media_path, thumb_path FROM messages WHERE media_path IS NOT NULL OR thumb_path IS NOT NULL").all();
  const used = new Set(results.flatMap((r) => [r.media_path, r.thumb_path]).filter(Boolean));
  const files = await listStorage(env), cutoff = Date.now() - 3600e3;
  const orphans = files.filter((f) => !used.has(f.name) && new Date(f.created_at).getTime() < cutoff).map((f) => f.name);
  if (files.length > 10 && orphans.length > files.length / 2) return { skipped: "too many orphans, refusing to delete", files: files.length, orphans: orphans.length };
  await removeFiles(env, orphans);
  return { removed: orphans.length };
}

/* ---------- routes ---------- */
async function route(req, env, ctx, user) {
  const url = new URL(req.url), p = url.pathname.replace(/\/+$/, ""), m = req.method, conv = env.CONVERSATION_ID;
  const body = async () => { try { return await req.json(); } catch { throw new HttpError(400, "Bad JSON"); } };
  const limitOf = (d) => Math.min(PAGE_MAX, Math.max(1, parseInt(url.searchParams.get("limit") || d, 10) || d));
  let x;

  if (p === "/api/sync" && m === "GET") {
    await ensureImported(env);
    ctx.waitUntil(purgeExpired(env));
    const now = nowIso(), limit = limitOf(50);
    const [msgs, rx, stars, pins] = await Promise.all([
      env.DB.prepare(`SELECT * FROM messages WHERE conversation_id = ? AND ${alive} ORDER BY created_at DESC LIMIT ?`).bind(conv, now, limit).all(),
      env.DB.prepare("SELECT r.message_id, r.user_id, r.emoji FROM message_reactions r JOIN messages m ON m.id = r.message_id WHERE m.conversation_id = ?").bind(conv).all(),
      env.DB.prepare("SELECT message_id FROM message_stars WHERE user_id = ?").bind(user.id).all(),
      env.DB.prepare(`SELECT * FROM messages WHERE conversation_id = ? AND pinned = 1 AND ${alive}`).bind(conv, now).all(),
    ]);
    return json({ messages: msgs.results.reverse().map(toRow), hasMore: msgs.results.length === limit, reactions: rx.results, stars: stars.results.map((s) => s.message_id), pins: pins.results.map(toRow), serverNow: now });
  }
  if (p === "/api/messages" && m === "GET") {
    const before = url.searchParams.get("before") || "9999", now = nowIso(), limit = limitOf(50);
    const { results } = await env.DB.prepare(`SELECT * FROM messages WHERE conversation_id = ? AND created_at < ? AND ${alive} ORDER BY created_at DESC LIMIT ?`).bind(conv, before, now, limit).all();
    return json({ messages: results.map(toRow), hasMore: results.length === limit });
  }
  if (p === "/api/search" && m === "GET") {
    const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
    if (q.length < 2) return json({ messages: [] });
    const { results } = await env.DB.prepare(`SELECT * FROM messages WHERE conversation_id = ? AND kind != 'call' AND content LIKE ? ESCAPE '\\' AND ${alive} ORDER BY created_at DESC LIMIT 40`).bind(conv, `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`, nowIso()).all();
    return json({ messages: results.map(toRow) });
  }
  if (p === "/api/byids" && m === "GET") {
    const ids = (url.searchParams.get("ids") || "").split(",").filter(isUuid).slice(0, 100);
    if (!ids.length) return json({ messages: [] });
    const { results } = await env.DB.prepare(`SELECT * FROM messages WHERE conversation_id = ? AND id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at DESC`).bind(conv, ...ids).all();
    return json({ messages: results.map(toRow) });
  }
  if (p === "/api/messages" && m === "POST") return json({ message: await createMessage(env, ctx, user, await body()) }, 201);

  if ((x = p.match(/^\/api\/messages\/([^/]+)$/))) {
    const msg = await needMessage(env, x[1]);
    if (m === "PATCH") {
      const b = await body(), now = nowIso();
      if ("content" in b) {
        const text = typeof b.content === "string" ? b.content.trim().slice(0, 4000) : "";
        if (msg.sender_id !== user.id || msg.kind !== "text" || !text) throw new HttpError(403, "You can only edit your own text messages");
        await env.DB.prepare("UPDATE messages SET content = ?, edited_at = ? WHERE id = ?").bind(text, now, msg.id).run();
      }
      if ("pinned" in b) await env.DB.prepare("UPDATE messages SET pinned = ? WHERE id = ?").bind(b.pinned ? 1 : 0, msg.id).run();
      const row = await getMessage(env, msg.id);
      ctx.waitUntil(broadcast(env, { t: "msg", row }));
      return json({ message: row });
    }
    if (m === "DELETE") {
      if (msg.sender_id !== user.id) throw new HttpError(403, "You can only delete your own messages");
      await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(msg.id).run();
      ctx.waitUntil(Promise.all([removeFiles(env, [msg.media_path, msg.thumb_path]), broadcast(env, { t: "del", id: msg.id })]));
      return json({ ok: true });
    }
  }
  if (p === "/api/receipts" && m === "POST") {
    const b = await body(), now = nowIso();
    const where = "conversation_id = ? AND sender_id != ?";
    const ids = [];
    const d = await env.DB.prepare(`SELECT id FROM messages WHERE ${where} AND delivered_at IS NULL LIMIT 200`).bind(conv, user.id).all();
    if (d.results.length) { await env.DB.prepare(`UPDATE messages SET delivered_at = ? WHERE ${where} AND delivered_at IS NULL`).bind(now, conv, user.id).run(); ids.push(...d.results.map((r) => r.id)); }
    let read = false;
    if (b.read === true) {
      const r = await env.DB.prepare(`SELECT id FROM messages WHERE ${where} AND read_at IS NULL LIMIT 200`).bind(conv, user.id).all();
      if (r.results.length) { await env.DB.prepare(`UPDATE messages SET read_at = ?, delivered_at = COALESCE(delivered_at, ?) WHERE ${where} AND read_at IS NULL`).bind(now, now, conv, user.id).run(); ids.push(...r.results.map((x2) => x2.id)); read = true; }
    }
    const uniq = [...new Set(ids)];
    if (uniq.length) ctx.waitUntil(broadcast(env, { t: "rcpt", ids: uniq, delivered_at: now, read_at: read ? now : null }));
    return json({ ok: true, updated: uniq.length, ids: uniq, delivered_at: now, read_at: read ? now : null });
  }
  if (p === "/api/clear" && m === "POST") {
    const { results } = await env.DB.prepare("SELECT media_path, thumb_path FROM messages WHERE conversation_id = ?").bind(conv).all();
    await env.DB.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(conv).run();
    ctx.waitUntil(Promise.all([removeFiles(env, results.flatMap((r) => [r.media_path, r.thumb_path])), broadcast(env, { t: "clear" })]));
    return json({ ok: true });
  }
  if (p === "/api/purge" && m === "POST") return json({ removed: await purgeExpired(env) });

  if ((x = p.match(/^\/api\/messages\/([^/]+)\/(reaction|star)$/))) {
    const msg = await needMessage(env, x[1]), now = nowIso();
    if (x[2] === "reaction") {
      if (m === "PUT") {
        const emoji = String((await body()).emoji || "").slice(0, 16);
        if (!emoji) throw new HttpError(400, "Missing emoji");
        await env.DB.prepare("INSERT INTO message_reactions (message_id,user_id,emoji,created_at) VALUES (?,?,?,?) ON CONFLICT(message_id,user_id) DO UPDATE SET emoji = excluded.emoji, created_at = excluded.created_at").bind(msg.id, user.id, emoji, now).run();
        ctx.waitUntil(broadcast(env, { t: "react", message_id: msg.id, user_id: user.id, emoji }));
        return json({ ok: true });
      }
      if (m === "DELETE") {
        await env.DB.prepare("DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?").bind(msg.id, user.id).run();
        ctx.waitUntil(broadcast(env, { t: "react", message_id: msg.id, user_id: user.id, emoji: null }));
        return json({ ok: true });
      }
    } else {
      if (m === "PUT") { await env.DB.prepare("INSERT OR IGNORE INTO message_stars (message_id,user_id,created_at) VALUES (?,?,?)").bind(msg.id, user.id, now).run(); return json({ ok: true }); }
      if (m === "DELETE") { await env.DB.prepare("DELETE FROM message_stars WHERE message_id = ? AND user_id = ?").bind(msg.id, user.id).run(); return json({ ok: true }); }
    }
  }
  if ((x = p.match(/^\/api\/view-once\/([^/]+)\/(open|close)$/)) && m === "POST") {
    const msg = await needMessage(env, x[1]);
    if (!msg.view_once || msg.sender_id === user.id) throw new HttpError(403, "Not allowed");
    const now = nowIso();
    if (x[2] === "open") {
      const r = await env.DB.prepare("UPDATE messages SET viewed_at = ? WHERE id = ? AND viewed_at IS NULL").bind(now, msg.id).run();
      if (r.meta.changes !== 1) throw new HttpError(409, "Already opened");
      ctx.waitUntil(getMessage(env, msg.id).then((row) => broadcast(env, { t: "msg", row })));
      return json({ media_path: msg.media_path });
    }
    if (msg.viewed_at && !msg.view_closed_at) {
      await env.DB.prepare("UPDATE messages SET view_closed_at = ? WHERE id = ?").bind(now, msg.id).run();
      ctx.waitUntil(Promise.all([removeFiles(env, [msg.media_path]), getMessage(env, msg.id).then((row) => broadcast(env, { t: "msg", row }))]));
    }
    return json({ ok: true });
  }

  if (p === "/api/scheduled" && m === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM scheduled_messages WHERE sender_id = ? ORDER BY send_at").bind(user.id).all();
    return json({ items: results });
  }
  if (p === "/api/scheduled" && m === "POST") {
    const b = await body(), at = new Date(b.send_at), text = String(b.content || "").trim().slice(0, 4000);
    if (!text || isNaN(at) || at.getTime() < Date.now() + 30000) throw new HttpError(400, "Pick a time in the future and write a message");
    await env.DB.prepare("INSERT INTO scheduled_messages (id,conversation_id,sender_id,content,send_at,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), conv, user.id, text, at.toISOString(), nowIso()).run();
    return json({ ok: true }, 201);
  }
  if ((x = p.match(/^\/api\/scheduled\/([^/]+)$/)) && m === "DELETE") {
    await env.DB.prepare("DELETE FROM scheduled_messages WHERE id = ? AND sender_id = ?").bind(x[1], user.id).run();
    return json({ ok: true });
  }

  if (p === "/api/shared" && m === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM shared_items WHERE conversation_id = ? ORDER BY created_at").bind(conv).all();
    return json({ items: results.map((r) => ({ ...r, done: !!r.done })) });
  }
  if (p === "/api/shared" && m === "POST") {
    const b = await body(), title = String(b.title || "").trim().slice(0, 200), kind = b.kind === "countdown" ? "countdown" : "todo";
    const target = kind === "countdown" ? new Date(b.target_at) : null;
    if (!title || (kind === "countdown" && isNaN(target))) throw new HttpError(400, "Add a name" + (kind === "countdown" ? " and a date" : ""));
    await env.DB.prepare("INSERT INTO shared_items (id,conversation_id,kind,title,done,target_at,created_by,created_at) VALUES (?,?,?,?,0,?,?,?)").bind(crypto.randomUUID(), conv, kind, title, target ? target.toISOString() : null, user.id, nowIso()).run();
    ctx.waitUntil(broadcast(env, { t: "shared" }));
    return json({ ok: true }, 201);
  }
  if ((x = p.match(/^\/api\/shared\/([^/]+)$/))) {
    if (m === "PATCH") { await env.DB.prepare("UPDATE shared_items SET done = ? WHERE id = ? AND conversation_id = ?").bind((await body()).done ? 1 : 0, x[1], conv).run(); }
    else if (m === "DELETE") { await env.DB.prepare("DELETE FROM shared_items WHERE id = ? AND conversation_id = ?").bind(x[1], conv).run(); }
    else throw new HttpError(405, "Method not allowed");
    ctx.waitUntil(broadcast(env, { t: "shared" }));
    return json({ ok: true });
  }
  throw new HttpError(404, "Not found");
}

export default {
  async fetch(req, env, ctx) {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const path = new URL(req.url).pathname;
    if (path === "/" || path === "/api/health") return json({ ok: true, service: "private-chat-api" }, 200, cors);
    try {
      const user = await authUser(req, env);
      const res = await route(req, env, ctx, user);
      Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return json({ error: status === 500 ? "Server error" : e.message }, status, cors);
    }
  },
  async scheduled(event, env, ctx) {
    await sendDueScheduled(env, ctx);
    await purgeExpired(env);
    if (new Date().getUTCMinutes() === 17) { try { await sweepOrphans(env); } catch (e) { console.error("sweep failed", e); } }
  },
};
