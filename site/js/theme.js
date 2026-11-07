// Per-device theme + wallpaper (stored in localStorage; try/catch for private modes).
export const THEMES = {
  Teal: ["#0f8a7e", "#0b6f7a"], Indigo: ["#4f46e5", "#3730a3"], Rose: ["#e11d48", "#be123c"],
  Amber: ["#d97706", "#b45309"], Slate: ["#475569", "#1e293b"],
};
export const WALLS = ["Plain", "Dots", "Grid", "Glow"];
const get = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

export function applyTheme() {
  const [a, b] = THEMES[get("pc.theme", "Teal")] ?? THEMES.Teal;
  const r = document.documentElement.style;
  r.setProperty("--mine-a", a); r.setProperty("--mine-b", b); r.setProperty("--accent", a);
  r.setProperty("--accent-soft", `color-mix(in srgb, ${a} 16%, var(--surface))`);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", a);
  const m = document.getElementById("messages");
  if (m) m.dataset.wall = get("pc.wall", "Plain");
}
export const currentTheme = () => get("pc.theme", "Teal");
export const currentWall = () => get("pc.wall", "Plain");
export const chooseTheme = (n) => { set("pc.theme", n); applyTheme(); };
export const chooseWall = (n) => { set("pc.wall", n); applyTheme(); };
export const soundOn = () => get("pc.sound", "1") === "1";
export const setSound = (on) => set("pc.sound", on ? "1" : "0");

// Notification mute (per device; also synced to the server so push respects it)
export const getMuteUntil = () => Number(get("pc.mute", "0")) || 0;
export const setMuteUntil = (ms) => set("pc.mute", String(ms || 0));
export const isMuted = () => getMuteUntil() > Date.now();
