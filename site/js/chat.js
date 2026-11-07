import { supabase } from "./supabase.js";
import { CONVERSATION_ID as CONV, BUCKET, VAPID_PUBLIC, TURN_SERVERS, API_URL } from "./config.js";
import { api, isNetworkError } from "./api.js";
import { applyTheme, THEMES, WALLS, currentTheme, currentWall, chooseTheme, chooseWall, soundOn, setSound, getMuteUntil, setMuteUntil, isMuted } from "./theme.js";
import { initLock, lockEnabled, lockMinutes, setLockMinutes, setPin, clearPin, verifyPin, askPin } from "./lock.js";
import { initCalls } from "./call.js";
import { createExtras } from "./extras.js";

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text; // never parsed as HTML
  return e;
};
const svg = (p) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  send: svg('<path d="M3 20.5 21.5 12 3 3.5v6.6L15 12 3 13.9z" fill="currentColor"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  clip: svg('<path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7"/>'),
  smile: svg('<circle cx="12" cy="12" r="9"/><path d="M8 14a4.5 4.5 0 0 0 8 0M9 9.5h.01M15 9.5h.01"/>'),
  reply: svg('<path d="M9 7 4 12l5 5M4 12h9a7 7 0 0 1 7 7"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  out: svg('<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>'),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
  video: svg('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
  star: svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  pin: svg('<path d="M12 17v5M8 3h8l-1 7 3 3H6l3-3z"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/>'),
  timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>'),
  palette: svg('<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2-.6-1.2.2-2.5 1.6-2.5H17a4 4 0 0 0 4-4A9 9 0 0 0 12 3z"/><path d="M7.5 11h.01M10 7.5h.01M14.5 7.5h.01"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  bell: svg('<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>'),
  download: svg('<path d="M12 3v12m0 0-4-4m4 4 4-4M4 20h16"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  file: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  list: svg('<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
  key: svg('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/>'),
  pinmap: svg('<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m21 16-5-5-8 8"/>'),
  device: svg('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'),
};
const setIcon = (n, name) => (n.innerHTML = ICON[name]);
const nice = (n) => (n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : "");
const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDur = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const byTime = (a, b) => new Date(a.created_at) - new Date(b.created_at);
const isImg = (p) => /\.(png|jpe?g|gif|webp|avif)$/i.test(p || "");
const isVid = (p) => /\.(mp4|webm|mov)$/i.test(p || "");
const isMedia = (m) => m.kind === "file" && !m.view_once && (isImg(m.media_path) || isVid(m.media_path));
function dayLabel(d) {
  const x = new Date(d), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1);
  if (x.toDateString() === t.toDateString()) return "Today";
  if (x.toDateString() === y.toDateString()) return "Yesterday";
  return x.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: x.getFullYear() !== t.getFullYear() ? "numeric" : undefined });
}
const lastSeenText = (ts) => (ts ? `last seen ${dayLabel(ts).toLowerCase()} at ${fmtTime(ts)}` : "offline");
const PAGE = 50;
const DISAPPEAR = [["Off", null], ["1 hour", 3600], ["24 hours", 86400], ["7 days", 604800]];

/* ---------- state ---------- */
const S = {
  me: null, partner: null, profiles: new Map(), messages: new Map(), reactions: new Map(), nodes: new Map(),
  stars: new Set(), pinCache: new Map(), pinIdx: 0, reply: null, editing: null, file: null,
  partnerOnline: false, partnerTyping: false, partnerKind: "typing", hasMore: false, loadingOlder: false, disappear: null, unread: 0,
  files: [], viewOnce: false, missed: 0, dividerId: null,
};
let channel = null, calls = null, extras = null, lastDay = null, installEvt = null;

const nameOf = (id) => (id === S.me.id ? "You" : nice(S.profiles.get(id)?.display_name));
const snippet = (m) =>
  m.kind === "call" ? "📞 Call"
  : m.view_once ? "📷 View-once photo"
  : m.kind === "voice" ? "🎤 Voice message"
  : m.kind === "sticker" ? "Sticker " + m.content
  : m.media_path && !m.content ? (isImg(m.media_path) ? "📷 Photo" : isVid(m.media_path) ? "🎬 Video" : "📎 File")
  : (m.content || "").slice(0, 90);

function showError(msg) { $("error").textContent = msg || ""; $("error").hidden = !msg; }
let toastTimer;
function toast(text, ms = 5000) {
  const t = $("toast"); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms);
}

/* ---------- sound + notifications + tab title ---------- */
let actx;
addEventListener("pointerdown", () => {
  actx ??= new (window.AudioContext || window.webkitAudioContext)();
  actx.resume?.();
}, { passive: true });
function beep() {
  if (!soundOn() || !actx) return;
  const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
  o.type = "sine"; o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  o.start(t); o.stop(t + 0.3);
}
const updateTitle = () => (document.title = (S.unread ? `(${S.unread}) ` : "") + "Private Chat");
function notifyIncoming(m) {
  if (!isMuted()) beep();
  if (document.visibilityState === "visible") return;
  S.unread++; updateTitle();
  if (!isMuted() && window.Notification && Notification.permission === "granted") {
    const opts = { body: snippet(m), tag: "msg", icon: "icons/icon-192.png" };
    navigator.serviceWorker?.ready.then((r) => r.showNotification(nice(S.partner.display_name), opts)).catch(() => new Notification(nice(S.partner.display_name), opts));
  }
}

/* ---------- signed URLs + avatars ---------- */
const urlCache = new Map();
function signed(path, bucket = BUCKET) {
  const k = bucket + "/" + path;
  if (!urlCache.has(k))
    urlCache.set(k, supabase.storage.from(bucket).createSignedUrl(path, 86400)
      .then(({ data }) => { if (!data) urlCache.delete(k); return data?.signedUrl ?? null; }));
  return urlCache.get(k);
}
const avatarUrls = new Map();
async function loadAvatar(id) {
  const p = S.profiles.get(id);
  if (!p?.avatar_path) return avatarUrls.delete(id);
  const url = await signed(p.avatar_path, "avatars");
  if (url) avatarUrls.set(id, url);
}
function paintAvatar(node, id) {
  node.textContent = "";
  const url = avatarUrls.get(id);
  if (url) { const img = el("img"); img.src = url; img.alt = ""; node.append(img); }
  else node.textContent = (S.profiles.get(id)?.display_name || "?")[0];
}
const bindAvatar = (node, id) => { node.dataset.avatar = id; paintAvatar(node, id); };
const repaintAvatars = (id) => document.querySelectorAll(`[data-avatar="${id}"]`).forEach((n) => paintAvatar(n, id));

/* ---------- sheets / dialogs ---------- */
function showSheet(build) {
  const ov = el("div", "overlay"), sheet = el("div", "sheet");
  const close = () => ov.remove();
  build(sheet, close);
  ov.append(sheet);
  ov.addEventListener("click", (e) => e.target === ov && close());
  document.body.append(ov);
  return close;
}
const item = (icon, label, fn, danger) => {
  const b = el("button", "sheet-item" + (danger ? " danger" : ""));
  b.type = "button"; b.innerHTML = ICON[icon]; b.append(el("span", null, label)); b.onclick = fn; return b;
};
function choices(sheet, options, current, pick) {
  const row = el("div", "choices");
  options.forEach(([label, val]) => {
    const b = el("button", "choice" + (val === current ? " on" : ""), label); b.type = "button";
    b.onclick = () => { pick(val); row.querySelectorAll(".choice").forEach((x) => x.classList.remove("on")); b.classList.add("on"); };
    row.append(b);
  });
  sheet.append(row);
}
function confirmDialog(title, text, okLabel) {
  return new Promise((resolve) => showSheet((sheet, close) => {
    const done = (v) => { close(); resolve(v); };
    const cancel = el("button", "btn-ghost", "Cancel"), ok = el("button", "btn-danger", okLabel);
    cancel.type = ok.type = "button"; cancel.onclick = () => done(false); ok.onclick = () => done(true);
    const row = el("div", "dialog-actions"); row.append(cancel, ok);
    sheet.append(el("h2", "sheet-title", title), el("p", "muted", text), row);
  }));
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelector(".overlay:not(.pinpad):last-of-type")?.remove(); });

/* ---------- status ---------- */
function renderStatus() {
  const s = $("status");
  $("typing").hidden = !S.partnerTyping;
  if (S.partnerTyping) { s.textContent = S.partnerKind === "recording" ? "recording voice…" : "typing…"; s.className = "status typing-now"; }
  else if (S.partnerOnline) { s.textContent = "online"; s.className = "status online"; }
  else { s.textContent = lastSeenText(S.partner.last_seen); s.className = "status"; }
}
function renderInfo() {
  const d = DISAPPEAR.find(([, v]) => v === S.disappear);
  $("info-bar").hidden = !S.disappear;
  $("info-bar").textContent = S.disappear ? `⏳ New messages disappear after ${d ? d[0] : S.disappear + "s"}` : "";
}

