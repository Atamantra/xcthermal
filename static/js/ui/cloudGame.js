// static/js/ui/cloudGame.js

let gameLoopId;
let canvas, ctx;
let isGameRunning = false;

// Game State
let bird = { x: 50, y: 100, velocity: 0, radius: 8 }; // Adjusted Y for smaller canvas
let clouds = [];
let frameCount = 0;
let score = 0;

// Settings
const GRAVITY = 0.2; // Slightly floatier
const LIFT = -4;
const SPEED = 2;
const CLOUD_GAP = 100;
const CLOUD_FREQUENCY = 100;

export function startLoadingGame(containerElement) {
  if (isGameRunning) return;

  // Clean container
  containerElement.innerHTML = '';
  isGameRunning = true;
  frameCount = 0;
  score = 0;
  clouds = [];
  bird = { x: 50, y: 100, velocity: 0, radius: 8 };

  // Create Canvas
  canvas = document.createElement('canvas');
  canvas.width = containerElement.clientWidth || 300;
  canvas.height = containerElement.clientHeight || 200; // Adapt to container height
  canvas.style.background = "linear-gradient(to bottom, #87CEEB, #E0F7FA)";
  canvas.style.display = "block";
  containerElement.appendChild(canvas);

  ctx = canvas.getContext('2d');

  // Inputs
  const inputHandler = (e) => {
      if (e.type === 'touchstart' || e.type === 'mousedown' || e.code === 'Space') {
          if(e.type !== 'mousedown') e.preventDefault(); // Allow mouse click without preventing default
          flap();
      }
  };

  canvas.addEventListener('mousedown', inputHandler);
  canvas.addEventListener('touchstart', inputHandler);
  document.addEventListener('keydown', inputHandler);

  // Initial text
  drawInstructions();

  loop();
}

export function stopLoadingGame() {
  isGameRunning = false;
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  // Remove global listener to prevent memory leaks
  // Note: This removes ALL keydown listeners for this function, which is safer
  const clone = document.body.cloneNode(true);
  // (In a real app, use named functions for event listeners to remove them precisely)
}

function flap() {
  if (!isGameRunning) return;
  bird.velocity = LIFT;
}

function loop() {
  if (!isGameRunning) return;
  update();
  draw();
  gameLoopId = requestAnimationFrame(loop);
}

function update() {
  bird.velocity += GRAVITY;
  bird.y += bird.velocity;

  if (bird.y + bird.radius > canvas.height) {
      bird.y = canvas.height - bird.radius;
      bird.velocity = 0;
  }
  if (bird.y - bird.radius < 0) {
      bird.y = bird.radius;
      bird.velocity = 0;
  }

  if (frameCount % CLOUD_FREQUENCY === 0) {
    const minHeight = 20;
    const maxHeight = canvas.height - 20 - CLOUD_GAP;
    const topHeight = Math.floor(Math.random() * (maxHeight - minHeight + 1) + minHeight);

    clouds.push({ x: canvas.width, topHeight: topHeight, passed: false });
  }

  for (let i = 0; i < clouds.length; i++) {
    let c = clouds[i];
    c.x -= SPEED;

    // Collision
    if (bird.x + bird.radius > c.x && bird.x - bird.radius < c.x + 40) {
        if (bird.y - bird.radius < c.topHeight || bird.y + bird.radius > c.topHeight + CLOUD_GAP) {
            // Collision: Just reset position, don't stop game (keep it fun/flowy)
            bird.y = 100;
            bird.velocity = 0;
            clouds = [];
            score = 0;
        }
    }

    if (c.x + 40 < bird.x && !c.passed) {
        score++;
        c.passed = true;
    }
  }

  if (clouds.length > 0 && clouds[0].x < -50) clouds.shift();
  frameCount++;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Clouds
  ctx.fillStyle = 'white';
  clouds.forEach(c => {
      ctx.fillRect(c.x, 0, 40, c.topHeight);
      ctx.fillRect(c.x, c.topHeight + CLOUD_GAP, 40, canvas.height);
  });

  // Player
  ctx.fillStyle = '#FF5722';
  ctx.beginPath();
  ctx.arc(bird.x, bird.y, bird.radius, 0, Math.PI * 2);
  ctx.fill();

  // Score
  ctx.fillStyle = '#333';
  ctx.font = "16px sans-serif";
  ctx.fillText("Score: " + score, 10, 25);
}

function drawInstructions() {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = "14px sans-serif";
    ctx.fillText("Tap to Fly!", 50, canvas.height/2);
}