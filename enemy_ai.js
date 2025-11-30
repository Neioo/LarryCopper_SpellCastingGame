// // enemy_ai.js (ES module)
// const arena = document.getElementById("arenaCanvas");
// let timer = null;

// function castBurst() {
//   let current = 1 + Math.floor(Math.random() * 2);
//   if (current == 1) {
//     spawnSpell("wind", {
//       x: arena.width - 40,
//       y: arena.height / 2 + 60,
//       flip: true,
//     });
//   } else {
//     spawnSpell("lightning", {
//       x: arena.width - 40,
//       y: arena.height / 2 - 30,
//       flip: true,
//     });
//   }
// }

// export function startEnemyAI(intervalMs = 5500) {
//   stopEnemyAI();
//   castBurst(); // fire immediately
//   timer = setInterval(() => {
//     if (document.getElementById("gameOver")?.classList.contains("hidden")) {
//       castBurst();
//     }
//   }, intervalMs);
// }
// export function stopEnemyAI() {
//   if (timer) {
//     clearInterval(timer);
//     timer = null;
//   }
// }

// // Stop AI when game over fires
// window.addEventListener("gameover", stopEnemyAI);

// // Start on load
// startEnemyAI();

// // Restart button: reset everything and resume
// document.getElementById("restartBtn")?.addEventListener("click", () => {
//   hideGameOver(); // hide overlay
//   resetSpells(); // clear projectiles
//   resetHP(100, 100); // both back to 100
//   startEnemyAI(); // resume AI
// });
// enemy_ai.js (ES module) — start only in #game, with grace period & proper pause/resume
const arena = document.getElementById("arenaCanvas");
let timer = null;
let firstCastTimer = null;
const GRACE_MS = 2500; // delay before first enemy cast after entering game

function safeSpawn(name, opts) {
  if (typeof window.spawnSpell === "function") {
    window.spawnSpell(name, opts);
    // let enemy sprite flash "attack"
    window.dispatchEvent(new Event("enemycast"));
  }
}

function castBurst() {
  if (!arena) return;
  const pick = 1 + Math.floor(Math.random() * 2);
  if (pick === 1) {
    safeSpawn("wind", {
      x: arena.width - 40,
      y: arena.height / 2 + 60,
      flip: true,
    });
  } else {
    safeSpawn("lightning", {
      x: arena.width - 40,
      y: arena.height / 2 - 30,
      flip: true,
    });
  }
}

export function startEnemyAI(intervalMs = 5500, { graceMs = GRACE_MS } = {}) {
  stopEnemyAI(); // clear any leftovers

  // first cast after a short grace so player isn't ambushed
  firstCastTimer = setTimeout(() => {
    if (isGameActive()) castBurst();
  }, graceMs);

  timer = setInterval(() => {
    if (isGameActive()) castBurst();
  }, intervalMs);
}

export function stopEnemyAI() {
  if (firstCastTimer) {
    clearTimeout(firstCastTimer);
    firstCastTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// ---------- helpers: when should AI actually act? ----------
function isOnGameScreen() {
  // hash navigation via <a href="#game">
  return location.hash === "#game";
}
function isNotGameOver() {
  const go = document.getElementById("gameOver");
  return !!go && go.classList.contains("hidden");
}
function isTabVisible() {
  return document.visibilityState === "visible";
}
function isGameActive() {
  return isOnGameScreen() && isNotGameOver() && isTabVisible();
}

// ---------- wire up lifecycle ----------
function maybeStart() {
  if (isOnGameScreen()) startEnemyAI();
}
function maybeStop() {
  if (!isOnGameScreen()) stopEnemyAI();
}

// Start/stop when navigating between title and game
window.addEventListener("hashchange", () => {
  if (isOnGameScreen()) {
    startEnemyAI();
  } else {
    stopEnemyAI();
  }
});

// Pause/resume when tab visibility changes
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    stopEnemyAI();
  } else if (isOnGameScreen()) {
    startEnemyAI();
  }
});

// Stop AI when game over fires (spells.js should dispatch this)
window.addEventListener("gameover", stopEnemyAI);

// Restart button: reset everything and resume only if on game screen
document.getElementById("restartBtn")?.addEventListener("click", () => {
  try {
    hideGameOver?.();
  } catch {}
  try {
    resetSpells?.();
  } catch {}
  try {
    resetHP?.(100, 100);
  } catch {}
  if (isOnGameScreen()) startEnemyAI();
});

// ---- bootstrap: DO NOT auto-start on load ----
if (isOnGameScreen()) {
  // If user loaded directly into #game URL
  startEnemyAI();
}
