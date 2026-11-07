import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import worker from "./index.js";

const CONV = "11111111-1111-4111-8111-111111111111";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const users = { tokA: { id: A, email: "stacy@chat.local" }, tokB: { id: B, email: "symoh@chat.local" }, tokX: { id: "x", email: "intruder@example.com" } };

// ---- D1 shim over node:sqlite
const sql = new DatabaseSync(":memory:"); sql.exec("PRAGMA foreign_keys = ON;"); sql.exec(fs.readFileSync("schema.sql", "utf8"));
const clean = (a) => a.map((v) => (v === undefined ? null : v));
function stmt(q) { let params = []; const s = { bind: (...p) => { params = clean(p); return s; },
  first: async () => sql.prepare(q).get(...params) ?? null, all: async () => ({ results: sql.prepare(q).all(...params) }),
  run: async () => { const r = sql.prepare(q).run(...params); return { meta: { changes: Number(r.changes) } }; }, _run: () => sql.prepare(q).run(...params) }; return s; }
const DB = { prepare: stmt, batch: async (list) => { for (const s of list) await s.run(); return []; } };

// ---- fake Supabase
const calls = []; let disappear = null;
const legacy = { messages: [
  { id: "10000000-0000-4000-8000-000000000001", conversation_id: CONV, sender_id: A, kind: "text", content: "old hello", media_path: null, waveform: null, reply_to: null, pinned: true, view_once: false, created_at: "2026-10-30T10:00:00.123456+00:00", read_at: "2026-10-30T10:01:00+00:00" },
  { id: "10000000-0000-4000-8000-000000000002", conversation_id: CONV, sender_id: B, kind: "text", content: "old reply", media_path: null, waveform: null, reply_to: "10000000-0000-4000-8000-000000000001", pinned: false, view_once: false, created_at: "2026-10-30T10:02:00+00:00" },
  { id: "10000000-0000-4000-8000-000000000003", conversation_id: CONV, sender_id: A, kind: "voice", content: null, media_path: `${CONV}/${A}/1-old.webm`, media_duration: 5000, waveform: [1, 50, 100], reply_to: null, pinned: false, view_once: false, created_at: "2026-10-30T10:03:00+00:00" },
], message_reactions: [{ message_id: "10000000-0000-4000-8000-000000000001", user_id: B, emoji: "❤️", created_at: "2026-10-30T10:05:00+00:00" }], message_stars: [], scheduled_messages: [], shared_items: [] };
let storageObjects = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url); const u = new URL(url); calls.push({ url, method: init.method || "GET", body: init.body });
  const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });
  if (u.pathname === "/auth/v1/user") { const t = (init.headers.Authorization || "").slice(7); return users[t] ? J(users[t]) : J({}, 401); }
  if (u.pathname === "/rest/v1/conversations") return J([{ disappear_seconds: disappear }]);
  const m = u.pathname.match(/^\/rest\/v1\/(\w+)$/); if (m) return J(legacy[m[1]] ?? []);
  if (u.pathname.startsWith("/storage/v1/object/list/")) { const prefix = JSON.parse(init.body).prefix; const kids = new Map();
    for (const o of storageObjects) { if (!o.name.startsWith(prefix ? prefix + "/" : "")) continue; const rest = o.name.slice(prefix ? prefix.length + 1 : 0).split("/"); if (rest.length === 1) kids.set(rest[0], { name: rest[0], id: "f", created_at: o.created_at }); else if (!kids.has(rest[0])) kids.set(rest[0], { name: rest[0], id: null }); }
    return J([...kids.values()]); }
  if (u.pathname === "/storage/v1/object/chat-media" && init.method === "DELETE") { const p = JSON.parse(init.body).prefixes; storageObjects = storageObjects.filter((o) => !p.includes(o.name)); return J([]); }
  return J({});
};

