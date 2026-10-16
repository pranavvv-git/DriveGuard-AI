/* DriveGuard AI — interactive explainer
 * Edit CONFIG below with your own links. */
const CONFIG = {
  githubUrl:   "https://github.com/pranavvv-git/DriveGuard-AI",
  linkedinUrl: "https://www.linkedin.com/in/pranav-thakur-60a721416/",
};

/* Illustrative thresholds for this web demo (tune freely) */
const T = {
  EAR_CLOSED: 0.21,   // below this the eye counts as closed
  BLINK_MS:   400,    // closed longer than this = warning sign
  DROWSY_MS:  1200,   // closed longer than this = strong sign
  MAR_YAWN:   0.60,   // mouth aspect ratio above this = yawn
  YAWN_MS:    1000,
  HEAD_OFF:   1.0,    // normalised head turn/tilt score
  HEAD_MS:    1500,
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- links ---------- */
[["gh-nav", CONFIG.githubUrl], ["gh-foot", CONFIG.githubUrl], ["li-foot", CONFIG.linkedinUrl]].forEach(([id, url]) => {
  const el = document.getElementById(id);
  if (el) el.href = url;
});

/* ---------- decision engine (shared by simulator + live demo) ---------- */
class Engine {
  constructor() { this.reset(); }
  reset() { this.closedMs = 0; this.yawnMs = 0; this.headMs = 0; this.state = "normal"; this.points = 0; }
  update({ ear, mar = 0, head = 0 }, dt) {
    this.closedMs = ear < T.EAR_CLOSED ? this.closedMs + dt : 0;
    this.yawnMs   = mar > T.MAR_YAWN ? this.yawnMs + dt : 0;
    this.headMs   = head > T.HEAD_OFF ? this.headMs + dt : 0;
    const p =
      (this.closedMs >= T.BLINK_MS ? 1 : 0) +
      (this.closedMs >= T.DROWSY_MS ? 2 : 0) +
      (this.yawnMs >= T.YAWN_MS ? 1 : 0) +
      (this.headMs >= T.HEAD_MS ? 1 : 0);
    this.points = p;
    this.state = p >= 3 ? "drowsy" : p >= 1 ? "warning" : "normal";
    return this;
  }
}

/* ---------- audio + flash ---------- */
const sound = { on: false, ctx: null, last: 0 };
function beep() {
  if (!sound.on) return;
  const now = performance.now();
  if (now - sound.last < 700) return;
  sound.last = now;
  try {
    sound.ctx = sound.ctx || new (window.AudioContext || window.webkitAudioContext)();
    const o = sound.ctx.createOscillator(), g = sound.ctx.createGain();
    o.type = "square"; o.frequency.value = 880;
    g.gain.value = 0.06;
    o.connect(g); g.connect(sound.ctx.destination);
    o.start(); o.stop(sound.ctx.currentTime + 0.25);
  } catch (e) { /* audio unavailable */ }
}
const flashEl = $("#flash");
function setFlash(on) { flashEl.classList.toggle("on", on); }

$("#sound-toggle").addEventListener("click", e => {
  sound.on = !sound.on;
  e.target.textContent = sound.on ? "🔊 Sound on" : "🔇 Sound off";
  if (sound.on) { sound.last = 0; beep(); }
});

/* ---------- eye drawing ---------- */
function eyePaths(o) { // o: 0 closed .. 1 open
  const top = 70 - 62 * o, bot = 70 + 46 * o;
  const d = `M16,70 Q150,${top} 284,70 Q150,${bot} 16,70 Z`;
  return d;
}
function bindEye(prefix) {
  const out = $("#" + prefix + "-outline"), clip = $("#" + prefix + "-clip-path");
  return o => { const d = eyePaths(o); out.setAttribute("d", d); clip.setAttribute("d", d); };
}
const earToOpen = ear => Math.max(0, Math.min(1, (ear - 0.10) / 0.22));

/* ---------- dashboard widget ---------- */
function makeDash(root, { showHead = true } = {}) {
  root.innerHTML = `
    <div class="card dash">
      <div class="status-pill" data-state="normal"><span class="led"></span><b class="st">NORMAL</b></div>
      <div class="rows">
        <div class="cell"><span>Eye status</span><b class="eye">OPEN</b></div>
        <div class="cell"><span>Yawning</span><b class="yawn">NO</b></div>
        <div class="cell"><span>EAR</span><b class="ear">–</b></div>
        <div class="cell"><span>MAR</span><b class="mar">–</b></div>
        <div class="cell"><span>Head</span><b class="head">STEADY</b></div>
        <div class="cell"><span>Risk points</span><b class="pts">0 / 3</b></div>
      </div>
      <div>
        <div class="bar-label"><span>Eyes closed for</span><span class="closed-ms">0 ms</span></div>
        <div class="bar"><i class="closed-bar"></i></div>
      </div>
      <div class="alert-box">🔔 Alert: idle</div>
    </div>`;
  const q = s => $(s, root);
  const pill = q(".status-pill");
  return (m, eng) => {
    const label = eng.state === "drowsy" ? "DROWSY" : eng.state === "warning" ? "WARNING" : "NORMAL";
    pill.dataset.state = eng.state;
    q(".st").textContent = label;
    q(".eye").textContent = m.ear < T.EAR_CLOSED ? "CLOSED" : "OPEN";
    q(".yawn").textContent = eng.yawnMs > 0 ? "YAWNING" : "NO";
    q(".ear").textContent = m.ear.toFixed(2);
    q(".mar").textContent = (m.mar || 0).toFixed(2);
    q(".head").textContent = eng.headMs > 0 ? "OFF-AXIS" : "STEADY";
    q(".pts").textContent = Math.min(eng.points, 3) + " / 3";
    const pct = Math.min(100, (eng.closedMs / T.DROWSY_MS) * 100);
    const bar = q(".closed-bar");
    bar.style.width = pct + "%";
    bar.style.background = eng.state === "drowsy" ? "var(--bad)" : eng.closedMs >= T.BLINK_MS ? "var(--warn)" : "var(--ok)";
    q(".closed-ms").textContent = Math.round(eng.closedMs) + " ms";
    const box = q(".alert-box");
    const on = eng.state === "drowsy";
    box.classList.toggle("on", on);
    box.textContent = on ? "🔔 ALERT ACTIVE — wake up!" : "🔔 Alert: idle";
  };
}

/* ---------- hero eye: scripted loop ---------- */
(() => {
  const draw = bindEye("hero");
  const status = $("#hero-status"), label = $("b", status);
  const eng = new Engine();
  let t = 0, last = performance.now();
  // scripted timeline (ms): [start, end, ear]
  const loop = 9000;
  const ear = ms => {
    if (ms > 1800 && ms < 1980) return 0.12;           // blink
    if (ms > 4200 && ms < 5900) return 0.12;           // eyes closed long
    return 0.32;
  };
  let cur = 0.32;
  function tick(now) {
    const dt = Math.min(100, now - last); last = now; t = (t + dt) % loop;
    if (t < dt) eng.reset();
    const target = ear(t);
    cur += (target - cur) * Math.min(1, dt / 45);
    eng.update({ ear: target }, dt);
    draw(earToOpen(cur));
    status.dataset.state = eng.state;
    label.textContent = eng.state.toUpperCase();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

/* ---------- problem chain ---------- */
(() => {
  const info = [
    ["Long & night-time driving", "Long-distance and night driving can make a driver feel tired and sleepy."],
    ["Tiredness builds", "Mental fatigue accumulates and reaction time slowly gets worse."],
    ["Loss of attention", "When a driver becomes sleepy, it is difficult to stay focused on the road."],
    ["Eyes close for too long", "During drowsiness the eyes stay closed longer than a normal blink."],
    ["Risk", "Without an early warning, sleepiness turns into a dangerous situation. A system must watch the face continuously and alert at the first signs."],
  ];
  const box = $("#chain-detail");
  const steps = $$(".chain-step");
  const show = i => {
    steps.forEach((s, k) => s.classList.toggle("active", k === i));
    box.innerHTML = `<h3>${info[i][0]}</h3><p>${info[i][1]}</p>`;
  };
  steps.forEach(s => s.addEventListener("click", () => show(+s.dataset.i)));
  show(0);
})();

/* ---------- pipeline ---------- */
(() => {
  const stages = [
    ["📷", "Camera input", "Captures the driver's face frame by frame from the webcam.", "OpenCV VideoCapture → BGR frame"],
    ["👤", "Face detection", "Finds the driver's face in each frame.", "MediaPipe Face Mesh"],
    ["📍", "Facial landmarks", "Locates key points around the eyes, mouth and face outline.", "468 landmarks per face"],
    ["🔍", "Feature extraction", "Computes eye openness, mouth opening and head position from the landmarks.", "EAR, MAR, head turn / tilt  (NumPy)"],
    ["🧠", "Drowsiness analysis", "Combines the signs over time and decides the risk level: Normal, Warning or Drowsy.", "Time-based thresholds on each feature"],
    ["🔔", "Audio alert", "Warns the driver as soon as the drowsy limit is reached.", "Beep + red status on the dashboard"],
  ];
  const wrap = $("#pipeline"), detail = $("#pipe-detail");
  wrap.innerHTML = stages.map((s, i) => `<button class="node" data-i="${i}"><small>0${i + 1}</small><i>${s[0]}</i>${s[1]}</button>`).join("");
  const nodes = $$(".node", wrap);
  let cur = 0, timer;
  const select = (i, manual) => {
    cur = i;
    nodes.forEach((n, k) => { n.classList.toggle("active", k === i); n.classList.toggle("done", k < i); });
    detail.innerHTML = `<h3>${stages[i][0]} ${stages[i][1]}</h3><p>${stages[i][2]}</p><p class="mono">${stages[i][3]}</p>`;
    if (manual) { clearInterval(timer); timer = setInterval(() => select((cur + 1) % stages.length), 3200); }
  };
  nodes.forEach((n, i) => n.addEventListener("click", () => select(i, true)));
  select(0);
  timer = setInterval(() => select((cur + 1) % stages.length), 3200);
})();

/* ---------- threshold list ---------- */
$("#rule-grid").innerHTML = [
  ["Eye closed if EAR <", T.EAR_CLOSED],
  ["Normal blink up to", T.BLINK_MS + " ms"],
  ["Warning sign after", T.BLINK_MS + " ms closed"],
  ["Strong sign after", T.DROWSY_MS + " ms closed"],
  ["Yawn if MAR >", T.MAR_YAWN + " for " + T.YAWN_MS + " ms"],
  ["Head sign after", T.HEAD_MS + " ms off-axis"],
  ["Warning at", "≥ 1 point"],
  ["Drowsy + alert at", "≥ 3 points"],
].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");

/* ---------- simulator ---------- */
(() => {
  const draw = bindEye("sim");
  const update = makeDash($("#sim-dash"));
  const slider = $("#sim-ear"), val = $("#sim-ear-val");
  const yawn = $("#sim-yawn"), head = $("#sim-head");
  const canvas = $("#sim-chart"), ctx = canvas.getContext("2d");
  const eng = new Engine();
  let ear = +slider.value, override = null, hist = [], last = performance.now();
  const WINDOW = 8000;

  slider.addEventListener("input", () => { ear = +slider.value; override = null; });
  const hold = (v, ms) => {
    const prev = ear;
    override = v;
    setTimeout(() => { override = null; ear = prev; slider.value = prev; }, ms);
  };
  $("#sim-blink").addEventListener("click", () => hold(0.11, 170));
  $("#sim-micro").addEventListener("click", () => hold(0.11, 2500));

  function chart() {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const y = e => h - 12 - ((e - 0.08) / 0.32) * (h - 24);
    ctx.setLineDash([6, 5]); ctx.strokeStyle = "#93a0b8"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y(T.EAR_CLOSED)); ctx.lineTo(w, y(T.EAR_CLOSED)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#93a0b8"; ctx.font = "12px JetBrains Mono, monospace";
    ctx.fillText("closed threshold " + T.EAR_CLOSED, 8, y(T.EAR_CLOSED) - 6);
    const now = performance.now();
    const col = { normal: "#34d399", warning: "#fbbf24", drowsy: "#f43f5e" };
    for (let i = 1; i < hist.length; i++) {
      const a = hist[i - 1], b = hist[i];
      ctx.strokeStyle = col[b.s]; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(w - ((now - a.t) / WINDOW) * w, y(a.e));
      ctx.lineTo(w - ((now - b.t) / WINDOW) * w, y(b.e));
      ctx.stroke();
    }
  }

  function tick(now) {
    const dt = Math.min(100, now - last); last = now;
    const e = override ?? ear;
    const m = { ear: e, mar: yawn.checked ? 0.75 : 0.2, head: head.checked ? 1.6 : 0 };
    eng.update(m, dt);
    val.textContent = e.toFixed(2);
    if (override !== null) slider.value = e;
    draw(earToOpen(e));
    update(m, eng);
    hist.push({ t: now, e, s: eng.state });
    while (hist.length && now - hist[0].t > WINDOW) hist.shift();
    chart();
    if (inView.sim) { setFlash(eng.state === "drowsy"); if (eng.state === "drowsy") beep(); }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

/* track which interactive section is in view (for flash/beep) */
const inView = { sim: false, live: false };
new IntersectionObserver(es => es.forEach(e => {
  if (e.target.id === "simulator") inView.sim = e.isIntersecting;
  if (e.target.id === "live") inView.live = e.isIntersecting;
  if (!e.isIntersecting) setFlash(false);
}), { threshold: 0.2 }).observe($("#simulator"));
new IntersectionObserver(es => es.forEach(e => {
  inView.live = e.isIntersecting; if (!e.isIntersecting) setFlash(false);
}), { threshold: 0.2 }).observe($("#live"));

/* ---------- live webcam demo ---------- */
(() => {
  const update = makeDash($("#live-dash"));
  const video = $("#cam"), overlay = $("#overlay"), octx = overlay.getContext("2d");
  const msg = $("#video-msg"), badge = $("#video-badge");
  const startBtn = $("#cam-start"), stopBtn = $("#cam-stop");
  const eng = new Engine();
  // first paint of dashboard
  update({ ear: 0.3, mar: 0 }, eng);

  const VER = "0.10.14";
  const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
  const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
  const L_EYE = [362, 385, 387, 263, 373, 380];
  const R_EYE = [33, 160, 158, 133, 153, 144];

  let landmarker = null, stream = null, running = false, lastTs = 0, lastVideoTime = -1;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const earOf = (lm, idx, W, H) => {
    const p = idx.map(i => ({ x: lm[i].x * W, y: lm[i].y * H }));
    return (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * dist(p[0], p[3]));
  };

  function metrics(lm, W, H) {
    const ear = (earOf(lm, L_EYE, W, H) + earOf(lm, R_EYE, W, H)) / 2;
    const px = i => ({ x: lm[i].x * W, y: lm[i].y * H });
    const mar = dist(px(13), px(14)) / dist(px(78), px(308));
    // head: yaw from nose offset between cheeks, roll from eye-line angle
    const nose = px(1), lc = px(234), rc = px(454);
    const faceW = dist(lc, rc);
    const yaw = (nose.x - (lc.x + rc.x) / 2) / faceW;
    const le = px(263), re = px(33);
    const roll = Math.abs(Math.atan2(le.y - re.y, le.x - re.x) * 180 / Math.PI);
    const rollDev = Math.min(roll, 180 - roll);
    const head = Math.max(Math.abs(yaw) / 0.18, rollDev / 25);
    return { ear, mar, head };
  }

  function drawOverlay(lm, state) {
    octx.clearRect(0, 0, overlay.width, overlay.height);
    const col = { normal: "#34d399", warning: "#fbbf24", drowsy: "#f43f5e" }[state];
    octx.fillStyle = col;
    [...L_EYE, ...R_EYE, 61, 291, 13, 14].forEach(i => {
      octx.beginPath();
      octx.arc(lm[i].x * overlay.width, lm[i].y * overlay.height, 3, 0, 7);
      octx.fill();
    });
  }

  async function init() {
    msg.textContent = "Loading face model…";
    const vision = await import(`${BASE}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${BASE}/wasm`);
    const opts = d => ({ baseOptions: { modelAssetPath: MODEL, delegate: d }, runningMode: "VIDEO", numFaces: 1 });
    try { landmarker = await vision.FaceLandmarker.createFromOptions(files, opts("GPU")); }
    catch { landmarker = await vision.FaceLandmarker.createFromOptions(files, opts("CPU")); }
  }

  function loop() {
    if (!running) return;
    const now = performance.now();
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const W = video.videoWidth, H = video.videoHeight;
      if (overlay.width !== W) { overlay.width = W; overlay.height = H; }
      const res = landmarker.detectForVideo(video, now);
      const dt = Math.min(200, now - (lastTs || now)); lastTs = now;
      if (res.faceLandmarks && res.faceLandmarks.length) {
        const lm = res.faceLandmarks[0];
        const m = metrics(lm, W, H);
        eng.update(m, dt);
        update(m, eng);
        drawOverlay(lm, eng.state);
        msg.hidden = true;
        badge.hidden = false; badge.textContent = eng.state.toUpperCase(); badge.dataset.state = eng.state;
        setFlash(eng.state === "drowsy" && inView.live);
        if (eng.state === "drowsy") beep();
      } else {
        octx.clearRect(0, 0, overlay.width, overlay.height);
        eng.reset(); setFlash(false);
        msg.hidden = false; msg.textContent = "No face detected — look at the camera";
        badge.hidden = true;
      }
    }
    requestAnimationFrame(loop);
  }

  async function start() {
    startBtn.disabled = true;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
        throw new Error("Camera API unavailable. Open this page over HTTPS (GitHub Pages) or localhost.");
      msg.hidden = false;
      if (!landmarker) await init();
      msg.textContent = "Starting camera…";
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      video.srcObject = stream; await video.play();
      running = true; lastTs = 0; eng.reset();
      startBtn.hidden = true; stopBtn.hidden = false;
      requestAnimationFrame(loop);
    } catch (err) {
      msg.hidden = false;
      msg.textContent = "Couldn't start: " + (err && err.message ? err.message : err);
    } finally { startBtn.disabled = false; }
  }
  function stop() {
    running = false;
    if (stream) stream.getTracks().forEach(t => t.stop());
    video.srcObject = null; stream = null;
    octx.clearRect(0, 0, overlay.width, overlay.height);
    eng.reset(); update({ ear: 0.3, mar: 0 }, eng); setFlash(false);
    badge.hidden = true; msg.hidden = false; msg.textContent = "Camera is off";
    startBtn.hidden = false; stopBtn.hidden = true;
  }
  startBtn.addEventListener("click", start);
  stopBtn.addEventListener("click", stop);
})();

/* ---------- scroll reveal ---------- */
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.08 });
$$(".reveal").forEach(el => io.observe(el));
