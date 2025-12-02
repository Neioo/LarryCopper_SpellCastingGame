// hand_gestures.js — FIXED VERSION
// Retains Smoothness of Code 1, but fixes Trigger & Coordinates from Code 2
import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const video = document.getElementById("cam");
const overlay = document.getElementById("handsOverlay");
const octx = overlay.getContext("2d");
const arena = document.getElementById("arenaCanvas");

// ---------- Camera ----------
async function startCamera() {
  video.muted = true;
  video.playsInline = true;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 640 },
      height: { ideal: 360 },
    },
    audio: false,
  });
  video.srcObject = stream;
  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      video.play().then(resolve);
    };
  });
}

// ---------- MediaPipe Hands ----------
let landmarker;
async function loadLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

// ---------- Sizing ----------
function syncOverlaySize() {
  const r = overlay.getBoundingClientRect();
  const w = r.width | 0,
    h = r.height | 0;
  if (overlay.width !== w || overlay.height !== h) {
    overlay.width = w;
    overlay.height = h;
  }
}
new ResizeObserver(syncOverlaySize).observe(overlay);

// ---------- One Euro filter ----------
class LowPass {
  constructor(a, x = 0) {
    this.a = a;
    this.y = x;
    this.s = false;
  }
  set(a) {
    this.a = a;
  }
  filter(x) {
    if (!this.s) {
      this.y = x;
      this.s = true;
      return x;
    }
    this.y = this.a * x + (1 - this.a) * this.y;
    return this.y;
  }
}
function alpha(dt, cutoff) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}
class OneEuro {
  constructor({
    freq = 60,
    minCutoff = 1.2,
    beta = 0.007,
    dCutoff = 1.5,
  } = {}) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xFilt = new LowPass(alpha(1 / freq, minCutoff));
    this.dxFilt = new LowPass(alpha(1 / freq, dCutoff));
    this.lastTime = null;
    this.lastX = null;
  }
  filter(x, t) {
    if (this.lastTime == null) {
      this.lastTime = t;
      this.lastX = x;
      this.xFilt.s = false;
      this.dxFilt.s = false;
      return x;
    }
    const dt = Math.max(1e-3, (t - this.lastTime) / 1000);
    this.lastTime = t;
    const dx = (x - this.lastX) / dt;
    this.lastX = x;
    this.dxFilt.set(alpha(dt, this.dCutoff));
    const edx = this.dxFilt.filter(dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    this.xFilt.set(alpha(dt, cutoff));
    return this.xFilt.filter(x);
  }
}
const euroX = new OneEuro();
const euroY = new OneEuro();

// ---------- Gesture state (index=draw, fist=cast) ----------
function palmNorm(lm) {
  const w = lm[0],
    m = lm[9];
  return Math.hypot(m.x - w.x, m.y - w.y);
}
function curl(lm, tip, mcp) {
  return (
    Math.hypot(lm[tip].x - lm[mcp].x, lm[tip].y - lm[mcp].y) /
    Math.max(palmNorm(lm), 1e-6)
  );
}
let drawing = false;
function isPointing(lm) {
  const idxExt = curl(lm, 8, 5) > (drawing ? 0.52 : 0.6);
  const othCur =
    curl(lm, 12, 9) < (drawing ? 0.54 : 0.5) &&
    curl(lm, 16, 13) < (drawing ? 0.54 : 0.5) &&
    curl(lm, 20, 17) < (drawing ? 0.54 : 0.5);
  return idxExt && othCur;
}
function isFist(lm) {
  const tips = [8, 12, 16, 20],
    mcps = [5, 9, 13, 17];
  const thr = drawing ? 0.5 : 0.46;
  return tips.every((t, i) => curl(lm, t, mcps[i]) < thr);
}

// ---------- $1 recognizer helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => a + (b - a) * t;

const N = 64,
  SIZE = 250;