/* ---------- rendering ---------- */
function toggleEmpty() {
  $("empty").hidden = S.messages.size > 0;
  $("empty").textContent = `No messages yet. Say hi to ${nice(S.partner.display_name)} 👋`;
}
function scrollDown(force) {
  const l = $("messages");
  if (force || l.scrollHeight - l.scrollTop - l.clientHeight < 160) l.scrollTop = l.scrollHeight;
}
function appendNode(m) {
  const list = $("messages"), day = new Date(m.created_at).toDateString();
  if (day !== lastDay) { list.append(el("div", "day", dayLabel(m.created_at))); lastDay = day; }
  if (m.id === S.dividerId) list.append(el("div", "unread-divider", "New messages"));
  const row = buildMessage(m);
  S.nodes.set(m.id, row); list.append(row); renderReactions(m.id);
}
function renderAll(keepScroll) {
  const l = $("messages"), prevH = l.scrollHeight, prevT = l.scrollTop;
  l.querySelectorAll(".row, .day, .unread-divider").forEach((n) => n.remove());
  S.nodes.clear(); lastDay = null;
  [...S.messages.values()].sort(byTime).forEach(appendNode);
  toggleEmpty();
  if (keepScroll) l.scrollTop = prevT + (l.scrollHeight - prevH);
}
function addMessage(m) {
  const ex = S.messages.get(m.id);
  if (ex) { if (ex._pending) { S.messages.set(m.id, m); rebuild(m.id); } return; }
  const l = $("messages"), near = l.scrollHeight - l.scrollTop - l.clientHeight < 160;
  S.messages.set(m.id, m); appendNode(m); toggleEmpty();
  if (m.sender_id !== S.me.id && !near && m.kind !== "call") S.missed++;
  scrollDown(m.sender_id === S.me.id); updateJump();
}
function removeMessage(id) {
  S.nodes.get(id)?.remove();
  S.nodes.delete(id); S.messages.delete(id); S.reactions.delete(id); S.stars.delete(id); S.pinCache.delete(id);
  if (S.reply?.id === id) clearReply();
  if (S.editing?.id === id) cancelEdit();
  renderPinned(); toggleEmpty();
}
function rebuild(id) {
  const m = S.messages.get(id), old = S.nodes.get(id);
  if (!m || !old) return;
  const row = buildMessage(m); old.replaceWith(row); S.nodes.set(id, row); renderReactions(id);
}
const tickText = (m) => (m.sender_id !== S.me.id ? "" : m._failed ? "⚠ Tap to retry" : m._pending ? "🕓" : m.read_at || m.delivered_at ? "✓✓" : "✓");
function paintTicks(span, m) { span.textContent = tickText(m); span.classList.toggle("read", !!m.read_at); span.classList.toggle("failed", !!m._failed); }

function buildMessage(m) {
  const mine = m.sender_id === S.me.id;
  if (m.kind === "call") { const r = el("div", "row system"); r.append(el("div", "callrow", callText(m) + " · " + fmtTime(m.created_at))); return r; }
  const row = el("div", "row " + (mine ? "mine" : "theirs"));
  const stack = el("div", "stack"), bubble = el("div", "bubble" + (m.kind === "sticker" ? " sticker" : "") + (m._pending ? " pending" : "") + (m._failed ? " failed" : ""));
  stack.append(bubble);
  if (m.reply_to) {
    const o = S.messages.get(m.reply_to);
    const q = el("button", "quote"); q.type = "button";
    q.append(el("strong", null, o ? nameOf(o.sender_id) : "Message"), el("span", null, o ? snippet(o) : "Original message unavailable"));
    q.onclick = () => goToMessage(m.reply_to);
    bubble.append(q);
  }
  if (m.media_path) bubble.append(m.view_once ? viewOnceCard(m) : m.kind === "voice" ? voicePlayer(m) : filePreview(m));
  if (m.content) {
    const p = el("p", m.kind === "sticker" ? "big-emoji" : "text");
    fillText(p, m.content); bubble.append(p);
    const u = m.kind === "text" ? firstUrl(m.content) : null;
    if (u) bubble.append(linkCard(u));
  }
  const foot = el("div", "foot");
  if (m.pinned) foot.append(el("span", "ico", "📌"));
  if (S.stars.has(m.id)) foot.append(el("span", "ico", "★"));
  if (m.expires_at) foot.append(el("span", "ico", "⏳"));
  if (m.edited_at) foot.append(el("span", null, "edited"));
  foot.append(el("span", null, fmtTime(m.created_at)));
  if (mine) { const t = el("span", "ticks"); paintTicks(t, m); t.onclick = (e) => { e.stopPropagation(); const cur = S.messages.get(m.id); if (cur?._failed) { cur._failed = false; flushOne(m.id); } else if (!cur?._pending) openInfo(m.id); }; foot.append(t); }
  bubble.append(foot);
  stack.append(el("div", "reacts"));
  row.append(stack);
  attachGestures(stack, m.id);
  return row;
}
function jumpTo(id) {
  const n = S.nodes.get(id); if (!n) return;
  n.scrollIntoView({ block: "center", behavior: "smooth" });
  n.classList.add("flash"); setTimeout(() => n.classList.remove("flash"), 1400);
}
async function goToMessage(id) {
  let guard = 0;
  while (!S.nodes.has(id) && S.hasMore && guard++ < 40) await loadOlder();
  if (S.nodes.has(id)) jumpTo(id); else toast("That message is no longer available.", 2500);
}
async function loadOlder() {
  if (S.loadingOlder || !S.hasMore) return;
  S.loadingOlder = true;
  const oldest = [...S.messages.values()].sort(byTime)[0]?.created_at;
  let rows = [];
  try {
    const d = await api("GET", `/api/messages?before=${encodeURIComponent(oldest)}&limit=${PAGE}`);
    rows = d.messages; S.hasMore = d.hasMore;
  } catch (e) { showError("Could not load older messages: " + e.message); }
  rows.forEach((m) => S.messages.set(m.id, m));
  if (rows.length) renderAll(true);
  S.loadingOlder = false;
}

function filePreview(m) {
  const box = el("div", "media", "Loading…");
  const name = m.media_path.split("/").pop().replace(/^\d+-/, "");
  Promise.all([signed(m.media_path), m.thumb_path ? signed(m.thumb_path) : null]).then(([url, turl]) => {
    box.textContent = "";
    if (!url) return (box.textContent = "Attachment unavailable.");
    if (isImg(m.media_path)) {
      const img = el("img"); img.src = turl || url; img.alt = name; img.onload = () => scrollDown(false);
      img.onclick = () => openViewer(m.id); box.append(img);
    } else if (isVid(m.media_path)) {
      const v = el("video"); v.src = url; if (turl) v.poster = turl; v.controls = true; v.preload = "metadata"; box.append(v);
      const b = el("button", "expand", "⤢ Open"); b.type = "button"; b.onclick = () => openViewer(m.id); box.append(b);
    } else {
      const a = el("a", "filelink", "📎 " + name); a.href = url; a.target = "_blank"; a.rel = "noreferrer"; box.append(a);
    }
  });
  return box;
}

/* ---------- full-screen viewer ---------- */
function openViewer(startId) {
  const list = [...S.messages.values()].filter(isMedia).sort(byTime);
  let i = list.findIndex((m) => m.id === startId); if (i < 0) return;
  const ov = el("div", "viewer"), stage = el("div", "viewer-stage"), cap = el("div", "viewer-cap");
  const x = el("button", "viewer-x"); x.type = "button"; x.innerHTML = ICON.close; x.setAttribute("aria-label", "Close");
  const prev = el("button", "viewer-nav prev", "‹"), next = el("button", "viewer-nav next", "›");
  prev.type = next.type = "button";
  async function show() {
    const m = list[i]; stage.textContent = "Loading…";
    const url = await signed(m.media_path); stage.textContent = "";
    if (!url) return (stage.textContent = "Unavailable");
    const n = isVid(m.media_path) ? Object.assign(el("video"), { controls: true, autoplay: true }) : el("img");
    n.src = url; stage.append(n);
    cap.textContent = `${nameOf(m.sender_id)} · ${new Date(m.created_at).toLocaleString()}`;
    prev.hidden = i === 0; next.hidden = i === list.length - 1;
  }
  const go = (d) => { const n = i + d; if (n >= 0 && n < list.length) { i = n; show(); } };
  const onKey = (e) => { if (e.key === "Escape") done(); if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); };
  const done = () => { ov.remove(); removeEventListener("keydown", onKey); };
  let sx = null;
  ov.addEventListener("touchstart", (e) => (sx = e.touches[0].clientX), { passive: true });
  ov.addEventListener("touchend", (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); sx = null; });
  x.onclick = done; prev.onclick = () => go(-1); next.onclick = () => go(1);
  addEventListener("keydown", onKey);
  ov.append(stage, cap, x, prev, next); document.body.append(ov); show();
}

/* ---------- voice player (waveform + speed) ---------- */
let playing = null;
function pseudoWave(id, n = 40) {
  let s = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return Array.from({ length: n }, () => { s = (s * 1664525 + 1013904223) >>> 0; return 25 + (s % 70); });
}
function voicePlayer(m) {
  const wrap = el("div", "voice"), btn = el("button", "vplay"); btn.type = "button"; btn.setAttribute("aria-label", "Play voice message"); setIcon(btn, "mic");
  const wave = el("div", "vwave");
  const peaks = Array.isArray(m.waveform) && m.waveform.length ? m.waveform : pseudoWave(m.id);
  const bars = peaks.map((p) => { const b = el("i"); b.style.height = Math.max(12, p) + "%"; wave.append(b); return b; });
  const speed = el("button", "vspeed", "1×"); speed.type = "button";
  const time = el("span", "vtime", fmtDur(m.media_duration || 0));
  wrap.append(btn, wave, time, speed);
  let audio = null, rate = 1;
  const total = () => (m.media_duration || 0) / 1000 || (audio && isFinite(audio.duration) ? audio.duration : 0);
  async function ensure() {
    if (audio) return audio;
    const url = await signed(m.media_path); if (!url) return null;
    audio = new Audio(url);
    audio.addEventListener("timeupdate", () => {
      const d = total(), r = d ? Math.min(1, audio.currentTime / d) : 0;
      bars.forEach((b, i) => b.classList.toggle("played", i < r * bars.length));
      time.textContent = fmtDur((d - audio.currentTime) * 1000);
    });
    audio.addEventListener("play", () => { btn.classList.add("on"); setMediaSession(m, audio); });
    audio.addEventListener("pause", () => btn.classList.remove("on"));
    audio.addEventListener("ended", () => { bars.forEach((b) => b.classList.remove("played")); time.textContent = fmtDur(total() * 1000); playNextVoice(m.id); });
    return audio;
  }
  btn.onclick = async () => {
    const a = await ensure(); if (!a) return (time.textContent = "error");
    if (a.paused) { if (playing && playing !== a) playing.pause(); playing = a; a.playbackRate = rate; a.play().catch(() => (time.textContent = "error")); }
    else a.pause();
  };
  speed.onclick = () => { rate = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; speed.textContent = rate + "×"; if (audio) audio.playbackRate = rate; };
  wave.onclick = async (e) => {
    const a = await ensure(), d = total();
    if (a && d) { const r = wave.getBoundingClientRect(); a.currentTime = ((e.clientX - r.left) / r.width) * d; }
  };
  return wrap;
}