const env = { DB, SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "srv", PUSH_SECRET: "sec", CONVERSATION_ID: CONV, ALLOWED_ORIGINS: "https://app.example" };
const pend = []; const ctx = { waitUntil: (p) => pend.push(p) };
const settle = async () => { await Promise.all(pend.splice(0)); };
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log("FAIL:", name); } };
async function call(method, path, token, body) {
  const res = await worker.fetch(new Request("https://w.example" + path, { method, headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body ? { "Content-Type": "application/json" } : {}), Origin: "https://app.example" }, body: body ? JSON.stringify(body) : undefined }), env, ctx);
  await settle(); let data = null; try { data = await res.json(); } catch {} return { status: res.status, data, headers: res.headers };
}
const count = (pred) => calls.filter(pred).length;

// ---- tests
let r = await call("GET", "/api/health"); ok(r.status === 200 && r.data.ok, "health");
r = await call("GET", "/api/sync"); ok(r.status === 401, "no token -> 401");
r = await call("GET", "/api/sync", "tokX"); ok(r.status === 403, "intruder -> 403");
r = await call("OPTIONS", "/api/sync"); ok(r.status === 204 && r.headers.get("access-control-allow-origin") === "https://app.example", "CORS preflight");

r = await call("GET", "/api/sync", "tokA");
ok(r.status === 200 && r.data.messages.length === 3, "import + sync returns legacy messages");
ok(r.data.messages[0].created_at.endsWith("Z") && r.data.messages[0].pinned === true, "timestamps ISO Z, pinned boolean");
ok(r.data.messages[2].waveform?.length === 3, "waveform parsed");
ok(r.data.reactions.length === 1 && r.data.pins.length === 1, "reactions + pins");
ok(r.data.messages[1].reply_to === "10000000-0000-4000-8000-000000000001", "reply link kept");
const importCalls = count((c) => c.url.includes("/rest/v1/messages"));
await call("GET", "/api/sync", "tokB"); ok(count((c) => c.url.includes("/rest/v1/messages")) === importCalls, "import runs only once");

// create message
const id1 = "20000000-0000-4000-8000-000000000001";
r = await call("POST", "/api/messages", "tokA", { id: id1, kind: "text", content: "hi there" });
ok(r.status === 201 && r.data.message.id === id1, "create message");
ok(count((c) => c.url.includes("/functions/v1/send-push")) === 1 && count((c) => c.url.includes("/realtime/v1/api/broadcast")) === 1, "push + broadcast fired once");
r = await call("POST", "/api/messages", "tokA", { id: id1, kind: "text", content: "hi there" });
ok(r.status === 201 && count((c) => c.url.includes("/functions/v1/send-push")) === 1, "retry with same id is idempotent (no second push)");
r = await call("POST", "/api/messages", "tokB", { id: id1, kind: "text", content: "steal" }); ok(r.status === 409, "other user cannot reuse id");
r = await call("POST", "/api/messages", "tokA", { kind: "file", media_path: `${CONV}/${B}/evil.jpg` }); ok(r.status === 400, "media path of another user rejected");
r = await call("POST", "/api/messages", "tokA", { kind: "text", content: "" }); ok(r.status === 400, "empty message rejected");
const mediaPath = `${CONV}/${A}/9-pic.jpg`, thumbPath = `${CONV}/${A}/9-thumb.jpg`; storageObjects.push({ name: mediaPath, created_at: "2026-10-30T00:00:00Z" }, { name: thumbPath, created_at: "2026-10-30T00:00:00Z" });
const id2 = "20000000-0000-4000-8000-000000000002";
r = await call("POST", "/api/messages", "tokA", { id: id2, kind: "file", media_path: mediaPath, thumb_path: thumbPath, reply_to: id1 }); ok(r.status === 201 && r.data.message.reply_to === id1, "media message with reply");

// edit / pin
r = await call("PATCH", `/api/messages/${id1}`, "tokB", { content: "hacked" }); ok(r.status === 403, "recipient cannot edit");
r = await call("PATCH", `/api/messages/${id1}`, "tokA", { content: "edited" }); ok(r.status === 200 && r.data.message.edited_at && r.data.message.content === "edited", "sender edits");
r = await call("PATCH", `/api/messages/${id1}`, "tokB", { pinned: true }); ok(r.status === 200 && r.data.message.pinned === true, "either user can pin");

