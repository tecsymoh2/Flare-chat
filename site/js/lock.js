// Local app lock: 4-digit PIN kept on this device only (salted SHA-256), locks when the app has been away or idle.
const K = { pin: "pc.pin", salt: "pc.salt", mins: "pc.lockmins" };
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const del = (k) => { try { localStorage.removeItem(k); } catch {} };

async function hash(pin, salt) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pin}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const lockEnabled = () => !!get(K.pin);
export const lockMinutes = () => Number(get(K.mins) ?? 1);
export const setLockMinutes = (m) => set(K.mins, String(m));
export async function setPin(pin) {
  const salt = crypto.getRandomValues(new Uint32Array(2)).join("-");
  set(K.salt, salt); set(K.pin, await hash(pin, salt));
}
export const clearPin = () => { del(K.pin); del(K.salt); };
export async function verifyPin(pin) { return (await hash(pin, get(K.salt) ?? "")) === get(K.pin); }

/** Full-screen keypad. Resolves with the 4 digits, or null if cancelled (when cancellable). */
export function askPin({ title, subtitle = "", cancellable = true, check = null, onForgot = null }) {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "overlay pinpad";
    const box = document.createElement("div");
    box.className = "pin-box";
    box.innerHTML = `<h2></h2><p class="muted"></p><div class="dots"><i></i><i></i><i></i><i></i></div><div class="keys"></div><div class="pin-links"></div>`;
    box.querySelector("h2").textContent = title;
    box.querySelector("p").textContent = subtitle;
    const dots = [...box.querySelectorAll(".dots i")];
    let val = "";
    const paint = () => dots.forEach((d, i) => d.classList.toggle("on", i < val.length));
    async function press(k) {
      if (k === "⌫") val = val.slice(0, -1);
      else if (val.length < 4) val += k;
      paint();
      if (val.length === 4) {
        const ok = check ? await check(val) : true;
        if (ok) { ov.remove(); resolve(val); }
        else { box.classList.add("shake"); setTimeout(() => box.classList.remove("shake"), 400); val = ""; paint(); }
      }
    }
    const keys = box.querySelector(".keys");
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].forEach((k) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = k; b.disabled = !k;
      b.onclick = () => press(k); keys.append(b);
    });
    const links = box.querySelector(".pin-links");
    if (cancellable) { const c = document.createElement("button"); c.type = "button"; c.textContent = "Cancel"; c.onclick = () => { ov.remove(); resolve(null); }; links.append(c); }
    if (onForgot) { const f = document.createElement("button"); f.type = "button"; f.textContent = "Forgot PIN? Sign out"; f.onclick = onForgot; links.append(f); }
    ov.append(box); document.body.append(ov);
  });
}

/** Locks on startup, after being away, or after idling for the chosen time. */
export function initLock({ onForgot }) {
  let locked = false, hiddenAt = 0, idle;
  async function lock() {
    if (!lockEnabled() || locked) return;
    locked = true;
    document.getElementById("app")?.classList.add("blurred");
    await askPin({ title: "Enter your PIN", subtitle: "Private Chat is locked", cancellable: false, check: verifyPin, onForgot });
    locked = false;
    document.getElementById("app")?.classList.remove("blurred");
    arm();
  }
  function arm() {
    clearTimeout(idle);
    if (lockEnabled()) idle = setTimeout(lock, lockMinutes() * 60000);
  }
  ["pointerdown", "keydown", "scroll"].forEach((e) => addEventListener(e, () => !locked && arm(), { passive: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else if (lockEnabled() && hiddenAt && Date.now() - hiddenAt >= lockMinutes() * 60000) lock();
  });
  lock(); arm();
  return { lock };
}