/* ---------- gestures ---------- */
function attachGestures(stack, id) {
  let timer = null, sx = 0, sy = 0, dx = 0, swiping = false, fired = false;
  const stop = () => { clearTimeout(timer); timer = null; };
  stack.addEventListener("pointerdown", (e) => {
    sx = e.clientX; sy = e.clientY; dx = 0; swiping = false; fired = false;
    timer = setTimeout(() => { fired = true; openMessageMenu(id); navigator.vibrate?.(15); }, 450);
  });
  stack.addEventListener("pointermove", (e) => {
    const x = e.clientX - sx, y = e.clientY - sy;
    if (Math.abs(y) > 10 || Math.abs(x) > 10) stop();
    if (!swiping && x > 12 && Math.abs(y) < Math.abs(x)) swiping = true;
    if (swiping) { dx = Math.min(80, Math.max(0, x)); stack.style.transform = `translateX(${dx}px)`; }
  });
  const end = () => {
    stop();
    if (swiping) {
      if (dx >= 60) startReply(id);
      stack.style.transition = "transform .15s"; stack.style.transform = "";
      setTimeout(() => (stack.style.transition = ""), 160);
    }
    swiping = false;
  };
  stack.addEventListener("pointerup", end); stack.addEventListener("pointercancel", end);
  stack.addEventListener("contextmenu", (e) => { e.preventDefault(); stop(); if (!fired) openMessageMenu(id); });
}
function openMessageMenu(id) {
  const m = S.messages.get(id); if (!m) return;
  if (m._pending || m._failed) return openPendingMenu(id);
  const mineReact = S.reactions.get(id)?.get(S.me.id), mine = m.sender_id === S.me.id;
  showSheet((sheet, close) => {
    const rx = el("div", "react-row");
    ["👍", "❤️", "😂", "😮", "😢", "🙏"].forEach((em) => {
      const b = el("button", em === mineReact ? "on" : "", em); b.type = "button";
      b.onclick = () => { close(); react(id, em); }; rx.append(b);
    });
    const more = el("button", null, "＋"); more.type = "button"; more.setAttribute("aria-label", "More reactions"); more.onclick = () => { close(); openReactionPicker(id); }; rx.append(more);
    sheet.append(rx, item("reply", "Reply", () => { close(); startReply(id); }));
    if (m.content && m.kind !== "sticker") sheet.append(item("copy", "Copy text", () => { close(); navigator.clipboard?.writeText(m.content); toast("Copied", 1500); }));
    if (mine && m.kind === "text") sheet.append(item("edit", "Edit", () => { close(); startEdit(id); }));
    sheet.append(item("pin", m.pinned ? "Unpin" : "Pin to top", () => { close(); togglePin(id); }));
    sheet.append(item("star", S.stars.has(id) ? "Remove star" : "Star", () => { close(); toggleStar(id); }));
    sheet.append(item("info", "Info", () => { close(); openInfo(id); }));
    if (mine) sheet.append(item("trash", "Delete message", () => { close(); deleteMessage(id); }, true));
  });
}

/* ---------- reactions ---------- */
function setReaction(id, uid, emoji) {
  let map = S.reactions.get(id); if (!map) S.reactions.set(id, (map = new Map()));
  if (emoji) map.set(uid, emoji); else map.delete(uid);
  renderReactions(id);
}
function renderReactions(id) {
  const row = S.nodes.get(id); if (!row) return;
  const box = row.querySelector(".reacts"); if (!box) return; box.textContent = "";
  const counts = new Map();
  for (const [, em] of S.reactions.get(id) ?? []) counts.set(em, (counts.get(em) || 0) + 1);
  const mine = S.reactions.get(id)?.get(S.me.id);
  counts.forEach((n, em) => {
    const c = el("button", "chip" + (em === mine ? " mine" : ""), n > 1 ? `${em} ${n}` : em);
    c.type = "button"; c.onclick = () => react(id, em); box.append(c);
  });
}
async function react(id, emoji) {
  const cur = S.reactions.get(id)?.get(S.me.id);
  if (cur === emoji) {
    setReaction(id, S.me.id, null);
    try { await api("DELETE", `/api/messages/${id}/reaction`); pub({ t: "react", message_id: id, user_id: S.me.id, emoji: null }); }
    catch (e) { setReaction(id, S.me.id, cur); showError(e.message); }
  } else {
    setReaction(id, S.me.id, emoji);
    try { await api("PUT", `/api/messages/${id}/reaction`, { emoji }); pub({ t: "react", message_id: id, user_id: S.me.id, emoji }); }
    catch (e) { setReaction(id, S.me.id, cur ?? null); showError(e.message); }
  }
}

/* ---------- pin / star / edit / delete ---------- */
const pinnedList = () => {
  const map = new Map(S.pinCache);
  S.messages.forEach((m, id) => (m.pinned ? map.set(id, m) : map.delete(id)));
  return [...map.values()].sort(byTime);
};
function renderPinned() {
  const l = pinnedList(), bar = $("pin-bar"); bar.hidden = !l.length;
  if (!l.length) return;
  S.pinIdx %= l.length;
  $("pin-text").textContent = (l.length > 1 ? `(${S.pinIdx + 1}/${l.length}) ` : "") + snippet(l[S.pinIdx]);
}
async function togglePin(id) {
  const m = S.messages.get(id); if (!m) return;
  try {
    const { message } = await api("PATCH", `/api/messages/${id}`, { pinned: !m.pinned });
    applyUpdate(message); pub({ t: "msg", row: message });
  } catch (e) { showError("Could not pin: " + e.message); }
}
async function toggleStar(id) {
  if (S.stars.has(id)) {
    S.stars.delete(id);
    try { await api("DELETE", `/api/messages/${id}/star`); } catch (e) { S.stars.add(id); showError(e.message); }
  } else {
    S.stars.add(id);
    try { await api("PUT", `/api/messages/${id}/star`); } catch (e) { S.stars.delete(id); showError(e.message); }
  }
  rebuild(id);
}
function startEdit(id) {
  const m = S.messages.get(id); if (!m) return;
  clearReply(); S.editing = m;
  $("text").value = m.content; $("edit-bar").hidden = false; $("text").focus(); updateComposer();
}
function cancelEdit() { S.editing = null; $("edit-bar").hidden = true; $("text").value = ""; updateComposer(); }
async function deleteMessage(id) {
  const m = S.messages.get(id);
  if (!m || !(await confirmDialog("Delete this message?", "It will be removed for both of you.", "Delete"))) return;
  try { await api("DELETE", `/api/messages/${id}`); } catch (e) { return showError("Could not delete: " + e.message); }
  removeMessage(id); pub({ t: "del", id }); // the server also deletes the files from Supabase Storage
}
function clearLocal() {
  S.messages.clear(); S.reactions.clear(); S.nodes.clear(); S.pinCache.clear(); S.hasMore = false; lastDay = null;
  $("messages").querySelectorAll(".row, .day, .unread-divider").forEach((n) => n.remove());
  clearReply(); renderPinned(); toggleEmpty();
}
async function clearChat() {
  if (!(await confirmDialog("Delete the whole chat?", "Every message, voice note, photo and video is deleted for both of you, including the files in storage. This can’t be undone.", "Delete everything"))) return;
  try { await api("POST", "/api/clear"); } catch (e) { return showError("Could not clear chat: " + e.message); } // the server also deletes the files
  clearLocal(); pub({ t: "clear" }); toast("Chat deleted", 2500);
}
/** Merge a changed row into state and refresh only what changed. */
function applyUpdate(n) {
  const o = S.messages.get(n.id); if (!o) { if (n.pinned) S.pinCache.set(n.id, n); else S.pinCache.delete(n.id); renderPinned(); return; }
  const merged = { ...o, ...n }; S.messages.set(n.id, merged);
  if (["content", "edited_at", "pinned", "expires_at", "viewed_at", "view_closed_at"].every((k) => o[k] === merged[k])) {
    const t = S.nodes.get(n.id)?.querySelector(".ticks"); if (t) paintTicks(t, merged);
  } else rebuild(n.id);
  renderPinned();
}

/* ---------- disappearing messages ---------- */
async function purge() {
  try { await api("POST", "/api/purge"); } catch {}
}
function sweep() {
  const now = Date.now(); let any = false;
  for (const m of [...S.messages.values()]) if (m.expires_at && new Date(m.expires_at).getTime() <= now) { removeMessage(m.id); any = true; }
  if (any) purge();
}

/* ---------- receipts ---------- */
let receiptTimer;
const scheduleReceipts = () => { clearTimeout(receiptTimer); receiptTimer = setTimeout(markReceipts, 250); };
async function markReceipts() {
  try {
    const d = await api("POST", "/api/receipts", { read: document.visibilityState === "visible" });
    if (d.ids?.length) pub({ t: "rcpt", ids: d.ids, delivered_at: d.delivered_at, read_at: d.read_at });
  } catch {}
}

/* ---------- reply ---------- */
function startReply(id) {
  const m = S.messages.get(id); if (!m) return;
  if (S.editing) cancelEdit();
  S.reply = m; $("reply-name").textContent = nameOf(m.sender_id); $("reply-text").textContent = snippet(m);
  $("reply-bar").hidden = false; $("text").focus(); saveDraft();
}
function clearReply() { S.reply = null; $("reply-bar").hidden = true; saveDraft(); }