// receipts
r = await call("POST", "/api/receipts", "tokA", { read: true }); const before = r.data.updated; // A reads B's old reply
r = await call("POST", "/api/receipts", "tokB", { read: true }); ok(r.data.updated >= 2, "partner marks delivered/read");
r = await call("GET", "/api/messages?limit=50", "tokA"); const mine = r.data.messages.find((m) => m.id === id1); ok(mine.read_at && mine.delivered_at, "sender sees read + delivered");
r = await call("POST", "/api/receipts", "tokA", { read: true }); const own = await call("GET", "/api/messages?limit=50", "tokB"); ok(own.data.messages.find((m) => m.id === id1).read_at, "sender cannot overwrite own receipts (rows only change for partner msgs)");

// reactions + stars
r = await call("PUT", `/api/messages/${id1}/reaction`, "tokB", { emoji: "😂" }); ok(r.status === 200, "react");
r = await call("PUT", `/api/messages/${id1}/reaction`, "tokB", { emoji: "👍" }); r = await call("GET", "/api/sync", "tokA");
ok(r.data.reactions.filter((x) => x.message_id === id1).length === 1 && r.data.reactions.find((x) => x.message_id === id1).emoji === "👍", "one reaction per user, replaced");
r = await call("DELETE", `/api/messages/${id1}/reaction`, "tokB"); r = await call("GET", "/api/sync", "tokA"); ok(!r.data.reactions.find((x) => x.message_id === id1), "reaction removed");
await call("PUT", `/api/messages/${id1}/star`, "tokA"); r = await call("GET", "/api/sync", "tokA"); ok(r.data.stars.includes(id1), "star saved");
r = await call("GET", "/api/sync", "tokB"); ok(!r.data.stars.includes(id1), "stars are private");

// search + byids
r = await call("GET", "/api/search?q=edit", "tokA"); ok(r.data.messages.length === 1, "search finds text");
r = await call("GET", "/api/search?q=%25", "tokA"); ok(r.data.messages.length === 0, "search escapes wildcards");
r = await call("GET", `/api/byids?ids=${id1},nope`, "tokA"); ok(r.data.messages.length === 1, "byids");

// pagination
for (let i = 0; i < 5; i++) await call("POST", "/api/messages", "tokA", { kind: "text", content: "p" + i });
r = await call("GET", "/api/sync?limit=3", "tokA"); ok(r.data.messages.length === 3 && r.data.hasMore === true, "sync limit + hasMore");
const oldest = r.data.messages[0].created_at; r = await call("GET", `/api/messages?before=${encodeURIComponent(oldest)}&limit=100`, "tokA"); ok(r.data.messages.every((m) => m.created_at < oldest), "older page");

// delete + storage cleanup
r = await call("DELETE", `/api/messages/${id2}`, "tokB"); ok(r.status === 403, "recipient cannot delete");
r = await call("DELETE", `/api/messages/${id2}`, "tokA"); ok(r.status === 200, "sender deletes");
ok(!storageObjects.some((o) => o.name === mediaPath || o.name === thumbPath), "files removed from Storage on delete");
r = await call("GET", "/api/messages?limit=100", "tokA"); ok(!r.data.messages.find((m) => m.id === id2) && r.data.messages.find((m) => m.id === id1), "row gone, others intact");

// view once
const pathO = `${CONV}/${A}/7-once.jpg`; storageObjects.push({ name: pathO, created_at: "2026-10-30T00:00:00Z" });
const id3 = "20000000-0000-4000-8000-000000000003";
await call("POST", "/api/messages", "tokA", { id: id3, kind: "file", media_path: pathO, view_once: true });
r = await call("POST", `/api/view-once/${id3}/open`, "tokA"); ok(r.status === 403, "sender cannot open own view-once");
r = await call("POST", `/api/view-once/${id3}/open`, "tokB"); ok(r.status === 200 && r.data.media_path === pathO, "recipient opens once");
r = await call("POST", `/api/view-once/${id3}/open`, "tokB"); ok(r.status === 409, "second open refused");
await call("POST", `/api/view-once/${id3}/close`, "tokB"); ok(!storageObjects.some((o) => o.name === pathO), "view-once file deleted after close");

