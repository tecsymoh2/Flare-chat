// 1:1 voice/video calls over WebRTC. Signalling travels through the Supabase Realtime channel.
// STUN by default; add TURN_SERVERS in config.js for strict networks.
const STUN = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

export function initCalls({ send, partnerName, partnerOnline, toast, beep, icons, turn = [], onLog }) {
  const ICE = { iceServers: [...STUN, ...turn] };
  let pc = null, local = null, state = "idle", video = false, ringTimer, tick, startedAt = 0, queued = [], role = null;

  const root = document.createElement("div");
  root.className = "call"; root.hidden = true;
  root.innerHTML = `
    <video id="c-remote" autoplay playsinline></video>
    <div class="call-top"><h2 id="c-name"></h2><p id="c-status"></p></div>
    <video id="c-local" autoplay playsinline muted></video>
    <div class="call-btns">
      <button type="button" id="c-accept" class="cb accept" aria-label="Accept"></button>
      <button type="button" id="c-mute" class="cb" aria-label="Mute"></button>
      <button type="button" id="c-cam" class="cb" aria-label="Camera"></button>
      <button type="button" id="c-end" class="cb end" aria-label="End call"></button>
    </div>`;
  document.body.append(root);
  const q = (id) => root.querySelector("#" + id);
  q("c-accept").innerHTML = icons.phone; q("c-mute").innerHTML = icons.mic;
  q("c-cam").innerHTML = icons.video; q("c-end").innerHTML = icons.phone;

  const setStatus = (t) => (q("c-status").textContent = t);
  const sig = (o) => send(o);

  function show(mode) { // mode: ringing | calling | active
    root.hidden = false; q("c-name").textContent = partnerName();
    q("c-accept").hidden = mode !== "ringing";
    q("c-mute").hidden = q("c-cam").hidden = mode === "ringing";
    q("c-cam").hidden = q("c-cam").hidden || !video;
    root.classList.toggle("voice-only", !video);
  }
  async function getLocal() {
    if (local) return local;
    local = await navigator.mediaDevices.getUserMedia({ audio: true, video });
    q("c-local").srcObject = local; q("c-local").hidden = !video;
    return local;
  }
  function end(msg, outcome) {
    const wasActive = state === "active", secs = wasActive ? Math.floor((Date.now() - startedAt) / 1000) : 0;
    if (role === "caller") { if (wasActive) onLog?.({ video, outcome: "ended", seconds: secs }); else if (outcome) onLog?.({ video, outcome, seconds: 0 }); }
    role = null;
    clearTimeout(ringTimer); clearInterval(tick);
    try { pc?.close(); } catch {}
    local?.getTracks().forEach((t) => t.stop());
    pc = local = null; queued = []; state = "idle";
    q("c-remote").srcObject = null; root.hidden = true;
    if (msg) toast(msg, 3500);
  }
  function makePc() {
    pc = new RTCPeerConnection(ICE);
    local.getTracks().forEach((t) => pc.addTrack(t, local));
    pc.ontrack = (e) => { q("c-remote").srcObject = e.streams[0]; };
    pc.onicecandidate = (e) => e.candidate && sig({ t: "ice", c: e.candidate });
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        state = "active"; show("active"); startedAt = Date.now();
        tick = setInterval(() => {
          const s = Math.floor((Date.now() - startedAt) / 1000);
          setStatus(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
        }, 500);
      } else if (pc.connectionState === "failed") {
        sig({ t: "hangup" }); end("Couldn’t connect. Your networks may block direct calls.");
      }
    };
  }
  async function flush() { for (const c of queued.splice(0)) await pc.addIceCandidate(c).catch(() => {}); }

  async function start(withVideo) {
    if (state !== "idle") return;
    if (!partnerOnline()) return toast(`${partnerName()} is offline right now.`);
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) return toast("Calls aren’t supported in this browser.");
    video = withVideo; state = "calling"; role = "caller";
    try { await getLocal(); } catch { end("Allow microphone" + (video ? " and camera" : "") + " access to call."); return; }
    show("calling"); setStatus("Calling…");
    sig({ t: "invite", video });
    ringTimer = setTimeout(() => { if (state === "calling") { sig({ t: "cancel" }); end("No answer.", "missed"); } }, 35000);
  }

  async function handle(p) {
    try {
      switch (p.t) {
        case "invite":
          if (state !== "idle") return sig({ t: "busy" });
          state = "ringing"; role = "callee"; video = !!p.video; show("ringing");
          setStatus(video ? "Incoming video call…" : "Incoming voice call…");
          beep?.(); ringTimer = setTimeout(() => { if (state === "ringing") end("Missed call."); }, 35000);
          break;
        case "cancel": if (state === "ringing") end("Missed call."); break;
        case "busy": case "decline": if (state === "calling") end(p.t === "busy" ? "They’re on another call." : "Call declined.", "declined"); break;
        case "accept":
          if (state !== "calling") return;
          clearTimeout(ringTimer); state = "connecting"; setStatus("Connecting…");
          makePc(); { const o = await pc.createOffer(); await pc.setLocalDescription(o); sig({ t: "offer", d: o }); }
          break;
        case "offer":
          if (state !== "connecting") return;
          makePc(); await pc.setRemoteDescription(p.d); await flush();
          { const a = await pc.createAnswer(); await pc.setLocalDescription(a); sig({ t: "answer", d: a }); }
          break;
        case "answer": if (pc) { await pc.setRemoteDescription(p.d); await flush(); } break;
        case "ice": if (pc?.remoteDescription) await pc.addIceCandidate(p.c).catch(() => {}); else queued.push(p.c); break;
        case "hangup": if (state !== "idle") end("Call ended."); break;
      }
    } catch (e) { end("Call failed: " + (e.message || e)); }
  }

  q("c-accept").onclick = async () => {
    clearTimeout(ringTimer);
    try { await getLocal(); } catch { sig({ t: "decline" }); return end("Allow microphone access to answer."); }
    state = "connecting"; show("calling"); setStatus("Connecting…"); sig({ t: "accept" });
  };
  q("c-end").onclick = () => {
    if (state === "ringing") sig({ t: "decline" });
    else if (state === "calling") sig({ t: "cancel" });
    else sig({ t: "hangup" });
    end(state === "active" ? "Call ended." : "", state === "calling" ? "cancelled" : undefined);
  };
  q("c-mute").onclick = (e) => {
    const t = local?.getAudioTracks()[0]; if (!t) return;
    t.enabled = !t.enabled; e.currentTarget.classList.toggle("off", !t.enabled);
  };
  q("c-cam").onclick = (e) => {
    const t = local?.getVideoTracks()[0]; if (!t) return;
    t.enabled = !t.enabled; e.currentTarget.classList.toggle("off", !t.enabled);
  };
  return { start, handle, busy: () => state !== "idle" };
}