/* ---------- sending ---------- */
async function post({ content = null, media_path = null, kind = "text", media_duration = null, waveform = null, thumb_path = null, view_once = false }) {
  try {
    const { message } = await api("POST", "/api/messages", { content, media_path, kind, media_duration, waveform, thumb_path, view_once, reply_to: S.reply?.id ?? null });
    addMessage(message); pub({ t: "msg", row: message }); clearReply(); return true;
  } catch (e) { showError("Could not send: " + e.message); return false; }
}
/* ---------- shrink photos & videos before upload ---------- */
const MAX_UPLOAD = 25 * 1048576, MAX_IMG_SIDE = 1600, MAX_VID_SIDE = 960, MAX_VID_SECONDS = 180;
const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
let skipCompress = false;
function compressUI(on, pct) {
  $("compress-skip").hidden = !on;
  $("file-name").textContent = on ? `Shrinking video… ${Math.round((pct || 0) * 100)}% (keep this tab open)` : filesLabel();
}
async function prepareFile(file) {
  const orig = { blob: file, name: file.name, type: file.type || undefined };
  let out = orig;
  try {
    if (/^image\/(jpeg|png|webp|bmp|avif|heic|heif)$/i.test(file.type) || /\.(jpe?g|png|webp|bmp|heic|heif)$/i.test(file.name)) out = await compressImage(file);
    else if (/^video\//i.test(file.type)) out = await compressVideo(file);
  } catch (e) {
    console.warn("shrink failed", e); toast("Couldn’t shrink this file, sending the original.", 3500);
  }
  if (out.blob !== file) toast(`Shrunk ${fmtSize(file.size)} → ${fmtSize(out.blob.size)}`, 3500);
  return out;
}
async function compressImage(file) {
  const orig = { blob: file, name: file.name, type: file.type || undefined };
  if (file.size < 150 * 1024) return orig;
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_IMG_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.8));
  if (!blob || blob.size >= file.size) return orig;
  return { blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", type: "image/jpeg" };
}
/** Re-encodes in the browser at up to 960px / ~1.3 Mbps. Runs in real time (a 60 s video takes about 60 s). */
async function compressVideo(file) {
  const orig = { blob: file, name: file.name, type: file.type || undefined };
  if (file.size < 2.5 * 1048576 || !window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return orig;
  const mime = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) return orig;
  const url = URL.createObjectURL(file), v = document.createElement("video");
  v.src = url; v.playsInline = true; v.preload = "auto"; v.muted = false;
  let ac = null;
  try {
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("unreadable video")); });
    const dur = v.duration;
    if (!isFinite(dur) || dur > MAX_VID_SECONDS || !v.videoWidth) return orig;
    const k = Math.min(1, MAX_VID_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round((v.videoWidth * k) / 2) * 2, h = Math.round((v.videoHeight * k) / 2) * 2;
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const dest = ac.createMediaStreamDestination();
    ac.createMediaElementSource(v).connect(dest); // audio goes to the recorder only, not the speakers
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_300_000, audioBitsPerSecond: 96_000 });
    const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise((res) => (rec.onstop = res));
    skipCompress = false; compressUI(true, 0);
    rec.start(500); await ac.resume(); await v.play();
    await new Promise((resolve) => {
      v.onended = resolve;
      const tick = () => { ctx.drawImage(v, 0, 0, w, h); compressUI(true, v.currentTime / dur); if (v.ended || skipCompress) return resolve(); requestAnimationFrame(tick); };
      tick();
    });
    v.pause(); if (rec.state !== "inactive") rec.stop(); await stopped;
    if (skipCompress) return orig;
    const type = mime.split(";")[0], blob = new Blob(chunks, { type });
    if (!blob.size || blob.size >= file.size * 0.95) return orig;
    return { blob, name: file.name.replace(/\.[^.]+$/, "") + (type.includes("mp4") ? ".mp4" : ".webm"), type };
  } finally {
    compressUI(false); ac?.close?.(); URL.revokeObjectURL(url);
  }
}