// scheduled
r = await call("POST", "/api/scheduled", "tokA", { content: "later", send_at: new Date(Date.now() - 1000).toISOString() }); ok(r.status === 400, "past schedule refused");
r = await call("POST", "/api/scheduled", "tokA", { content: "later", send_at: new Date(Date.now() + 60000).toISOString() }); ok(r.status === 201, "future schedule ok");
sql.exec("UPDATE scheduled_messages SET send_at = '2020-01-01T00:00:00.000Z'");
await worker.scheduled({}, env, ctx); await settle();
r = await call("GET", "/api/search?q=later", "tokB"); ok(r.data.messages.length === 1 && r.data.messages[0].sender_id === A, "cron sends due scheduled message");
r = await call("GET", "/api/scheduled", "tokA"); ok(r.data.items.length === 0, "scheduled row consumed");

// shared items
r = await call("POST", "/api/shared", "tokA", { kind: "todo", title: "milk" }); ok(r.status === 201, "add todo");
r = await call("POST", "/api/shared", "tokB", { kind: "countdown", title: "trip", target_at: "2027-01-01" }); ok(r.status === 201, "add countdown");
r = await call("GET", "/api/shared", "tokA"); const todo = r.data.items.find((i) => i.kind === "todo"); ok(r.data.items.length === 2, "list shared");
await call("PATCH", `/api/shared/${todo.id}`, "tokB", { done: true }); r = await call("GET", "/api/shared", "tokA"); ok(r.data.items.find((i) => i.id === todo.id).done === true, "toggle done");
await call("DELETE", `/api/shared/${todo.id}`, "tokA"); r = await call("GET", "/api/shared", "tokA"); ok(r.data.items.length === 1, "delete shared");

// disappearing
disappear = 1; await new Promise((s) => setTimeout(s, 25000 > 0 ? 0 : 0)); const dId = "20000000-0000-4000-8000-0000000000d1";
// cache is 20s; bypass by creating a fresh worker module state isn't possible, so set expiry directly via SQL to test purge path
sql.exec("UPDATE messages SET expires_at = '2020-01-01T00:00:00.000Z' WHERE content = 'p0'");
r = await call("GET", "/api/search?q=p0", "tokA"); ok(r.data.messages.length === 0, "expired rows hidden from reads");
r = await call("POST", "/api/purge", "tokA"); ok(r.data.removed === 1, "purge deletes expired rows");

// orphan sweep + guard
const used = `${CONV}/${A}/live.jpg`; await call("POST", "/api/messages", "tokA", { kind: "file", media_path: used });
storageObjects.push({ name: used, created_at: "2026-10-01T00:00:00Z" }, { name: `${CONV}/${A}/orphan.jpg`, created_at: "2026-10-01T00:00:00Z" }, { name: `${CONV}/${A}/fresh-upload.jpg`, created_at: new Date().toISOString() });
await worker.scheduled({}, env, ctx); // minute may not be 17; call sweep via exported path by faking time
const RealDate = Date; globalThis.Date = class extends RealDate { getUTCMinutes() { return 17; } };
await worker.scheduled({}, env, ctx); globalThis.Date = RealDate; await settle();
ok(!storageObjects.some((o) => o.name.endsWith("orphan.jpg")), "orphan file swept");
ok(storageObjects.some((o) => o.name === used), "referenced file kept");
ok(storageObjects.some((o) => o.name.endsWith("fresh-upload.jpg")), "fresh upload kept (1h grace)");
// guard: wipe D1 media refs => everything looks orphaned => must refuse
for (let i = 0; i < 12; i++) storageObjects.push({ name: `${CONV}/${A}/g${i}.jpg`, created_at: "2026-10-01T00:00:00Z" });
const sizeBefore = storageObjects.length;
globalThis.Date = class extends RealDate { getUTCMinutes() { return 17; } };
await worker.scheduled({}, env, ctx); globalThis.Date = RealDate; await settle();
ok(storageObjects.length === sizeBefore, "mass-delete guard refuses when most files look orphaned");

// clear chat
r = await call("POST", "/api/clear", "tokB"); ok(r.status === 200, "clear chat");
r = await call("GET", "/api/sync", "tokA"); ok(r.data.messages.length === 0 && r.data.reactions.length === 0, "chat empty after clear");
ok(!storageObjects.some((o) => o.name === used), "clear removes media files");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
