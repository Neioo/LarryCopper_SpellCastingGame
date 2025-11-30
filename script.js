// FOR THE PLAYER

const canvas = document.getElementById("playerCanvas");
const ctx = canvas.getContext("2d");
const CANVAS_WIDTH = (canvas.width = 200);
const CANVAS_HEIGHT = (canvas.height = 200);

ctx.imageSmoothingEnabled = false;

const playerImage = new Image();
playerImage.src = "../assets/images/Mage.png";
const spriteWidth = 32;
const spriteHeight = 32;

const SCALE = 3;

let playerState = "idle";

let gameFrame = 0;
const staggerFrames = 4;
const spriteAnimations = [];
const animationStates = [
  {
    //for each row from top to bottom row by row to match the spritesheet
    name: "idle",
    frames: 10,
  },
  {
    name: "light",
    frames: 10,
  },
  {
    name: "idle2",
    frames: 10,
  },
  {
    name: "attack",
    frames: 10,
  },
  {
    name: "death",
    frames: 10,
  },
];
animationStates.forEach((state, index) => {
  let frames = {
    loc: [],
  };
  for (let j = 0; j < state.frames; j++) {
    let positionX = j * spriteWidth;
    let positionY = index * spriteHeight;
    frames.loc.push({ x: positionX, y: positionY });
  }
  spriteAnimations[state.name] = frames;
});
console.log(spriteAnimations);

// function animate() {
//   ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
//   let position =
//     Math.floor(gameFrame / staggerFrames) %
//     spriteAnimations[playerState].loc.length;
//   let frameX = spriteWidth * position;
//   let frameY = spriteAnimations[playerState].loc[position].y;
//   ctx.drawImage(
//     playerImage,
//     frameX,
//     frameY,
//     spriteWidth,
//     spriteHeight,
//     0,
//     0,
//     spriteWidth,
//     spriteHeight
//   );
//   gameFrame++;
//   requestAnimationFrame(animate);
// }

function animate() {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const frames = spriteAnimations[playerState].loc;
  const position = Math.floor(gameFrame / staggerFrames) % frames.length;
  const { x: sx, y: sy } = frames[position];

  // destination size (scaled)
  const dw = spriteWidth * SCALE;
  const dh = spriteHeight * SCALE;

  // centered destination position
  const dx = Math.floor((CANVAS_WIDTH - dw) / 2);
  const dy = Math.floor((CANVAS_HEIGHT - dh) / 2);

  ctx.drawImage(
    playerImage,
    sx,
    sy,
    spriteWidth,
    spriteHeight, // source (frame)
    dx,
    dy,
    dw,
    dh // destination (centered + scaled)
  );

  gameFrame++;
  requestAnimationFrame(animate);
}
animate();
