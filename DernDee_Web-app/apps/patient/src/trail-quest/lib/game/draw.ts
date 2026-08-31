import type { GamePhase, Particle, Platform } from "@trail/lib/game/types";

const SKY_TOP = "#c8edfb";
const SKY_MID = "#b7e4f6";
const SKY_HORIZON = "#d8f1c9";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function cloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  alpha = 0.95,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(x, y, 28 * s, 16 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 22 * s, y - 8 * s, 22 * s, 18 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 44 * s, y, 26 * s, 15 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 20 * s, y + 6 * s, 30 * s, 14 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function mountain(
  ctx: CanvasRenderingContext2D,
  x: number,
  ground: number,
  w: number,
  h: number,
  fill: string,
) {
  ctx.beginPath();
  ctx.moveTo(x, ground);
  ctx.bezierCurveTo(x + w * 0.2, ground - h * 0.4, x + w * 0.28, ground - h, x + w * 0.5, ground - h);
  ctx.bezierCurveTo(x + w * 0.72, ground - h, x + w * 0.8, ground - h * 0.4, x + w, ground);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function cactus(ctx: CanvasRenderingContext2D, x: number, ground: number, scale = 1) {
  ctx.save();
  ctx.translate(x, ground);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#5faf45";
  roundRect(ctx, -9, -62, 18, 62, 9);
  ctx.fill();
  roundRect(ctx, -28, -44, 22, 12, 6);
  ctx.fill();
  roundRect(ctx, -28, -44, 12, 28, 6);
  ctx.fill();
  roundRect(ctx, 8, -38, 20, 11, 6);
  ctx.fill();
  roundRect(ctx, 16, -38, 11, 22, 6);
  ctx.fill();
  ctx.fillStyle = "#4d9438";
  ctx.fillRect(-3, -54, 2.2, 10);
  ctx.fillRect(2, -48, 2.2, 8);
  ctx.fillRect(-4, -36, 2.2, 9);
  ctx.restore();
}

function rockMound(ctx: CanvasRenderingContext2D, x: number, ground: number, scale = 1) {
  ctx.save();
  ctx.translate(x, ground);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#c9a37a";
  ctx.beginPath();
  ctx.moveTo(-58, 8);
  ctx.lineTo(-48, -28);
  ctx.lineTo(-18, -52);
  ctx.lineTo(8, -38);
  ctx.lineTo(38, -58);
  ctx.lineTo(62, -22);
  ctx.lineTo(70, 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#b08963";
  ctx.beginPath();
  ctx.moveTo(-18, -52);
  ctx.lineTo(8, -38);
  ctx.lineTo(4, -8);
  ctx.lineTo(-28, -6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#d7b892";
  ctx.beginPath();
  ctx.moveTo(8, -38);
  ctx.lineTo(38, -58);
  ctx.lineTo(34, -18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGrassCap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  time: number,
) {
  ctx.fillStyle = "#5ec437";
  ctx.fillRect(x, y, w, 22);
  ctx.fillStyle = "#7ed957";
  ctx.fillRect(x, y, w, 11);
  ctx.fillStyle = "#8ee45f";
  ctx.fillRect(x, y, w, 5);
  ctx.strokeStyle = "#4db326";
  ctx.lineWidth = 1.4;
  const start = Math.floor(x / 9) * 9;
  for (let gx = start; gx < x + w; gx += 9) {
    const sway = Math.sin(time * 2.4 + gx * 0.08) * 2.4;
    ctx.beginPath();
    ctx.moveTo(gx, y + 9);
    ctx.quadraticCurveTo(gx + sway, y - 8, gx + 3 + sway, y - 13);
    ctx.stroke();
  }
}

function drawSoil(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#c4a06c";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#b08958";
  ctx.fillRect(x, y + 22, w, 16);
  ctx.fillStyle = "#9a7348";
  ctx.fillRect(x, y + 48, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 8; i += 1) {
    const px = x + ((i * 97) % Math.max(1, w));
    ctx.fillRect(px, y + 10 + (i % 5) * 12, 3, 3);
  }
}

export function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, groundY: number) {
  const g = ctx.createLinearGradient(0, 0, 0, groundY + 40);
  g.addColorStop(0, SKY_TOP);
  g.addColorStop(0.55, SKY_MID);
  g.addColorStop(1, SKY_HORIZON);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  groundY: number,
  camX: number,
  time: number,
) {
  const desertY = groundY - 8;
  ctx.fillStyle = "#ead7a8";
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, desertY);
  for (let i = 0; i <= 8; i += 1) {
    const px = (i / 8) * w;
    const py = desertY - 18 - Math.sin(i * 1.3 + camX * 0.002) * 14;
    ctx.lineTo(px, py);
  }
  ctx.lineTo(w, h);
  ctx.fill();

  ctx.save();
  ctx.translate(-camX * 0.22, 0);
  mountain(ctx, 40, groundY - 36, 260, 96, "#9bb7c6");
  mountain(ctx, 200, groundY - 30, 320, 128, "#8eacbc");
  mountain(ctx, 480, groundY - 34, 240, 88, "#a6c0cd");
  mountain(ctx, 760, groundY - 28, 300, 110, "#97b4c3");
  mountain(ctx, 1080, groundY - 36, 280, 100, "#8eacbc");
  mountain(ctx, 1400, groundY - 30, 260, 92, "#9bb7c6");
  ctx.restore();

  ctx.save();
  ctx.translate(-camX * 0.18, 0);
  cloud(ctx, 80 + Math.sin(time * 0.12) * 8, 58, 1.1);
  cloud(ctx, 280, 42, 0.85, 0.9);
  cloud(ctx, 520, 70, 1.25);
  cloud(ctx, 820, 48, 0.9);
  cloud(ctx, 1100, 62, 1.15);
  ctx.restore();

  ctx.save();
  ctx.translate(-camX * 0.45, 0);
  cactus(ctx, 430, groundY - 10, 0.82);
  cactus(ctx, 980, groundY - 10, 1);
  cactus(ctx, 1480, groundY - 8, 0.7);
  rockMound(ctx, 620, groundY - 6, 0.92);
  rockMound(ctx, 1280, groundY - 6, 0.7);
  ctx.restore();
}

export function drawPlatforms(
  ctx: CanvasRenderingContext2D,
  platforms: Platform[],
  groundY: number,
  camX: number,
  canvasH: number,
  time: number,
) {
  for (const p of platforms) {
    const x = p.x - camX;
    if (x + p.width < -40 || x > ctx.canvas.width + 40) continue;
    drawSoil(ctx, x, groundY + 16, p.width, canvasH - groundY);
    drawGrassCap(ctx, x, groundY, p.width, time);
    ctx.fillStyle = "#4aa028";
    ctx.fillRect(x, groundY + 20, p.width, 5);

    const gapRight = p.x + p.width;
    const next = platforms.find((n) => n.x > p.x);
    if (next) {
      const cliffX = gapRight - camX;
      ctx.fillStyle = "#8d6740";
      ctx.beginPath();
      ctx.moveTo(cliffX, groundY + 16);
      ctx.lineTo(cliffX + 10, groundY + 70);
      ctx.lineTo(cliffX, canvasH);
      ctx.lineTo(cliffX - 18, canvasH);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawLeg(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  roundRect(ctx, -7, -4, 14, 28, 7);
  ctx.fill();
  ctx.fillStyle = "#d7a15a";
  roundRect(ctx, -8, 20, 18, 9, 4);
  ctx.fill();
  ctx.restore();
}

export function drawDino(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  time: number,
  phase: GamePhase,
  airY: number,
  holding: boolean,
) {
  const running = phase === "running";
  const walking = phase === "walking";
  const jumping = phase === "jumping";
  const ducking = phase === "ducking";
  const tired = phase === "tired";
  const speed = running ? 16 : walking ? 9.5 : 0;
  const swing = speed ? Math.sin(time * speed) : 0;
  const bob = speed
    ? Math.abs(Math.sin(time * speed)) * (running ? 4.5 : 3)
    : Math.sin(time * 2.4) * 1.4;
  const y = groundY - airY - bob;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(2.05, 2.05);

  ctx.fillStyle = "rgba(90,70,40,0.2)";
  ctx.beginPath();
  ctx.ellipse(2, 8 + airY * 0.06, 28 - Math.min(airY * 0.07, 12), 8, 0, 0, Math.PI * 2);
  ctx.fill();

  if (jumping) ctx.rotate(-0.2);
  if (ducking) {
    ctx.translate(0, 16);
    ctx.scale(1.14, 0.58);
  }
  if (tired) {
    ctx.translate(3, 8);
    ctx.rotate(0.08);
  }

  drawLeg(ctx, -10, -4, swing * 0.5, "#5aaa38");
  drawLeg(ctx, 14, -4, -swing * 0.5, "#73c94a");

  ctx.fillStyle = "#7ed957";
  ctx.beginPath();
  ctx.ellipse(2, -30, 28, 22, -0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f6e7c4";
  ctx.beginPath();
  ctx.ellipse(8, -24, 17, 13, -0.08, 0, Math.PI * 2);
  ctx.fill();

  const plates = [
    { x: -14, y: -48, s: 11 },
    { x: -2, y: -54, s: 13 },
    { x: 12, y: -50, s: 11 },
    { x: 24, y: -42, s: 9 },
  ];
  for (const pl of plates) {
    ctx.fillStyle = "#c9a36c";
    ctx.beginPath();
    ctx.moveTo(pl.x, pl.y + pl.s);
    ctx.lineTo(pl.x + pl.s * 0.5, pl.y);
    ctx.lineTo(pl.x + pl.s * 1.05, pl.y + pl.s * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#b08955";
    ctx.beginPath();
    ctx.moveTo(pl.x + 2, pl.y + pl.s - 2);
    ctx.lineTo(pl.x + pl.s * 0.5, pl.y + 3);
    ctx.lineTo(pl.x + pl.s * 0.55, pl.y + pl.s * 0.75);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "#7ed957";
  ctx.beginPath();
  ctx.ellipse(28, -42, 17, 15, 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#68b83e";
  ctx.beginPath();
  ctx.ellipse(42, -36, 8, 5.5, 0.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(32, -47, 5.6, 6.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a2a2a";
  ctx.beginPath();
  ctx.ellipse(33.4, -46.4, 2.5, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(34.4, -48, 1.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#4a8f2e";
  ctx.lineWidth = 1.7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(34, -34, 5.5, 0.2, 1.15);
  ctx.stroke();

  ctx.save();
  ctx.translate(-8, -22);
  ctx.rotate(0.55 + Math.sin(time * 5) * 0.1);
  ctx.fillStyle = "#73c94a";
  roundRect(ctx, 0, 0, 9, 15, 4);
  ctx.fill();
  ctx.restore();

  if (holding) {
    ctx.strokeStyle = "rgba(110,200,80,0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(4, -30, Math.max(6, 42 + Math.sin(time * 8) * 2), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  camX: number,
  scale = 1,
) {
  for (const p of particles) {
    ctx.globalAlpha = p.life / p.max;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc((p.x - camX) * scale, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawFlag(ctx: CanvasRenderingContext2D, x: number, groundY: number, camX: number, time: number, scale = 1) {
  const px = (x - camX) * scale;
  const gy = groundY;
  ctx.strokeStyle = "#6d5a46";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px, gy);
  ctx.lineTo(px, gy - 78);
  ctx.stroke();
  const wave = Math.sin(time * 4) * 4;
  ctx.fillStyle = "#3dcc6a";
  ctx.beginPath();
  ctx.moveTo(px, gy - 76);
  ctx.lineTo(px + 32 + wave, gy - 64);
  ctx.lineTo(px, gy - 50);
  ctx.closePath();
  ctx.fill();
}

export function drawCliffDecor(
  ctx: CanvasRenderingContext2D,
  platforms: Platform[],
  groundY: number,
  camX: number,
) {
  platforms.forEach((p) => {
    const last = platforms[platforms.length - 1];
    if (p === last) return;
    const cliff = p.x + p.width;
    cactus(ctx, cliff + 28 - camX, groundY - 6, 1.25);
    rockMound(ctx, cliff + 118 - camX, groundY - 8, 1);
  });
}

function drawBird(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  time: number,
  tint: string,
) {
  const flap = Math.sin(time * 14) * 0.55;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = "rgba(70,90,120,0.16)";
  ctx.beginPath();
  ctx.ellipse(0, 22, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = tint;
  ctx.save();
  ctx.rotate(-0.7 + flap);
  ctx.beginPath();
  ctx.ellipse(-6, -2, 16, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.rotate(0.7 - flap);
  ctx.beginPath();
  ctx.ellipse(8, -4, 15, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.ellipse(2, 2, 15, 11, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff6ea";
  ctx.beginPath();
  ctx.ellipse(4, 5, 9, 6, -0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ff9a4a";
  ctx.beginPath();
  ctx.moveTo(16, 1);
  ctx.lineTo(26, 4);
  ctx.lineTo(16, 7);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(8, -2, 3.4, 3.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a2a2a";
  ctx.beginPath();
  ctx.ellipse(9, -1.6, 1.6, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function birdPlacements(
  worldXs: number[],
  opts: {
    cameraX: number;
    groundY: number;
    scale: number;
    canvasW: number;
    canvasH: number;
  },
) {
  const { cameraX, groundY, scale, canvasW, canvasH } = opts;
  const size = Math.max(96, canvasH * 0.26);
  const out: { x: number; y: number; size: number }[] = [];
  for (const wx of worldXs) {
    const hx = (wx - cameraX) * scale;
    if (hx < -size || hx > canvasW + size) continue;
    out.push({
      x: hx,
      y: groundY - canvasH * 0.36,
      size,
    });
  }
  return out;
}

export function drawBirdFlock(
  ctx: CanvasRenderingContext2D,
  worldXs: number[],
  opts: {
    cameraX: number;
    groundY: number;
    scale: number;
    canvasW: number;
    canvasH: number;
    time: number;
  },
) {
  for (const p of birdPlacements(worldXs, opts)) {
    const s = p.size / 52;
    drawBird(ctx, p.x - 28 * s, p.y + 10 * s, 0.78 * s, opts.time + 0.4, "#f08a6a");
    drawBird(ctx, p.x, p.y, 1.05 * s, opts.time, "#ff8d73");
    drawBird(ctx, p.x + 26 * s, p.y + 14 * s, 0.7 * s, opts.time + 0.8, "#e57b8c");
  }
}

export function drawSceneStrip(
  ctx: CanvasRenderingContext2D,
  scenes: HTMLImageElement[],
  cameraX: number,
  canvasW: number,
  canvasH: number,
  sceneWidth: number,
  sceneHeight: number,
) {
  const scale = canvasH / sceneHeight;
  const destW = sceneWidth * scale;
  for (let i = 0; i < scenes.length; i += 1) {
    const dx = (i * sceneWidth - cameraX) * scale;
    if (dx + destW < -8 || dx > canvasW + 8) continue;
    ctx.drawImage(scenes[i], dx, 0, destW, canvasH);
  }
}
