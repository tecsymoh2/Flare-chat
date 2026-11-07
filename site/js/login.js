import { supabase } from "./supabase.js";

const form = document.getElementById("login-form");
const errorEl = document.getElementById("error");
const submit = document.getElementById("submit");
const userInput = document.getElementById("username");

supabase.auth.getSession().then(({ data }) => {
  if (data.session) location.replace("chat.html");
});

// Tapping a name fills the username and jumps to the password.
document.querySelectorAll(".who").forEach((b) =>
  b.addEventListener("click", () => {
    userInput.value = b.dataset.user;
    document.getElementById("password").focus();
  })
);

// Cooldown after repeated wrong passwords. This is a convenience on this device only;
// the server also rate-limits sign-in attempts.
const FAIL_KEY = "pc.fails";
const readFails = () => { try { return JSON.parse(localStorage.getItem(FAIL_KEY) || "{}"); } catch { return {}; } };
const writeFails = (o) => { try { localStorage.setItem(FAIL_KEY, JSON.stringify(o)); } catch {} };
function lockedFor() { const f = readFails(); return f.until && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0; }

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  const wait = lockedFor();
  if (wait) { errorEl.textContent = `Too many tries. Wait ${wait < 60 ? wait + " seconds" : Math.ceil(wait / 60) + " minutes"} and try again.`; errorEl.hidden = false; return; }
  const username = userInput.value.trim().toLowerCase();
  const password = document.getElementById("password").value;
  if (!username || !password) {
    errorEl.textContent = "Enter your username and password.";
    errorEl.hidden = false;
    return;
  }
  submit.disabled = true;
  submit.textContent = "Signing in…";
  const { error } = await supabase.auth.signInWithPassword({
    email: `${username}@chat.local`,
    password,
  });
  if (error) {
    const f = readFails(), n = (f.n || 0) + 1;
    writeFails({ n, until: n >= 5 ? Date.now() + Math.min(15 * 60000, 30000 * 2 ** (n - 5)) : 0 });
    errorEl.textContent = "That username or password is not right.";
    errorEl.hidden = false;
    submit.disabled = false;
    submit.textContent = "Sign in";
    return;
  }
  writeFails({});
  sessionStorage.setItem("welcome", "1"); // chat page shows the welcome message once
  location.replace("chat.html");
});