async function upload(blob, name, contentType) {
  const path = `${CONV}/${S.me.id}/${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType });
  if (error) { showError("Upload failed: " + error.message); return null; }
  return path;
}
const hasContent = () => $("text").value.trim() || S.files.length;
function updateComposer() {
  const send = !!hasContent() || !!S.editing;
  setIcon($("action"), send ? "send" : "mic");
  $("action").setAttribute("aria-label", send ? "Send message" : "Record voice message");
}
const filesLabel = () => (S.files.length === 1 ? S.files[0].name : `${S.files.length} files`);
function setFiles(arr) {
  S.files = arr; S.viewOnce = false;
  $("file-chip").hidden = !arr.length; $("file-name").textContent = arr.length ? filesLabel() : "";
  const once = $("once-btn"); once.hidden = !(arr.length === 1 && /^image\//.test(arr[0].type)); once.classList.remove("on"); once.textContent = "👁 View once";
  if (!arr.length) $("file").value = "";
  updateComposer();
}
async function submitSend() {
  const text = $("text").value.trim();
  if (S.editing) {
    if (!text) return;
    const id = S.editing.id;
    if (text !== S.editing.content) {
      try { const { message } = await api("PATCH", `/api/messages/${id}`, { content: text }); applyUpdate(message); pub({ t: "msg", row: message }); }
      catch (e) { return showError("Could not edit: " + e.message); }
    }
    return cancelEdit();
  }
  if (!text && !S.files.length) return;
  showError("");
  if (!S.files.length) { // text: queued, so it survives going offline
    sendQueued({ content: text, reply_to: S.reply?.id ?? null }); clearReply();
    $("text").value = ""; saveDraft(); updateComposer(); stopTyping(); $("text").focus(); return;
  }
  $("action").disabled = true;
  const once = S.viewOnce && S.files.length === 1;
  let caption = text || null;
  while (S.files.length) {
    const f = S.files[0];
    if (!(await sendFile(f, caption, once))) break;
    caption = null; S.files.shift();
    $("file-name").textContent = S.files.length ? filesLabel() : "";
  }
  $("action").disabled = false;
  if (!S.files.length) { $("text").value = ""; setFiles([]); saveDraft(); stopTyping(); } else setFiles(S.files);
  updateComposer(); $("text").focus();
}
async function sendFile(file, caption, once) {
  const prep = await prepareFile(file);
  if (prep.blob.size > MAX_UPLOAD) { showError(`${file.name} is too large (${fmtSize(prep.blob.size)}). The limit is 25 MB.`); return false; }
  const thumb = once ? null : await makeThumb(prep);
  const media_path = await upload(prep.blob, prep.name, prep.type);
  if (!media_path) return false;
  let thumb_path = null;
  if (thumb) thumb_path = await upload(thumb, "thumb.jpg", "image/jpeg");
  const ok = await post({ content: caption, media_path, kind: "file", thumb_path, view_once: once });
  if (!ok) supabase.storage.from(BUCKET).remove([media_path, thumb_path].filter(Boolean)); // don't leave files behind
  return ok;
}
/* thumbnails: ~320 px JPEG so the chat loads fast */
async function drawThumb(src, w, h, max = 320) {
  if (!w || !h) return null;
  const k = Math.min(1, max / Math.max(w, h)), c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, "image/jpeg", 0.7));
}
async function makeThumb(prep) {
  try {
    if (/^image\//.test(prep.type || "")) { const bmp = await createImageBitmap(prep.blob); const t = await drawThumb(bmp, bmp.width, bmp.height); bmp.close?.(); return t; }
    if (/^video\//.test(prep.type || "")) {
      const url = URL.createObjectURL(prep.blob), v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
      try {
        await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(rej, 6000); });
        v.currentTime = Math.min(0.2, (v.duration || 1) / 2);
        await new Promise((res) => { v.onseeked = res; setTimeout(res, 1500); });
        return await drawThumb(v, v.videoWidth, v.videoHeight);
      } finally { URL.revokeObjectURL(url); }
    }
  } catch {}
  return null;
}

/* ---------- typing ---------- */
let lastTypingSent = 0, typingIdle, partnerTypingTimer;
const sendTyping = (typing, kind = "typing") => channel?.send({ type: "broadcast", event: "typing", payload: { id: S.me.id, typing, kind } });
function onTyping() {
  if (S.editing) return;
  const now = Date.now();
  if (now - lastTypingSent > 2000) { lastTypingSent = now; sendTyping(true); }
  clearTimeout(typingIdle); typingIdle = setTimeout(stopTyping, 3000);
}
function stopTyping() { clearTimeout(typingIdle); if (lastTypingSent) sendTyping(false); lastTypingSent = 0; }

/* ---------- voice recording (with waveform) ---------- */
let rec = null;
function toBars(peaks, n = 40) {
  if (!peaks.length) return null;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * peaks.length) / n), b = Math.max(a + 1, Math.floor(((i + 1) * peaks.length) / n));
    let mx = 0; for (let j = a; j < b; j++) mx = Math.max(mx, peaks[j] || 0); out.push(mx);
  }
  const top = Math.max(...out, 0.05);
  return out.map((v) => Math.round(Math.min(1, v / top) * 100));
}
async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return showError("Voice messages aren’t supported in this browser.");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec = { mr, stream, chunks, start: Date.now(), mime: mr.mimeType || mime || "audio/webm", peaks: [] };
    try { // live level sampling for the waveform
      const ac = new (window.AudioContext || window.webkitAudioContext)(), an = ac.createAnalyser(); an.fftSize = 512;
      ac.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      rec.ac = ac; rec.sampler = setInterval(() => {
        an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) { const x = (v - 128) / 128; s += x * x; }
        rec.peaks.push(Math.sqrt(s / buf.length));
      }, 100);
    } catch {}
    mr.start();
    sendTyping(true, "recording"); rec.recPing = setInterval(() => sendTyping(true, "recording"), 2000);
    $("send-form").hidden = true; $("rec-bar").hidden = false; $("rec-time").textContent = "0:00";
    rec.timer = setInterval(() => ($("rec-time").textContent = fmtDur(Date.now() - rec.start)), 250);
  } catch { showError("Microphone access is blocked. Allow it in your browser settings to send voice messages."); }
}
async function finishRecording(send) {
  const r = rec; if (!r) return;
  rec = null; clearInterval(r.timer); clearInterval(r.sampler); clearInterval(r.recPing); sendTyping(false, "recording"); r.ac?.close?.();
  $("rec-bar").hidden = true; $("send-form").hidden = false;
  await new Promise((res) => { r.mr.onstop = res; r.mr.stop(); });
  r.stream.getTracks().forEach((t) => t.stop());
  const dur = Date.now() - r.start;
  if (!send || dur < 700) return;
  const type = r.mime.split(";")[0], ext = /mp4/.test(type) ? "m4a" : /ogg/.test(type) ? "ogg" : "webm";
  const path = await upload(new Blob(r.chunks, { type }), `voice.${ext}`, type);
  if (path && !(await post({ media_path: path, kind: "voice", media_duration: dur, waveform: toBars(r.peaks) }))) supabase.storage.from(BUCKET).remove([path]);
}

/* ---------- emoji + stickers ---------- */
const EMOJI = {
  Smileys: "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😛 😜 🤪 🤗 🤔 😐 😏 😴 😌 😎 🤓 🥳 😢 😭 😤 😡 🥺 😱 😳 🙄",
  Gestures: "👍 👎 👏 🙌 🙏 💪 👋 🤝 ✌️ 🤞 👌 🤙 🫶 👀",
  Hearts: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💖 💘 😻",
  Fun: "🎉 🔥 ✨ 💯 🎂 🎁 🌹 ☀️ 🌙 ⭐ 🍕 🍔 ☕ 🎶 ⚽ ✈️ 🏠 💤 🙈",
};
const STICKERS = "🥰 😘 😂 🤣 😭 😡 👍 ❤️ 🔥 🎉 🙏 😴 🤗 😎 🥳 🤔 😱 🙈 💯 🫶 😍 🤝 👋 🌹 😇 🤩 😜 🥺 💪 🎂".split(" ");
function buildEmojiPanel() {
  const p = $("emoji-panel"), tabs = el("div", "emoji-tabs"), emojiBox = el("div"), stickerBox = el("div", "sticker-grid");
  const t1 = el("button", "on", "Emoji"), t2 = el("button", null, "Stickers"); t1.type = t2.type = "button";
  const pick = (which) => { emojiBox.hidden = which !== 1; stickerBox.hidden = which !== 2; t1.classList.toggle("on", which === 1); t2.classList.toggle("on", which === 2); };
  t1.onclick = () => pick(1); t2.onclick = () => pick(2); tabs.append(t1, t2);
  for (const [group, list] of Object.entries(EMOJI)) {
    emojiBox.append(el("div", "emoji-group", group));
    const grid = el("div", "emoji-grid");
    list.split(" ").forEach((e) => {
      const b = el("button", null, e); b.type = "button";
      b.onclick = () => {
        const i = $("text"), s = i.selectionStart ?? i.value.length, t = i.selectionEnd ?? s;
        i.value = i.value.slice(0, s) + e + i.value.slice(t); i.focus(); i.setSelectionRange(s + e.length, s + e.length);
        updateComposer(); onTyping();
      };
      grid.append(b);
    });
    emojiBox.append(grid);
  }
  STICKERS.forEach((e) => {
    const b = el("button", null, e); b.type = "button";
    b.onclick = async () => { $("emoji-panel").hidden = true; await post({ content: e, kind: "sticker" }); };
    stickerBox.append(b);
  });
  p.append(tabs, emojiBox, stickerBox); pick(1);
}

/* ---------- search + starred ---------- */
function messageList(sheet, rows, empty) {
  const box = el("div", "results");
  if (!rows.length) box.append(el("p", "muted center-text", empty));
  rows.forEach((m) => {
    const b = el("button", "result"); b.type = "button";
    b.append(el("strong", null, `${nameOf(m.sender_id)} · ${dayLabel(m.created_at)} ${fmtTime(m.created_at)}`), el("span", null, snippet(m)));
    b.onclick = () => { document.querySelector(".overlay:last-of-type")?.remove(); goToMessage(m.id); };
    box.append(b);
  });
  return box;
}
function openSearch() {
  showSheet((sheet) => {
    const input = el("input", "search-input"); input.placeholder = "Search messages"; input.type = "search";
    const out = el("div"); sheet.classList.add("tall"); sheet.append(input, out); input.focus();
    let t;
    input.oninput = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const q = input.value.trim(); out.textContent = ""; if (q.length < 2) return;
        let rows = [];
        try { rows = (await api("GET", `/api/search?q=${encodeURIComponent(q)}`)).messages; } catch (e) { showError(e.message); }
        out.append(messageList(sheet, rows, "No messages found."));
      }, 300);
    };
  });
}
async function openStarred() {
  const ids = [...S.stars];
  let data = [];
  try { if (ids.length) data = (await api("GET", `/api/byids?ids=${ids.slice(0, 100).join(",")}`)).messages; } catch (e) { showError(e.message); }
  showSheet((sheet) => { sheet.classList.add("tall"); sheet.append(el("h2", "sheet-title", "Starred messages"), messageList(sheet, data ?? [], "No starred messages yet. Press and hold a message, then choose Star.")); });
}

/* ---------- profile photo ---------- */
async function toSquareBlob(file, size = 384) {
  const bmp = await createImageBitmap(file), s = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas"); c.width = c.height = size;
  c.getContext("2d").drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
}
async function saveAvatar(path) {
  const me = S.profiles.get(S.me.id), old = me.avatar_path;
  const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", S.me.id);
  if (error) { showError("Could not update photo: " + error.message); return false; }
  me.avatar_path = path; if (old) supabase.storage.from("avatars").remove([old]);
  await loadAvatar(S.me.id); repaintAvatars(S.me.id); return true;
}
function openProfile() {
  showSheet((sheet, close) => {
    const big = el("div", "avatar xl"); bindAvatar(big, S.me.id);
    const input = el("input"); input.type = "file"; input.accept = "image/*"; input.hidden = true;
    input.onchange = async () => {
      const f = input.files[0]; if (!f) return;
      try {
        const blob = await toSquareBlob(f), path = `${S.me.id}/${Date.now()}.jpg`;
        const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
        if (error) throw error;
        if (await saveAvatar(path)) toast("Profile photo updated", 2000);
      } catch (e) { showError("Could not upload photo: " + (e.message || e)); }
      close();
    };
    const has = S.profiles.get(S.me.id).avatar_path;
    sheet.append(big, el("h2", "sheet-title center", nice(S.profiles.get(S.me.id).display_name)), input, item("user", has ? "Change photo" : "Add photo", () => input.click()));
    if (has) sheet.append(item("trash", "Remove photo", async () => { close(); if (await saveAvatar(null)) toast("Photo removed", 2000); }, true));
  });
}

/* ---------- settings sheets ---------- */
function openDisappearing() {
  showSheet((sheet) => {
    sheet.append(el("h2", "sheet-title", "Disappearing messages"), el("p", "muted", "New messages are deleted for both of you after this time. Existing messages stay."));
    choices(sheet, DISAPPEAR, S.disappear, async (v) => {
      const { error } = await supabase.rpc("set_disappearing", { conv_id: CONV, secs: v });
      if (error) return showError(error.message);
      S.disappear = v; renderInfo();
    });
  });
}
function openTheme() {
  showSheet((sheet) => {
    sheet.append(el("h2", "sheet-title", "Theme & wallpaper"));
    const sw = el("div", "swatches");
    Object.entries(THEMES).forEach(([name, [a, b]]) => {
      const s = el("button", "swatch" + (name === currentTheme() ? " on" : "")); s.type = "button"; s.title = name; s.setAttribute("aria-label", name);
      s.style.background = `linear-gradient(135deg, ${a}, ${b})`;
      s.onclick = () => { chooseTheme(name); sw.querySelectorAll(".swatch").forEach((x) => x.classList.remove("on")); s.classList.add("on"); };
      sw.append(s);
    });
    sheet.append(sw, el("p", "muted", "Wallpaper"));
    choices(sheet, WALLS.map((w) => [w, w]), currentWall(), chooseWall);
  });
}
function openLockSettings() {
  showSheet(async (sheet, close) => {
    sheet.append(el("h2", "sheet-title", "App lock"), el("p", "muted", "A PIN on this device only. It locks the chat when you’ve been away or idle."));
    const setNew = async () => {
      close();
      const a = await askPin({ title: "Choose a 4-digit PIN" }); if (!a) return;
      const b = await askPin({ title: "Confirm your PIN", check: async (v) => v === a }); if (!b) return;
      await setPin(a); toast("App lock is on", 2500);
    };
    if (!lockEnabled()) return sheet.append(item("lock", "Set a PIN", setNew));
    sheet.append(el("p", "muted", "Lock after being away or idle for:"));
    choices(sheet, [["1 min", 1], ["5 min", 5], ["15 min", 15]], lockMinutes(), setLockMinutes);
    sheet.append(item("lock", "Change PIN", async () => {
      close(); if (!(await askPin({ title: "Enter current PIN", check: verifyPin }))) return; setNew();
    }), item("trash", "Turn off app lock", async () => {
      close(); if (await askPin({ title: "Enter your PIN", check: verifyPin })) { clearPin(); toast("App lock is off", 2500); }
    }, true));
  });
}
function openNotifications() {
  showSheet(async (sheet) => {
    sheet.classList.add("tall");
    sheet.append(el("h2", "sheet-title", "Notifications & sound"));
    choices(sheet, [["Sound on", true], ["Sound off", false]], soundOn(), (v) => { setSound(v); if (v) beep(); });
    sheet.append(el("p", "muted", "Mute notifications"));
    const status = el("p", "muted", muteLabel());
    choices(sheet, [["Unmute", 0], ["1 hour", 3600e3], ["8 hours", 8 * 3600e3], ["Until 8am", "tomorrow"], ["Until I unmute", "forever"]], null, (v) => {
      let until = 0;
      if (v === "tomorrow") { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); until = d.getTime(); }
      else if (v === "forever") until = Date.now() + 100 * 365 * 864e5;
      else if (v) until = Date.now() + v;
      setMuteUntil(until); syncMute(); status.textContent = muteLabel();
    });
    sheet.append(status);
    const st = await pushState();
    sheet.append(el("p", "muted", st === "on" ? "Background notifications are on for this device, even when the app is closed."
      : st === "denied" ? "Notifications are blocked in your browser settings."
      : st === "unsupported" ? "This browser can’t receive background notifications. On iPhone, first add the app to your Home Screen (Share → Add to Home Screen), then open it from there."
      : "Get an alert for new messages even when the app is closed."));
    if (st === "off") sheet.append(item("bell", "Turn on background notifications", async () => { document.querySelector(".overlay:last-of-type")?.remove(); await enablePush(); }));
    if (st === "on") sheet.append(item("bell", "Turn off for this device", async () => { document.querySelector(".overlay:last-of-type")?.remove(); await disablePush(); toast("Background notifications are off", 2500); }));
  });
}
function openMainMenu() {
  showSheet((sheet, close) => {
    const go = (fn) => () => { close(); fn(); };
    sheet.classList.add("tall");
    sheet.append(
      item("user", "My profile photo", go(openProfile)),
      item("star", "Starred messages", go(openStarred)),
      item("list", "Shared list & countdowns", go(() => extras.openShared())),
      item("calendar", "Scheduled messages", go(() => extras.openSchedule())),
      item("timer", "Disappearing messages", go(openDisappearing)),
      item("palette", "Theme & wallpaper", go(openTheme)),
      item("lock", "App lock", go(openLockSettings)),
      item("key", "Change password", go(() => extras.openChangePassword())),
      item("device", "Where you’re signed in", go(() => extras.openSessions())),
      item("bell", "Notifications & sound", go(openNotifications)),
      item("download", "Install app", go(async () => {
        if (installEvt) { installEvt.prompt(); installEvt = null; }
        else toast("Use your browser menu: “Install app” or “Add to Home screen”.", 5000);
      })),
      item("file", "Export chat backup", go(openExport)),
      item("trash", "Delete whole chat", go(clearChat), true),
      item("out", "Sign out", async () => { close(); await beat(); await disablePush(); await supabase.auth.signOut(); location.replace("login.html"); })
    );
  });
}

/* ---------- links + previews ---------- */
const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const splitUrl = (raw) => { const t = raw.match(/[).,!?;:]+$/); return t ? [raw.slice(0, -t[0].length), t[0]] : [raw, ""]; };
function fillText(p, text) {
  let last = 0;
  for (const mt of text.matchAll(URL_RE)) {
    const [u] = splitUrl(mt[0]);
    if (mt.index > last) p.append(document.createTextNode(text.slice(last, mt.index)));
    const a = el("a", "link", u); a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer"; p.append(a);
    last = mt.index + u.length;
  }
  if (last < text.length) p.append(document.createTextNode(text.slice(last)));
}
const firstUrl = (text) => { const m = text.match(URL_RE); return m ? splitUrl(m[0])[0] : null; };
const previews = new Map();
function linkCard(url) {
  const card = el("a", "linkcard"); card.href = url; card.target = "_blank"; card.rel = "noopener noreferrer"; card.hidden = true;
  if (!previews.has(url))
    previews.set(url, supabase.functions.invoke("link-preview", { body: { url } })
      .then(({ data, error }) => (error || !data || data.error ? null : data)).catch(() => null));
  previews.get(url).then((d) => {
    if (!d || (!d.title && !d.description)) return;
    card.append(el("small", null, d.site || ""), el("b", null, d.title || url));
    if (d.description) card.append(el("span", null, d.description));
    card.hidden = false; scrollDown(false);
  });
  return card;
}

/* ---------- message info ---------- */
function openInfo(id) {
  const m = S.messages.get(id); if (!m) return;
  showSheet((sheet) => {
    sheet.append(el("h2", "sheet-title", "Message info"));
    const rows = [["Sent", m.created_at]];
    if (m.sender_id === S.me.id) rows.push(["Delivered", m.delivered_at], ["Read", m.read_at]);
    if (m.edited_at) rows.push(["Edited", m.edited_at]);
    if (m.expires_at) rows.push(["Disappears", m.expires_at]);
    rows.forEach(([k, v]) => {
      const r = el("div", "inforow");
      r.append(el("span", null, k), el("strong", null, v ? new Date(v).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"));
      sheet.append(r);
    });
  });
}

/* ---------- lock-screen audio controls + auto-play next voice note ---------- */
function setMediaSession(m, a) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: "Voice message", artist: nameOf(m.sender_id), album: "Private Chat",
      artwork: [{ src: "icons/icon-512.png", sizes: "512x512", type: "image/png" }],
    });
    navigator.mediaSession.setActionHandler("play", () => a.play());
    navigator.mediaSession.setActionHandler("pause", () => a.pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => (a.currentTime = Math.max(0, a.currentTime - 10)));
    navigator.mediaSession.setActionHandler("seekforward", () => (a.currentTime = Math.min(a.duration || 1e9, a.currentTime + 10)));
    navigator.mediaSession.setActionHandler("nexttrack", () => playNextVoice(m.id, true));
  } catch {}
}
function playNextVoice(id, force) {
  const list = [...S.messages.values()].sort(byTime), i = list.findIndex((x) => x.id === id);
  const cur = list[i], next = list[i + 1];
  if (next && next.kind === "voice" && (force || next.sender_id === cur.sender_id)) S.nodes.get(next.id)?.querySelector(".vplay")?.click();
}

/* ---------- mute + background push ---------- */
function muteLabel() {
  const u = getMuteUntil();
  if (!isMuted()) return "Notifications are on.";
  if (u > Date.now() + 3e10) return "Muted until you unmute.";
  return "Muted until " + new Date(u).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) + ".";
}
const mutedIso = () => (isMuted() ? new Date(getMuteUntil()).toISOString() : null);
const syncMute = () => supabase.from("push_subscriptions").update({ muted_until: mutedIso() }).eq("user_id", S.me.id);
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const b64ToBytes = (s) => {
  const raw = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};
async function pushState() {
  if (!pushSupported()) return "unsupported";
  const reg = await navigator.serviceWorker.ready;
  if (await reg.pushManager.getSubscription()) return "on";
  return Notification.permission === "denied" ? "denied" : "off";
}
async function saveSub(sub) {
  const j = sub.toJSON();
  return supabase.rpc("save_push_subscription", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_muted: mutedIso() });
}
async function enablePush() {
  if (!pushSupported()) return toast("Background notifications aren’t supported here. On iPhone, add the app to your Home Screen first.", 6000);
  if ((await Notification.requestPermission()) !== "granted") return toast("Notifications weren’t allowed.", 3000);
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC) }));
    const { error } = await saveSub(sub);
    if (error) throw error;
    toast("Background notifications are on", 3000);
  } catch (e) { showError("Could not enable notifications: " + (e.message || e)); }
}
async function disablePush() {
  try {
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (sub) { await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
  } catch {}
}
/** Keeps this device's subscription attached to whoever is signed in now. */
async function refreshPush() {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (sub) await saveSub(sub);
  } catch {}
}

/* ---------- backup export ---------- */
async function fetchAllMessages() {
  const all = []; let before = "9999";
  for (;;) {
    const d = await api("GET", `/api/messages?before=${encodeURIComponent(before)}&limit=500`);
    all.push(...d.messages);
    if (!d.hasMore || !d.messages.length) break;
    before = d.messages[d.messages.length - 1].created_at;
  }
  return all.sort(byTime);
}
function download(blob, name) {
  const a = el("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
}
async function exportChat(withMedia) {
  toast("Preparing backup…", 120000);
  try {
    const msgs = await fetchAllMessages();
    const dn = (id) => nice(S.profiles.get(id)?.display_name);
    const stamp = new Date().toISOString().slice(0, 10);
    let zip = null;
    if (withMedia) { const mod = await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm"); zip = new mod.default(); }
    const files = new Map(); let done = 0;
    const mediaMsgs = msgs.filter((m) => m.media_path && !m.view_once);
    for (const [i, m] of mediaMsgs.entries()) {
      const base = m.media_path.split("/").pop().replace(/^\d+-/, "");
      const name = `media/${String(i + 1).padStart(4, "0")}-${base}`;
      files.set(m.id, name);
      if (withMedia) {
        try {
          const url = await signed(m.media_path); const res = await fetch(url);
          if (!res.ok) throw new Error(res.status); zip.file(name, await res.blob());
        } catch { files.set(m.id, null); }
        toast(`Backing up files… ${++done}/${mediaMsgs.length}`, 120000);
      }
    }
    const byId = new Map(msgs.map((m) => [m.id, m]));
    const reactionsOf = (id) => [...(S.reactions.get(id) ?? [])].map(([u, e]) => `${dn(u)} ${e}`);
    const lines = msgs.map((m) => {
      if (m.kind === "call") return `[${new Date(m.created_at).toLocaleString()}] 📞 ${callText(m)}`;
      if (m.view_once) return `[${new Date(m.created_at).toLocaleString()}] ${dn(m.sender_id)}: 📷 view-once photo (not included)`;
      let t = `[${new Date(m.created_at).toLocaleString()}] ${dn(m.sender_id)}: `;
      if (m.reply_to && byId.get(m.reply_to)) t += `(reply to ${dn(byId.get(m.reply_to).sender_id)}: “${snippet(byId.get(m.reply_to))}”) `;
      if (m.kind === "voice") t += `🎤 voice message ${fmtDur(m.media_duration || 0)}`;
      else if (m.kind === "sticker") t += `sticker ${m.content}`;
      else t += m.content ?? "";
      if (m.media_path && m.kind !== "voice") t += `${m.content ? " " : ""}[attachment${withMedia && files.get(m.id) ? ": " + files.get(m.id) : ""}]`;
      if (m.media_path && m.kind === "voice" && withMedia && files.get(m.id)) t += ` [${files.get(m.id)}]`;
      if (m.edited_at) t += " (edited)";
      const rx = reactionsOf(m.id); if (rx.length) t += `  {reactions: ${rx.join(", ")}}`;
      return t;
    });
    const header = `Private Chat backup · ${new Date().toLocaleString()} · ${msgs.length} messages\n${"-".repeat(40)}\n`;
    if (!withMedia) { download(new Blob([header + lines.join("\n") + "\n"], { type: "text/plain" }), `chat-backup-${stamp}.txt`); }
    else {
      zip.file("chat.txt", header + lines.join("\n") + "\n");
      zip.file("chat.json", JSON.stringify(msgs.map((m) => ({
        id: m.id, time: m.created_at, from: dn(m.sender_id), kind: m.kind, text: m.content, reply_to: m.reply_to,
        edited_at: m.edited_at, pinned: m.pinned, delivered_at: m.delivered_at, read_at: m.read_at, duration_ms: m.media_duration,
        file: files.get(m.id) ?? null, reactions: Object.fromEntries([...(S.reactions.get(m.id) ?? [])].map(([u, e]) => [dn(u), e])),
      })), null, 2));
      toast("Zipping…", 120000);
      download(await zip.generateAsync({ type: "blob", compression: "STORE" }), `chat-backup-${stamp}.zip`);
    }
    toast("Backup downloaded. Keep it somewhere private.", 5000);
  } catch (e) { toast("Backup failed: " + (e.message || e), 6000); }
}
function openExport() {
  showSheet((sheet, close) => {
    sheet.append(el("h2", "sheet-title", "Export chat backup"),
      el("p", "muted", "The backup contains your private messages. Store it somewhere safe."),
      item("file", "Text only (.txt)", () => { close(); exportChat(false); }),
      item("download", "Everything with photos & voice notes (.zip)", () => { close(); exportChat(true); }));
  });
}

/* ---------- call log, view-once, outbox, attach, drafts, jump ---------- */
function callText(m) {
  const [type, outcome, secs] = (m.content || "").split("|"), mine = m.sender_id === S.me.id, label = type === "video" ? "video call" : "voice call";
  if (outcome === "ended") return `${mine ? "Outgoing" : "Incoming"} ${label} · ${fmtDur(Number(secs) * 1000)}`;
  if (outcome === "missed") return mine ? `No answer · ${label}` : `Missed ${label}`;
  if (outcome === "cancelled") return mine ? `Cancelled ${label}` : `Missed ${label}`;
  if (outcome === "declined") return mine ? `${label[0].toUpperCase() + label.slice(1)} declined` : `You declined a ${label}`;
  return label;
}
function viewOnceCard(m) {
  const b = el("button", "once"); b.type = "button";
  if (m.viewed_at) { b.textContent = "👁 Opened"; b.disabled = true; }
  else if (m.sender_id === S.me.id) { b.textContent = "📷 View-once photo · not opened yet"; b.disabled = true; }
  else { b.textContent = "📷 Tap to view once"; b.onclick = () => openViewOnce(m.id); }
  return b;
}
async function openViewOnce(id) {
  const m = S.messages.get(id); if (!m) return;
  let path;
  try { path = (await api("POST", `/api/view-once/${id}/open`)).media_path; } catch (e) { return showError("Can’t open this photo: " + e.message); }
  applyUpdate({ ...m, viewed_at: new Date().toISOString() });
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120);
  const ov = el("div", "viewer"), stage = el("div", "viewer-stage"), cap = el("div", "viewer-cap", "View once · it’s deleted when you close this");
  const x = el("button", "viewer-x"); x.type = "button"; x.innerHTML = ICON.close; x.setAttribute("aria-label", "Close");
  if (data?.signedUrl) { const img = el("img"); img.src = data.signedUrl; stage.append(img); } else stage.textContent = "Couldn’t load the photo.";
  x.onclick = async () => { ov.remove(); try { await api("POST", `/api/view-once/${id}/close`); } catch {} };
  ov.append(stage, cap, x); document.body.append(ov);
}
function openReactionPicker(id) {
  showSheet((sheet, close) => {
    sheet.classList.add("tall"); sheet.append(el("h2", "sheet-title", "React with…"));
    for (const [group, list] of Object.entries(EMOJI)) {
      sheet.append(el("div", "emoji-group", group));
      const grid = el("div", "emoji-grid");
      list.split(" ").forEach((e) => { const b = el("button", null, e); b.type = "button"; b.onclick = () => { close(); react(id, e); }; grid.append(b); });
      sheet.append(grid);
    }
  });
}
/* offline-safe sending: client-chosen ids make retries idempotent */
const OUTBOX = "pc.outbox.v1";
const loadOutbox = () => { try { return JSON.parse(localStorage.getItem(OUTBOX) || "[]"); } catch { return []; } };
const saveOutbox = (a) => { try { localStorage.setItem(OUTBOX, JSON.stringify(a)); } catch {} };
const paintPending = (id) => { const t = S.nodes.get(id)?.querySelector(".ticks"); if (t) paintTicks(t, S.messages.get(id)); };
function sendQueued({ content, kind = "text", reply_to = null }) {
  const m = { id: crypto.randomUUID(), conversation_id: CONV, sender_id: S.me.id, content, kind, reply_to, created_at: new Date().toISOString(), _pending: true };
  saveOutbox([...loadOutbox(), { id: m.id, content, kind, reply_to, created_at: m.created_at }]);
  addMessage(m); rebuild(m.id); flushOne(m.id);
}
function restoreOutbox() {
  for (const o of loadOutbox()) if (!S.messages.has(o.id)) S.messages.set(o.id, { id: o.id, conversation_id: CONV, sender_id: S.me.id, content: o.content, kind: o.kind, reply_to: o.reply_to, created_at: o.created_at, _pending: true });
}
async function flushOne(id) {
  const m = S.messages.get(id); if (!m || !m._pending || m._sending) return;
  m._sending = true; m._failed = false; paintPending(id);
  let row = null, err = null;
  try { row = (await api("POST", "/api/messages", { id, content: m.content, kind: m.kind, reply_to: m.reply_to })).message; } catch (e) { err = e; }
  m._sending = false;
  if (err) { // same id on retry is safe: the server ignores duplicates
    if (!isNetworkError(err)) { m._failed = true; showError("Could not send: " + err.message); }
    paintPending(id); return;
  }
  saveOutbox(loadOutbox().filter((x) => x.id !== id));
  if (row && S.messages.get(id)?._pending) { S.messages.set(id, row); rebuild(id); pub({ t: "msg", row }); }
}
function flushAll() { for (const m of [...S.messages.values()]) if (m._pending && !m._failed) flushOne(m.id); }
function openPendingMenu(id) {
  const m = S.messages.get(id);
  showSheet((sheet, close) => {
    sheet.append(el("h2", "sheet-title", m._failed ? "Message not sent" : "Waiting to send"));
    if (m._failed) sheet.append(item("send", "Try again", () => { close(); m._failed = false; flushOne(id); }));
    sheet.append(item("trash", "Discard message", () => { close(); saveOutbox(loadOutbox().filter((x) => x.id !== id)); removeMessage(id); }, true));
  });
}
function openAttachSheet() {
  showSheet((sheet, close) => {
    const pick = (accept) => () => { close(); $("file").accept = accept; $("file").click(); };
    sheet.append(
      item("image", "Photos & videos", pick("image/*,video/*")),
      item("file", "File", pick("")),
      item("pinmap", "Location", () => { close(); extras.shareLocation(); }),
      item("calendar", "Schedule a message", () => { close(); extras.openSchedule($("text").value.trim()); })
    );
  });
}
/* drafts */
const DRAFT = "pc.draft.v1";
function saveDraft() {
  try {
    const t = $("text").value;
    if (!t && !S.reply) localStorage.removeItem(DRAFT);
    else localStorage.setItem(DRAFT, JSON.stringify({ t, r: S.reply?.id ?? null }));
  } catch {}
}
let draftTimer; const saveDraftSoon = () => { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 400); };
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || "null"); if (!d) return;
    if (d.t && !$("text").value) $("text").value = d.t;
    if (d.r && S.messages.has(d.r)) startReply(d.r);
    updateComposer();
  } catch {}
}
/* jump to latest */
function updateJump() {
  const l = $("messages"), far = l.scrollHeight - l.scrollTop - l.clientHeight > 400;
  if (!far) S.missed = 0;
  $("jump-btn").hidden = !far; $("jump-count").hidden = !S.missed; $("jump-count").textContent = S.missed;
}
/* files shared into the app from the phone's Share menu */
async function handleShare() {
  try {
    const r = await extras.readShare();
    if (r) { if (r.text) $("text").value = r.text; if (r.files.length) setFiles(r.files); updateComposer(); toast("Ready to send. Add a caption or press send.", 4000); }
  } catch {}
  history.replaceState(null, "", location.pathname);
}

/* ---------- live updates: broadcast pings + 15 s catch-up ---------- */
const pub = (payload) => { try { channel?.send({ type: "broadcast", event: "data", payload }); } catch {} };
function onData(p) {
  if (!p) return;
  if (p.t === "msg" && p.row) {
    const r = p.row, ex = S.messages.get(r.id);
    if (ex && !ex._pending) return applyUpdate(r);
    if (!ex && r.sender_id === S.partner.id && r.kind !== "call") { S.partnerTyping = false; renderStatus(); notifyIncoming(r); scheduleReceipts(); }
    addMessage(r);
  } else if (p.t === "del") removeMessage(p.id);
  else if (p.t === "clear") clearLocal();
  else if (p.t === "react") setReaction(p.message_id, p.user_id, p.emoji);
  else if (p.t === "rcpt") (p.ids || []).forEach((id) => { const m = S.messages.get(id); if (m) applyUpdate({ ...m, delivered_at: p.delivered_at ?? m.delivered_at, read_at: p.read_at ?? m.read_at }); });
  else if (p.t === "shared") extras?.refreshShared();
}
let polling = false;
async function pollSync() {
  if (polling || document.visibilityState !== "visible" || !S.me) return;
  polling = true;
  try { reconcile(await api("GET", "/api/sync")); } catch {} finally { polling = false; }
}
function reconcile(d) {
  const ids = new Set(d.messages.map((m) => m.id)), start = d.hasMore ? d.messages[0]?.created_at ?? "" : "";
  for (const m of d.messages) {
    const ex = S.messages.get(m.id);
    if (!ex) { if (m.sender_id === S.partner.id && m.kind !== "call") { notifyIncoming(m); scheduleReceipts(); } addMessage(m); }
    else if (ex._pending) addMessage(m); else applyUpdate(m);
  }
  for (const [id, m] of [...S.messages]) if (!ids.has(id) && !m._pending && m.created_at >= start) removeMessage(id);
  const want = new Map();
  d.reactions.forEach((r) => { if (!want.has(r.message_id)) want.set(r.message_id, new Map()); want.get(r.message_id).set(r.user_id, r.emoji); });
  for (const id of new Set([...S.reactions.keys(), ...want.keys()])) {
    const a = want.get(id) ?? new Map(), b = S.reactions.get(id) ?? new Map();
    if (a.size !== b.size || [...a].some(([u, e]) => b.get(u) !== e)) { S.reactions.set(id, a); renderReactions(id); }
  }
  S.pinCache = new Map(d.pins.map((m) => [m.id, m])); renderPinned();
}

/* ---------- heartbeat ---------- */
const beat = () => supabase.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", S.me.id);

/* ---------- init ---------- */
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; });

async function init() {
  applyTheme();
  if (!API_URL || API_URL.includes("REPLACE")) {
    $("boot").innerHTML = "Setup needed: put your Cloudflare Worker address in <b>js/config.js</b> (API_URL), then redeploy.";
    return;
  }
  navigator.serviceWorker?.register("sw.js").catch(() => {});
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return location.replace("login.html");
  initLock({ onForgot: async () => { clearPin(); await supabase.auth.signOut(); location.replace("login.html"); } });

  const { data: profiles, error } = await supabase.from("profiles").select("id, username, display_name, avatar_path, last_seen");
  if (error || !profiles?.length) return location.replace("login.html");
  profiles.forEach((p) => S.profiles.set(p.id, p));
  S.me = { id: session.user.id };
  S.partner = profiles.find((p) => p.id !== session.user.id);
  if (!S.partner) { document.body.textContent = "Your chat partner isn’t set up yet."; return; }
  await Promise.all(profiles.map((p) => loadAvatar(p.id)));

  $("partner-name").textContent = nice(S.partner.display_name);
  bindAvatar($("partner-avatar"), S.partner.id); bindAvatar($("me-btn"), S.me.id);
  for (const [id, ic] of [["attach-btn", "clip"], ["emoji-btn", "smile"], ["reply-cancel", "close"], ["edit-cancel", "close"], ["file-clear", "close"],
    ["rec-cancel", "trash"], ["rec-send", "send"], ["search-btn", "search"], ["call-btn", "phone"], ["video-btn", "video"]]) setIcon($(id), ic);
  updateComposer(); renderStatus(); buildEmojiPanel(); applyTheme();
  $("app").hidden = false; $("boot").hidden = true;

  if (sessionStorage.getItem("welcome")) {
    sessionStorage.removeItem("welcome");
    toast(`Hi ${nice(S.profiles.get(S.me.id).display_name)}, welcome 👋 Start chatting with ${nice(S.partner.display_name)} now.`, 6000);
  }

  let sync = { messages: [], hasMore: false, reactions: [], stars: [], pins: [] };
  const [syncRes, conv] = await Promise.all([
    api("GET", "/api/sync").catch((e) => { showError("Could not load your chats: " + e.message); return null; }),
    supabase.from("conversations").select("disappear_seconds").eq("id", CONV).maybeSingle(),
  ]);
  if (syncRes) sync = syncRes;
  const rows = sync.messages;
  S.hasMore = sync.hasMore;
  sync.reactions.forEach((r) => { if (!S.reactions.has(r.message_id)) S.reactions.set(r.message_id, new Map()); S.reactions.get(r.message_id).set(r.user_id, r.emoji); });
  sync.stars.forEach((id) => S.stars.add(id));
  sync.pins.forEach((m) => S.pinCache.set(m.id, m));
  S.disappear = conv.data?.disappear_seconds ?? null;
  rows.forEach((m) => S.messages.set(m.id, m));
  S.dividerId = rows.find((m) => m.sender_id === S.partner.id && !m.read_at && m.kind !== "call")?.id ?? null;
  restoreOutbox();
  renderAll(false); renderPinned(); renderInfo(); loadDraft();
  requestAnimationFrame(() => {
    const d = S.dividerId ? $("messages").querySelector(".unread-divider") : null;
    if (d) d.scrollIntoView({ block: "start" }); else scrollDown(true);
    updateJump();
  });
  $("messages").addEventListener("scroll", () => { if ($("messages").scrollTop < 80) loadOlder(); updateJump(); });

  extras = createExtras({ supabase, CONV, S, el, showSheet, item, toast, showError, sendText: (t) => sendQueued({ content: t }), pub });
  calls = initCalls({
    send: (payload) => channel?.send({ type: "broadcast", event: "call", payload }),
    partnerName: () => nice(S.partner.display_name), partnerOnline: () => S.partnerOnline, toast, beep, icons: ICON, turn: TURN_SERVERS,
    onLog: async (r) => {
      try {
        const { message } = await api("POST", "/api/messages", { kind: "call", content: `${r.video ? "video" : "voice"}|${r.outcome}|${r.seconds || 0}` });
        addMessage(message); pub({ t: "msg", row: message });
      } catch {}
    },
  });

  channel = supabase.channel("room:" + CONV, { config: { presence: { key: S.me.id } } })
    .on("broadcast", { event: "data" }, ({ payload }) => onData(payload))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${CONV}` }, (p) => { S.disappear = p.new.disappear_seconds; renderInfo(); })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, async (p) => {
      const cur = S.profiles.get(p.new.id); if (!cur) return;
      const changed = cur.avatar_path !== p.new.avatar_path;
      cur.avatar_path = p.new.avatar_path; cur.last_seen = p.new.last_seen;
      if (changed) { await loadAvatar(cur.id); repaintAvatars(cur.id); }
      if (cur.id === S.partner.id) renderStatus();
    })
    .on("presence", { event: "sync" }, () => {
      S.partnerOnline = !!channel.presenceState()[S.partner.id];
      if (!S.partnerOnline) S.partnerTyping = false;
      renderStatus();
    })
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload.id !== S.partner.id) return;
      S.partnerTyping = !!payload.typing; S.partnerKind = payload.kind || "typing"; clearTimeout(partnerTypingTimer);
      if (S.partnerTyping) partnerTypingTimer = setTimeout(() => { S.partnerTyping = false; renderStatus(); }, 4500);
      renderStatus(); if (S.partnerTyping) scrollDown(false);
    })
    .on("broadcast", { event: "call" }, ({ payload }) => calls.handle(payload))
    .subscribe((status) => { if (status === "SUBSCRIBED") channel.track({ at: new Date().toISOString() }); });

  scheduleReceipts(); purge(); refreshPush();
  beat(); setInterval(beat, 30000); setInterval(sweep, 10000); setInterval(purge, 60000);
  document.addEventListener("visibilitychange", () => {
    beat();
    if (document.visibilityState === "visible") { S.unread = 0; updateTitle(); scheduleReceipts(); pollSync(); }
  });
  addEventListener("focus", scheduleReceipts); addEventListener("pagehide", beat);
  addEventListener("online", () => { flushAll(); pollSync(); }); flushAll();
  setInterval(pollSync, 15000);
  if (location.search.includes("share=1")) handleShare();
  supabase.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") location.replace("login.html"); });
}

