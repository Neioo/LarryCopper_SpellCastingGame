export const SPELLS = {
  lightning: {
    src: "assets/images/shock.png",
    type: "gridTop",
    colsTop: 4, // how many frames across the top row (guess)
    rowsTotal: 8, // total rows in the image (top + bottom)
    fps: 20,
    loop: true,
    scale: 3,
    vx: 260,
    vy: 0, // move left->right
    damage: 10,
  },
  fireball: {
    src: "assets/images/fireball2.png",
    type: "gridTop",
    colsTop: 2, // top row shows 2 meteors
    rowsTotal: 2,
    fps: 16,
    loop: true,
    scale: 3,
    vx: 220,
    vy: 0,
    mirrorX: true,
    damage: 10,
  },
  wind: {
    src: "assets/images/pixel_art_sword_slash_sprites.png",
    type: "gridTop",
    colsTop: 3, // three slashes across the top row
    rowsTotal: 3,
    fps: 18,
    loop: true,
    scale: 3,
    vx: 240,
    vy: 0,
    damage: 6,
  },
};