function pathLength(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i]);
  return d;
}
function resample(pts, n = N) {
  const I = pathLength(pts) / (n - 1);
  let D = 0,
    out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (D + d >= I) {
      const t = (I - D) / d;
      const q = {
        x: lerp(pts[i - 1].x, pts[i].x, t),
        y: lerp(pts[i - 1].y, pts[i].y, t),
      };
      out.push(q);
      pts.splice(i, 0, q);
      D = 0;
    } else D += d;
  }
  while (out.length < n) out.push(pts[pts.length - 1]);
  return out;
}
function centroid(pts) {
  let x = 0,
    y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}
function indicativeAngle(pts) {
  const c = centroid(pts);
  return Math.atan2(c.y - pts[0].y, c.x - pts[0].x);
}
function rotateBy(pts, a) {
  const c = centroid(pts),
    cos = Math.cos(a),
    sin = Math.sin(a);
  return pts.map((p) => ({
    x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
    y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
  }));
}
function bbox(pts) {
  let minX = 1e9,
    minY = 1e9,
    maxX = -1e9,
    maxY = -1e9;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
function scaleToSquare(pts, size = SIZE) {
  const b = bbox(pts),
    w = b.maxX - b.minX,
    h = b.maxY - b.minY,
    s = size / Math.max(w, h, 1e-6);
  return pts.map((p) => ({ x: (p.x - b.minX) * s, y: (p.y - b.minY) * s }));
}
function translateToOrigin(pts) {
  const c = centroid(pts);
  return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}
function pathDistance(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += dist(a[i], b[i]);
  return d / a.length;
}
function preprocess(pts) {
  let r = resample(pts.slice());
  r = rotateBy(r, -indicativeAngle(r));
  r = scaleToSquare(r, SIZE);
  r = translateToOrigin(r);
  return r;
}

const Templates = {
  Circle: (() => {
    const pts = [];
    for (let t = 0; t < Math.PI * 2; t += Math.PI / 24) {
      pts.push({ x: 450 + 140 * Math.cos(t), y: 280 + 140 * Math.sin(t) });
    }
    return preprocess(pts);
  })(),
  Lightning: preprocess([
    { x: 200, y: 150 },
    { x: 450, y: 250 },
    { x: 380, y: 320 },
    { x: 650, y: 420 },
  ]),
  Line: preprocess([
    { x: 220, y: 120 },
    { x: 680, y: 440 },
  ]),
};

// ---------- Geometry-based classifiers (hard gates) ----------
function totalTurnAbs(pts) {
  let sum = 0;
  for (let i = 2; i < pts.length; i++) {
    const ax = pts[i - 1].x - pts[i - 2].x,
      ay = pts[i - 1].y - pts[i - 2].y;
    const bx = pts[i].x - pts[i - 1].x,
      by = pts[i].y - pts[i - 1].y;
    const dot = ax * bx + ay * by;
    const det = ax * by - ay * bx;
    sum += Math.abs(Math.atan2(det, dot));
  }
  return sum; // radians
}
function signChanges(pts) {
  let prev = 0,
    changes = 0;
  for (let i = 2; i < pts.length; i++) {
    const ax = pts[i - 1].x - pts[i - 2].x,
      ay = pts[i - 1].y - pts[i - 2].y;
    const bx = pts[i].x - pts[i - 1].x,
      by = pts[i].y - pts[i - 1].y;
    const det = ax * by - ay * bx;
    const s = Math.sign(det);
    if (prev !== 0 && s !== 0 && s !== prev) changes++;
    if (s !== 0) prev = s;
  }
  return changes;
}
function bboxAspect(pts) {
  const b = bbox(pts);
  const w = Math.max(1, b.maxX - b.minX),
    h = Math.max(1, b.maxY - b.minY);
  return w >= h ? w / h : h / w; // >=1
}
function circleLike(pts) {
  if (pts.length < 18) return false;
  // centroid + radii stats
  const c = centroid(pts);
  const radii = pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y));
  const rMean = radii.reduce((a, b) => a + b, 0) / radii.length;
  const rStd = Math.sqrt(
    radii.reduce((a, r) => a + (r - rMean) * (r - rMean), 0) / radii.length
  );
  // total signed angle coverage
  let totalAngle = 0;
  for (let i = 1; i < pts.length; i++) {
    const a0 = Math.atan2(pts[i - 1].y - c.y, pts[i - 1].x - c.x);
    const a1 = Math.atan2(pts[i].y - c.y, pts[i].x - c.x);
    let d = a1 - a0;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    totalAngle += d;
  }
  const absAngle = Math.abs(totalAngle);
  // thresholds tuned to be forgiving
  const round = rStd / (rMean + 1e-6) < 0.35;
  const big = rMean > 30;
  const sweep = absAngle > Math.PI * 1.3; // ~306°
  return round && big && sweep;
}
function jaggedLike(pts) {
  if (pts.length < 12) return false;
  const turns = totalTurnAbs(pts);
  const flips = signChanges(pts);
  return turns > 3.2 && flips >= 3; // slightly easier than before
}
function straightLike(pts) {
  if (pts.length < 8) return false;
  const turns = totalTurnAbs(pts);
  const aspect = bboxAspect(pts);
  return turns < 2.5 && aspect > 1.2;
}