/* ---------- wiring ---------- */
$("me-btn").onclick = openMainMenu;
$("search-btn").onclick = openSearch;
$("call-btn").onclick = () => calls?.start(false);
$("video-btn").onclick = () => calls?.start(true);
$("pin-bar").onclick = () => {
  const l = pinnedList(); if (!l.length) return;
  goToMessage(l[S.pinIdx % l.length].id); S.pinIdx = (S.pinIdx + 1) % l.length; renderPinned();
};
$("attach-btn").onclick = openAttachSheet;
$("file").onchange = (e) => { if (e.target.files.length) setFiles([...e.target.files]); };
$("file-clear").onclick = () => setFiles([]);
$("once-btn").onclick = () => { S.viewOnce = !S.viewOnce; $("once-btn").classList.toggle("on", S.viewOnce); $("once-btn").textContent = S.viewOnce ? "👁 View once: on" : "👁 View once"; };
$("jump-btn").onclick = () => { S.missed = 0; $("messages").scrollTo({ top: $("messages").scrollHeight, behavior: "smooth" }); updateJump(); };
$("compress-skip").onclick = () => (skipCompress = true);
$("reply-cancel").onclick = clearReply;
$("edit-cancel").onclick = cancelEdit;
$("emoji-btn").onclick = () => ($("emoji-panel").hidden = !$("emoji-panel").hidden);
$("text").addEventListener("input", () => { updateComposer(); onTyping(); saveDraftSoon(); });
$("text").addEventListener("focus", () => ($("emoji-panel").hidden = true));
$("send-form").addEventListener("submit", (e) => { e.preventDefault(); submitSend(); });
$("action").onclick = () => (hasContent() || S.editing ? submitSend() : startRecording());
$("rec-cancel").onclick = () => finishRecording(false);
$("rec-send").onclick = () => finishRecording(true);

init();
