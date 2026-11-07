// Extra features: scheduled messages, shared list + countdowns, sessions, password change, location, share target.
import { api } from "./api.js";

export function createExtras(c) {
  const { supabase, CONV, S, el, showSheet, item, toast, showError, sendText, pub } = c;
  const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const fmtWhen = (d) => new Date(d).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  /* ----- scheduled messages ----- */
  function openSchedule(prefill = "") {
    showSheet((sheet) => {
      sheet.classList.add("tall");
      sheet.append(el("h2", "sheet-title", "Schedule a message"), el("p", "muted", "It is sent automatically at the time you pick, even if the app is closed."));
      const ta = el("textarea", "sched-text"); ta.rows = 3; ta.placeholder = "Message"; ta.value = prefill;
      const when = el("input", "sched-when"); when.type = "datetime-local";
      const soon = new Date(Date.now() + 3600e3); soon.setMinutes(Math.ceil(soon.getMinutes() / 5) * 5, 0, 0);
      when.value = toLocalInput(soon); when.min = toLocalInput(new Date());
      const go = el("button", "btn-primary", "Schedule"); go.type = "button";
      const list = el("div", "results");
      async function refresh() {
        let data = []; try { data = (await api("GET", "/api/scheduled")).items; } catch (err) { showError(err.message); }
        list.textContent = "";
        if (!data?.length) return list.append(el("p", "muted center-text", "Nothing scheduled."));
        list.append(el("h3", null, "Scheduled"));
        data.forEach((s) => {
          const row = el("div", "srow");
          const txt = el("span", null, `${fmtWhen(s.send_at)} · ${s.content.slice(0, 80)}`);
          const x = el("button", "x", "✕"); x.type = "button"; x.setAttribute("aria-label", "Cancel scheduled message");
          x.onclick = async () => { try { await api("DELETE", `/api/scheduled/${s.id}`); } catch (err) { showError(err.message); } refresh(); };
          row.append(txt, x); list.append(row);
        });
      }
      go.onclick = async () => {
        const text = ta.value.trim(), at = new Date(when.value);
        if (!text) return toast("Write a message first.", 2000);
        if (!(at > new Date(Date.now() + 30000))) return toast("Pick a time at least a minute from now.", 3000);
        try { await api("POST", "/api/scheduled", { content: text, send_at: at.toISOString() }); } catch (err) { return showError("Could not schedule: " + err.message); }
        ta.value = ""; toast("Scheduled for " + fmtWhen(at), 3000); refresh();
      };
      sheet.append(ta, when, go, list); refresh();
    });
  }

  /* ----- shared list + countdowns ----- */
  let sharedRoot = null;
  async function renderShared() {
    const root = sharedRoot; if (!root || !document.body.contains(root)) return;
    let data; try { data = (await api("GET", "/api/shared")).items; } catch (err) { return showError(err.message); }
    root.textContent = "";
    const todos = data.filter((x) => x.kind === "todo");
    const cds = data.filter((x) => x.kind === "countdown").sort((a, b) => new Date(a.target_at) - new Date(b.target_at));
    const add = async (row) => { try { await api("POST", "/api/shared", row); pub?.({ t: "shared" }); renderShared(); } catch (err) { showError(err.message); } };
    const rm = async (id) => { try { await api("DELETE", `/api/shared/${id}`); pub?.({ t: "shared" }); } catch (err) { showError(err.message); } renderShared(); };

    root.append(el("h3", null, "To-do"));
    const f1 = el("div", "inline-form"), i1 = el("input"); i1.placeholder = "Add an item"; i1.maxLength = 200;
    const b1 = el("button", "btn-small", "Add"); b1.type = "button";
    b1.onclick = () => { const t = i1.value.trim(); if (t) add({ kind: "todo", title: t }); };
    i1.addEventListener("keydown", (e) => { if (e.key === "Enter") b1.click(); });
    f1.append(i1, b1); root.append(f1);
    todos.forEach((t) => {
      const row = el("div", "srow"), chk = el("button", "chk" + (t.done ? " on" : ""), t.done ? "✓" : ""); chk.type = "button";
      chk.onclick = async () => { try { await api("PATCH", `/api/shared/${t.id}`, { done: !t.done }); pub?.({ t: "shared" }); } catch (err) { showError(err.message); } renderShared(); };
      const x = el("button", "x", "✕"); x.type = "button"; x.onclick = () => rm(t.id);
      row.append(chk, el("span", t.done ? "done" : "", t.title), x); root.append(row);
    });
    if (!todos.length) root.append(el("p", "muted", "Nothing here yet."));

    root.append(el("h3", null, "Countdowns"));
    const f2 = el("div", "inline-form"), i2 = el("input"), d2 = el("input"); i2.placeholder = "What are you counting down to?"; i2.maxLength = 200; d2.type = "date";
    const b2 = el("button", "btn-small", "Add"); b2.type = "button";
    b2.onclick = () => { const t = i2.value.trim(); if (t && d2.value) add({ kind: "countdown", title: t, target_at: new Date(d2.value + "T00:00:00").toISOString() }); else toast("Add a name and a date.", 2000); };
    f2.append(i2, d2, b2); root.append(f2);
    cds.forEach((cd) => {
      const days = Math.round((new Date(cd.target_at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
      const label = days === 0 ? "today" : days > 0 ? `in ${days} day${days === 1 ? "" : "s"}` : `${-days} day${days === -1 ? "" : "s"} ago`;
      const row = el("div", "srow"), x = el("button", "x", "✕"); x.type = "button"; x.onclick = () => rm(cd.id);
      const txt = el("span"); txt.append(el("b", null, cd.title), document.createTextNode(` · ${new Date(cd.target_at).toLocaleDateString()} · ${label}`));
      row.append(txt, x); root.append(row);
    });
    if (!cds.length) root.append(el("p", "muted", "No countdowns yet."));
  }
  function openShared() {
    showSheet((sheet) => {
      sheet.classList.add("tall"); sheet.append(el("h2", "sheet-title", "Shared list & countdowns"));
      sharedRoot = el("div", "shared"); sheet.append(sharedRoot); renderShared();
    });
  }

  /* ----- sessions + password ----- */
  const deviceLabel = (ua = "") => {
    const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iOS/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "";
    const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
    return br || os ? `${br || "Browser"}${os ? " on " + os : ""}` : "Unknown device";
  };
  function openSessions() {
    showSheet((sheet, close) => {
      sheet.classList.add("tall"); sheet.append(el("h2", "sheet-title", "Where you’re signed in"));
      const list = el("div", "results");
      async function refresh() {
        const { data, error } = await supabase.rpc("list_my_sessions");
        list.textContent = "";
        if (error) return list.append(el("p", "muted", "Couldn’t load sessions: " + error.message));
        data.forEach((s) => {
          const row = el("div", "srow session"), info = el("span");
          info.append(el("b", null, deviceLabel(s.user_agent) + (s.is_current ? " (this device)" : "")), document.createTextNode(` · last active ${fmtWhen(s.updated_at || s.created_at)}`));
          row.append(info);
          if (!s.is_current) {
            const b = el("button", "btn-small danger", "Sign out"); b.type = "button";
            b.onclick = async () => { await supabase.rpc("revoke_session", { p_id: s.id }); refresh(); };
            row.append(b);
          }
          list.append(row);
        });
      }
      const all = el("button", "btn-ghost", "Sign out all other devices"); all.type = "button";
      all.onclick = async () => { await supabase.auth.signOut({ scope: "others" }); toast("Signed out everywhere else.", 3000); refresh(); };
      sheet.append(list, all); refresh();
    });
  }
  function openChangePassword() {
    showSheet((sheet, close) => {
      sheet.append(el("h2", "sheet-title", "Change password"));
      const mk = (ph, ac) => { const i = el("input", "pw-input"); i.type = "password"; i.placeholder = ph; i.autocomplete = ac; return i; };
      const cur = mk("Current password", "current-password"), nxt = mk("New password (8+ characters)", "new-password"), con = mk("Repeat new password", "new-password");
      const msg = el("p", "form-error"); msg.hidden = true;
      const go = el("button", "btn-primary", "Update password"); go.type = "button";
      go.onclick = async () => {
        msg.hidden = false; msg.className = "form-error";
        if (nxt.value.length < 8) return (msg.textContent = "Use at least 8 characters.");
        if (nxt.value !== con.value) return (msg.textContent = "The new passwords don’t match.");
        go.disabled = true;
        const { data: { user } } = await supabase.auth.getUser();
        const chk = await supabase.auth.signInWithPassword({ email: user.email, password: cur.value });
        if (chk.error) { go.disabled = false; return (msg.textContent = "Your current password isn’t right."); }
        const { error } = await supabase.auth.updateUser({ password: nxt.value });
        go.disabled = false;
        if (error) return (msg.textContent = error.message);
        close(); toast("Password updated.", 3000);
      };
      sheet.append(cur, nxt, con, msg, go);
    });
  }

  /* ----- location + share target ----- */
  function shareLocation() {
    if (!navigator.geolocation) return toast("Location isn’t available on this device.", 3000);
    toast("Getting your location…", 6000);
    navigator.geolocation.getCurrentPosition(
      (p) => sendText(`📍 My location\nhttps://www.google.com/maps?q=${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`),
      () => toast("Couldn’t get your location. Allow location access and try again.", 4000),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }
  async function readShare() {
    if (!("caches" in window)) return null;
    const cache = await caches.open("share"), keys = await cache.keys();
    if (!keys.length) return null;
    const files = []; let text = "";
    for (const req of keys) {
      const res = await cache.match(req);
      if (req.url.endsWith("/shared/text")) text = await res.text();
      else { const blob = await res.blob(); files.push(new File([blob], decodeURIComponent(res.headers.get("X-Name") || "shared"), { type: blob.type })); }
      await cache.delete(req);
    }
    return { files, text };
  }
  return { openSchedule, openShared, refreshShared: renderShared, openSessions, openChangePassword, shareLocation, readShare };
}