// ---------- $1 recognition (fallback) ----------
function recognize(pts) {
  if (pts.length < 12) return { name: "No Match", score: Infinity };
  const P = preprocess(pts);
  let best = { name: "No Match", score: Infinity };
  for (const [name, T] of Object.entries(Templates)) {
    const s = pathDistance(P, T);
    if (s < best.score) best = { name, score: s };
  }
  const confidence = Math.max(0, 1 - best.score / 85);
  return confidence > 0.25 ? best : { name: "No Match", score: best.score };
}

// ---------- Stroke capture (adaptive) ----------
const path = [];
let cooldown = false;
const COOLDOWN_MS = 700;
let lostFrames = 0;

// adaptive sampling
let speedEMA = 0;
const SPEED_ALPHA = 0.3;
const BASE_STEP = 2.0;
const STEP_K = 0.08;
const OUTLIER_JUMP = 80;

function addPointAdaptive(p) {
  const last = path[path.length - 1];
  if (!last) {
    path.push(p);
    return;
  }
  const dx = p.x - last.x,
    dy = p.y - last.y;
  const d = Math.hypot(dx, dy);
  speedEMA = SPEED_ALPHA * d + (1 - SPEED_ALPHA) * speedEMA;
  if (d > OUTLIER_JUMP && speedEMA > 30) return;
  const step = BASE_STEP + STEP_K * speedEMA;
  if (d >= step) path.push(p);
  if (path.length > 256) path.shift();
}

// ---------- Casting (feature-first, then $1 fallback) ----------
function castFromPath() {
  if (cooldown || path.length < 10) return;
  cooldown = true;

  let spell = null;

  // 1) Hard geometry gates (robust)
  if (circleLike(path)) {
    spell = "fireball";
  } else if (jaggedLike(path)) {
    spell = "lightning";
  } else if (straightLike(path)) {
    spell = "slash"; // wind slash
  } else {
    // 2) Fallback to $1, but guard lightning with jagged-ness
    const result = recognize(path);
    if (result.name === "Circle") spell = "fireball";
    else if (result.name === "Line") spell = "slash";
    else if (result.name === "Lightning")
      spell = jaggedLike(path) ? "lightning" : "slash";
    else {
      // final heuristic: prefer slash over lightning when ambiguous
      spell = straightLike(path)
        ? "slash"
        : jaggedLike(path)
        ? "lightning"
        : null;
    }
  }

  if (spell && typeof window.spawnSpell === "function") {
    const end = path[path.length - 1];

    // FORCE SAFE Y-COORDINATE (Center of screen)
    // This guarantees the sprite is visible, regardless of canvas resizing issues
    const safeY = 200;

    console.log("CASTING:", spell); // Check console to confirm logic works

    if (spell === "fireball") {
      window.spawnSpell("fireball", { x: 40, y: safeY, flip: false });
    } else if (spell === "lightning") {
      // Use the hand's Y if available, otherwise default to safeY
      window.spawnSpell("lightning", { x: end?.x ?? 40, y: end?.y ?? safeY });
    } else if (spell === "slash") {
      window.spawnSpell("wind", { x: end?.x ?? 40, y: end?.y ?? safeY });
    }
  }
  path.length = 0;
  setTimeout(() => (cooldown = false), COOLDOWN_MS);
}

