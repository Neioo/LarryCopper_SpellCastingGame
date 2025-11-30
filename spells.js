// spells.js (ES module)
import { SPELLS } from "./spells_config.js";

const hpPlayerEl = document.querySelector(".panel.player .hp-num");
const hpEnemyEl = document.querySelector(".panel.enemy  .hp-num");

let playerHP = Number(hpPlayerEl?.textContent || 100);
let enemyHP = Number(hpEnemyEl?.textContent || 100);
let gamePaused = false;

// function setHP(side, value) {
//   if (side === "player") {
//     playerHP = Math.max(0, value);
//     if (hpPlayerEl) hpPlayerEl.textContent = playerHP;
//   } else {
//     enemyHP = Math.max(0, value);
//     if (hpEnemyEl) hpEnemyEl.textContent = enemyHP;
//   }
// }

function setHP(side, value) {
  const v = Math.max(0, Math.min(999, value | 0));
  if (side === "player") {
    playerHP = v;
    if (hpPlayerEl) hpPlayerEl.textContent = v;
  } else {
    enemyHP = v;
    if (hpEnemyEl) hpEnemyEl.textContent = v;
  }
  window.dispatchEvent(
    new CustomEvent("hpchange", { detail: { playerHP, enemyHP } })
  );
}

function showGameOver(message) {
  const overlay = document.getElementById("gameOver");
  const msg = document.getElementById("goMsg");
  if (msg) msg.textContent = message || "Game Over";
  if (overlay) overlay.classList.remove("hidden");
  gamePaused = true;
  window.dispatchEvent(
    new CustomEvent("gameover", { detail: { playerHP, enemyHP } })
  );
}

// Expose a few helpers for other scripts (AI / restart)
window.resetSpells = function resetSpells() {
  active.length = 0;
};
window.resetHP = function resetHP(p = 100, e = 100) {
  setHP("player", p);
  setHP("enemy", e);
};
window.hideGameOver = function hideGameOver() {
  const overlay = document.getElementById("gameOver");
  if (overlay) overlay.classList.add("hidden");
  gamePaused = false;
};

const arena = document.getElementById("arenaCanvas");
const ctx = arena.getContext("2d");
ctx.imageSmoothingEnabled = false; // crisp pixels

// simple cache
const cache = new Map();
function loadImage(src) {
  if (cache.has(src)) return cache.get(src);
  const img = new Image();
  const p = new Promise((res, rej) => {
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Failed to load " + src));
  });
  img.src = src;
  cache.set(src, p);
  return p;
}

class Spell {
  constructor(def, x, y, flip = false) {
    this.def = def;
    this.x = x ?? arena.width / 2;
    this.y = y ?? arena.height / 2;
    this.flip = flip;
    this.i = 0;
    this.t = 0;
    this.ready = false;
    this.hit = null;

    loadImage(def.src).then((img) => {
      this.img = img;
      // compute frame rect from TOP row
      if (def.type === "gridTop") {
        const cols = def.colsTop;
        const rowsTotal = Math.max(1, def.rowsTotal ?? 1);
        this.fw = Math.floor(img.width / cols);
        this.fh = Math.floor(img.height / rowsTotal);
        this.count = cols;
        this.frameAt = (idx) => ({
          sx: idx * this.fw,
          sy: 0,
          sw: this.fw,
          sh: this.fh,
        });
      } else {
        throw new Error("Unsupported type: " + def.type);
      }
      this.ready = true;
    });
  }
  update(dt) {
    const { fps = 16, loop = true, vx = 0, vy = 0 } = this.def;
    // this.x += (this.flip ? -vx : vx) * dt;
    // this.y += vy * dt;

    const actualVx = this.flip ? -vx : vx;
    this.x += actualVx * dt;
    this.y += vy * dt;

    // --- simple edge-hit logic ---
    const HIT_MARGIN = 12; // tweak: how close to the edge counts as a hit
    if (actualVx > 0 && this.x >= arena.width - HIT_MARGIN) this.hit = "enemy";
    if (actualVx < 0 && this.x <= HIT_MARGIN) this.hit = "player";

    const step = 1 / fps;
    this.t += dt;
    while (this.t >= step) {
      this.t -= step;
      if (this.i < this.count - 1) this.i++;
      else if (loop) this.i = 0;
    }
  }
  draw(ctx) {
    if (!this.ready) return;
    const { scale = 3, ox = 0, oy = 0 } = this.def;
    const { sx, sy, sw, sh } = this.frameAt(this.i);
    const dw = Math.round(sw * scale);
    const dh = Math.round(sh * scale);
    const dx = Math.floor(this.x - dw / 2 - ox * scale);
    const dy = Math.floor(this.y - dh / 2 - oy * scale);

    ctx.save();
    if (this.flip) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(this.img, sx, sy, sw, sh, 0, 0, dw, dh);
    } else {
      ctx.drawImage(this.img, sx, sy, sw, sh, dx, dy, dw, dh);
    }
    ctx.restore();
  }
  offscreen(w, h) {
    const pad = 64;
    return (
      this.x < -pad || this.x > w + pad || this.y < -pad || this.y > h + pad
    );
  }
}

// manager
const active = [];
export function spawnSpell(name, { x, y, flip = false } = {}) {
  const def = SPELLS[name];
  if (!def) return console.warn("Unknown spell:", name);
  active.push(new Spell(def, x, y, flip));
}
window.spawnSpell = spawnSpell; // handy for quick console tests

// loop
// --- ONE rAF LOOP ONLY ---
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  ctx.clearRect(0, 0, arena.width, arena.height);

  for (let i = active.length - 1; i >= 0; i--) {
    const s = active[i];

    if (gamePaused) {
      // Freeze the last frame visually (optional)
      s.draw(ctx);
      continue;
    }

    s.update(dt);

    // Edge-hit → apply damage → maybe Game Over
    const HIT = 12;
    const vx = s.flip ? -(s.def.vx || 0) : s.def.vx || 0;

    if (vx > 0 && s.x >= arena.width - HIT) {
      const dmg = s.def.damage ?? 10;
      setHP("enemy", enemyHP - dmg);
      active.splice(i, 1);
      if (enemyHP <= 0) showGameOver("You Win!");
      continue;
    }
    if (vx < 0 && s.x <= HIT) {
      const dmg = s.def.damage ?? 10;
      setHP("player", playerHP - dmg);
      active.splice(i, 1);
      if (playerHP <= 0) showGameOver("You Lose!");
      continue;
    }

    s.draw(ctx);

    // Cleanup if something still goes offscreen
    if (s.offscreen(arena.width, arena.height)) active.splice(i, 1);
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// (optional) demo spawns—delete if you don’t want auto-tests
// spawnSpell("fireball", { x: 20, y: arena.height / 2 });
// spawnSpell("lightning", { x: 40, y: arena.height / 2 - 30 });
// spawnSpell("wind", { x: 40, y: arena.height / 2 + 60 });
// spawnSpell("fireball", { x: 40, y: arena.height / 2 });