// ---------- Smooth drawing (Catmull–Rom → Bezier) ----------
function drawSmoothPath(ctx, pts) {
  if (pts.length < 2) return;
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#7aa2ff";
  ctx.globalAlpha = 0.95;
  ctx.beginPath();

  if (pts.length === 2) {
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  const p = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = p(i - 1),
      p1 = p(i),
      p2 = p(i + 1),
      p3 = p(i + 2);
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawOverlay(landmarks) {
  // Use destination-out to fade out the previous frame (Magic Trail effect)
  octx.save();
  octx.globalCompositeOperation = "destination-out";
  octx.fillStyle = "rgba(0, 0, 0, 0.2)"; // Adjust this transparency for longer/shorter trails
  octx.fillRect(0, 0, overlay.width, overlay.height);
  octx.restore();

  if (path.length > 1) drawSmoothPath(octx, path);

  // debug landmarks (optional)
  if (landmarks && landmarks.length) {
    const lm = landmarks[0];
    octx.fillStyle = "#00e5ff";
    const show = [0, 5, 9, 13, 17, 4, 8, 12, 16, 20];
    for (const i of show) {
      // FIXED: MATCH COORDINATES WITH CODE 2 (No Mirroring)
      const x = lm[i].x * overlay.width;
      const y = lm[i].y * overlay.height;
      octx.beginPath();
      octx.arc(x, y, 2.5, 0, Math.PI * 2);
      octx.fill();
    }
  }
}

// ---------- Main loop (THROTTLED & CRASH SAFE) ----------
let lastVideoTime = -1;
let lastProcessTime = 0;

function onFrame() {
  // 1. Keep the loop alive immediately
  requestAnimationFrame(onFrame);

  // 2. Throttle: Limit to ~30 FPS (every 33ms) to prevent freezing
  const now = performance.now();
  if (now - lastProcessTime < 33) return;
  lastProcessTime = now;

  syncOverlaySize();

  // 3. Crash Guard: Only run if video is loaded and has dimensions
  if (
    landmarker &&
    video.readyState >= 2 &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  ) {
    // Only detect if the video frame has actually updated
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;

      let res = null;
      try {
        res = landmarker.detectForVideo(video, now);
      } catch (e) {
        // Silently skip if MediaPipe isn't ready for this specific frame timestamp
      }

      const hands = res?.landmarks ?? [];

      if (hands.length) {
        lostFrames = 0;
        const lm = hands[0];

        // FIXED: Removed Mirroring (1 - x) to match Code 2
        // This ensures Left-to-Right movements match the "Line" template
        const rawX = lm[8].x * overlay.width;
        const rawY = lm[8].y * overlay.height;

        const fx = euroX.filter(rawX, now);
        const fy = euroY.filter(rawY, now);

        const pointing = isPointing(lm);
        const fist = isFist(lm);

        // --- FIXED TRIGGER LOGIC ---
        if (pointing) {
          if (!drawing) {
            drawing = true;
            path.length = 0;
            speedEMA = 0;
          }
          addPointAdaptive({
            x: clamp(fx, 0, overlay.width),
            y: clamp(fy, 0, overlay.height),
          });
        } else if (fist && drawing) {
          // FIXED: Immediate Trigger (Removed "Wait 5 frames" debounce)
          // This matches Code 2's responsiveness.
          drawing = false;
          castFromPath();
        }
        // ----------------------

        drawOverlay(hands);
      } else {
        // tolerate brief loss
        lostFrames++;
        if (lostFrames > 8 && path.length > 6) path.shift();
        drawOverlay(null);
      }
    }
  }
}

// ---------- Bootstrap ----------
(async () => {
  try {
    await startCamera();
    await loadLandmarker();
    syncOverlaySize();
    // Start the new safe loop
    onFrame();
  } catch (e) {
    console.error(e);
    const ph = document.createElement("div");
    ph.textContent = "Camera blocked or unavailable";
    video.replaceWith(ph);
  }
})();
