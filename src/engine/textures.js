// Procedurally generate a texture atlas for all blocks.
// Each block gets 3 tiles (top, side, bottom), arranged in rows of TILES_PER_ROW.

import * as THREE from 'three';
import { BLOCK, BLOCKS } from './blocks.js';

export const TILE_SIZE = 16;
export const TILES_PER_ROW = 16;
export const ATLAS_SIZE = TILE_SIZE * TILES_PER_ROW;

// Tile index per (block, face). face: 0=top, 1=side, 2=bottom.
// We allocate 3 slots per block id starting from id*3.
export function tileIndex(blockId, face) {
  return blockId * 3 + face;
}

// FACES order in mesher: 0=+X, 1=-X, 2=+Y(top), 3=-Y(bottom), 4=+Z, 5=-Z.
export function faceToTileFace(face) {
  if (face === 2) return 0; // top
  if (face === 3) return 2; // bottom
  return 1; // side
}

function hexToRgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function shade(rgb, mul) {
  return [
    Math.max(0, Math.min(255, Math.round(rgb[0] * mul))),
    Math.max(0, Math.min(255, Math.round(rgb[1] * mul))),
    Math.max(0, Math.min(255, Math.round(rgb[2] * mul))),
  ];
}

function fillTile(ctx, tx, ty, drawFn) {
  const px = tx * TILE_SIZE;
  const py = ty * TILE_SIZE;
  ctx.save();
  ctx.translate(px, py);
  drawFn(ctx);
  ctx.restore();
}

// Deterministic-ish PRNG for stable per-tile noise patterns.
let _seed = 1;
function setNoiseSeed(s) { _seed = s | 0 || 1; }
function rng() {
  _seed = (_seed * 1664525 + 1013904223) | 0;
  return ((_seed >>> 0) % 10000) / 10000;
}

function drawNoise(ctx, baseRgb, intensity = 0.18) {
  const img = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const noise = (rng() - 0.5) * 2 * intensity;
    d[i]     = Math.max(0, Math.min(255, baseRgb[0] * (1 + noise)));
    d[i + 1] = Math.max(0, Math.min(255, baseRgb[1] * (1 + noise)));
    d[i + 2] = Math.max(0, Math.min(255, baseRgb[2] * (1 + noise)));
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function drawSolid(ctx, color, noiseAmt = 0.15) {
  const rgb = hexToRgb(color);
  ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  drawNoise(ctx, rgb, noiseAmt);
}

// Draw N small darker speckles using deterministic rng.
function speckles(ctx, baseRgb, count, mul = 0.7) {
  const c = shade(baseRgb, mul);
  ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng() * TILE_SIZE);
    const y = Math.floor(rng() * TILE_SIZE);
    ctx.fillRect(x, y, 1, 1);
  }
}

// Draw N small brighter speckles.
function highlights(ctx, baseRgb, count, mul = 1.25) {
  const c = shade(baseRgb, mul);
  ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng() * TILE_SIZE);
    const y = Math.floor(rng() * TILE_SIZE);
    ctx.fillRect(x, y, 1, 1);
  }
}

function drawGrassSide(ctx, dirtRgb, grassRgb) {
  ctx.fillStyle = `rgb(${dirtRgb[0]},${dirtRgb[1]},${dirtRgb[2]})`;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  drawNoise(ctx, dirtRgb, 0.22);
  speckles(ctx, dirtRgb, 18, 0.6);
  highlights(ctx, dirtRgb, 6, 1.2);
  // Top strip with grass.
  ctx.fillStyle = `rgb(${grassRgb[0]},${grassRgb[1]},${grassRgb[2]})`;
  ctx.fillRect(0, 0, TILE_SIZE, 4);
  // Ragged edge with shaded variation.
  for (let x = 0; x < TILE_SIZE; x++) {
    const h = 4 + (((x * 7) ^ (x * 3)) % 3);
    ctx.fillRect(x, 0, 1, h);
  }
  // A few darker grass tufts.
  const gd = shade(grassRgb, 0.65);
  ctx.fillStyle = `rgb(${gd[0]},${gd[1]},${gd[2]})`;
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rng() * TILE_SIZE);
    ctx.fillRect(x, 1, 1, 1);
  }
}

function drawWoodSide(ctx, color) {
  const rgb = hexToRgb(color);
  drawSolid(ctx, color, 0.12);
  // Bark grooves: vertical dark stripes with subtle randomness.
  const dark = shade(rgb, 0.55);
  const mid = shade(rgb, 0.78);
  ctx.fillStyle = `rgb(${dark[0]},${dark[1]},${dark[2]})`;
  ctx.fillRect(2, 0, 1, TILE_SIZE);
  ctx.fillRect(7, 0, 1, TILE_SIZE);
  ctx.fillRect(12, 0, 1, TILE_SIZE);
  ctx.fillStyle = `rgb(${mid[0]},${mid[1]},${mid[2]})`;
  ctx.fillRect(0, 0, 1, TILE_SIZE);
  ctx.fillRect(5, 0, 1, TILE_SIZE);
  ctx.fillRect(10, 0, 1, TILE_SIZE);
  ctx.fillRect(15, 0, 1, TILE_SIZE);
  // Horizontal nicks for bark feel.
  for (let i = 0; i < 5; i++) {
    const y = Math.floor(rng() * TILE_SIZE);
    const x = Math.floor(rng() * TILE_SIZE);
    ctx.fillStyle = `rgb(${dark[0]},${dark[1]},${dark[2]})`;
    ctx.fillRect(x, y, 2, 1);
  }
}

function drawWoodTop(ctx, color) {
  const rgb = hexToRgb(color);
  drawSolid(ctx, color, 0.08);
  const dark = shade(rgb, 0.6);
  const mid = shade(rgb, 0.78);
  ctx.strokeStyle = `rgb(${mid[0]},${mid[1]},${mid[2]})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(8, 8, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(8, 8, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `rgb(${dark[0]},${dark[1]},${dark[2]})`;
  ctx.beginPath();
  ctx.arc(8, 8, 2, 0, Math.PI * 2);
  ctx.stroke();
  // Pith dot.
  ctx.fillStyle = `rgb(${dark[0]},${dark[1]},${dark[2]})`;
  ctx.fillRect(8, 8, 1, 1);
}

function drawBrick(ctx, color) {
  drawSolid(ctx, color, 0.18);
  // Mortar (lighter gray-tan).
  ctx.fillStyle = '#cfc4ad';
  // Horizontal mortar lines.
  ctx.fillRect(0, 4, 16, 1);
  ctx.fillRect(0, 11, 16, 1);
  // Vertical mortar (offset rows).
  ctx.fillRect(7, 0, 1, 4);
  ctx.fillRect(15, 0, 1, 4);
  ctx.fillRect(3, 5, 1, 6);
  ctx.fillRect(11, 5, 1, 6);
  ctx.fillRect(7, 12, 1, 4);
  ctx.fillRect(15, 12, 1, 4);
}

function drawPlanks(ctx, color) {
  const rgb = hexToRgb(color);
  drawSolid(ctx, color, 0.12);
  const dark = shade(rgb, 0.55);
  const mid = shade(rgb, 0.75);
  // Horizontal seam lines between planks.
  ctx.fillStyle = `rgb(${dark[0]},${dark[1]},${dark[2]})`;
  ctx.fillRect(0, 3, 16, 1);
  ctx.fillRect(0, 11, 16, 1);
  // Plank end joins.
  ctx.fillRect(6, 0, 1, 3);
  ctx.fillRect(11, 4, 1, 7);
  ctx.fillRect(4, 12, 1, 4);
  // Wood grain.
  ctx.fillStyle = `rgb(${mid[0]},${mid[1]},${mid[2]})`;
  ctx.fillRect(2, 1, 3, 1);
  ctx.fillRect(8, 1, 4, 1);
  ctx.fillRect(1, 6, 4, 1);
  ctx.fillRect(7, 7, 4, 1);
  ctx.fillRect(13, 8, 2, 1);
  ctx.fillRect(2, 13, 6, 1);
  ctx.fillRect(10, 14, 4, 1);
}

function drawLeaves(ctx, color) {
  const rgb = hexToRgb(color);
  drawSolid(ctx, color, 0.28);
  speckles(ctx, rgb, 25, 0.55);
  highlights(ctx, rgb, 14, 1.25);
  // Tiny gaps for leaf-cluster feel.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rng() * TILE_SIZE);
    const y = Math.floor(rng() * TILE_SIZE);
    ctx.fillRect(x, y, 1, 1);
  }
}

function drawCobble(ctx, color) {
  const rgb = hexToRgb(color);
  // Solid base with strong noise.
  drawSolid(ctx, color, 0.25);
  speckles(ctx, rgb, 30, 0.6);
  highlights(ctx, rgb, 20, 1.25);
  // Mortar gaps between cobblestones (dark gridlines).
  ctx.fillStyle = '#1a1a1a';
  // Horizontal mortar lines.
  ctx.fillRect(0, 5, 16, 1);
  ctx.fillRect(0, 10, 16, 1);
  // Vertical mortar lines (each row offset).
  ctx.fillRect(6, 0, 1, 5);
  ctx.fillRect(12, 0, 1, 5);
  ctx.fillRect(3, 6, 1, 4);
  ctx.fillRect(9, 6, 1, 4);
  ctx.fillRect(14, 6, 1, 4);
  ctx.fillRect(5, 11, 1, 5);
  ctx.fillRect(11, 11, 1, 5);
}

function drawOre(ctx, _baseColor, oreColor) {
  drawSolid(ctx, 0x808080, 0.18);
  speckles(ctx, hexToRgb(0x808080), 18, 0.6);
  const c = hexToRgb(oreColor);
  ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
  // Crystal clusters.
  for (let i = 0; i < 4; i++) {
    const x = 1 + Math.floor(rng() * 12);
    const y = 1 + Math.floor(rng() * 12);
    ctx.fillRect(x, y, 2, 2);
    ctx.fillRect(x + 2, y + 1, 1, 1);
    ctx.fillRect(x - 1, y + 2, 1, 1);
  }
  // Bright highlights on each cluster.
  const hi = shade(c, 1.5);
  ctx.fillStyle = `rgb(${hi[0]},${hi[1]},${hi[2]})`;
  for (let i = 0; i < 4; i++) {
    const x = 1 + Math.floor(rng() * 12);
    const y = 1 + Math.floor(rng() * 12);
    ctx.fillRect(x, y, 1, 1);
  }
}

function drawGlass(ctx) {
  ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = 'rgba(184,229,255,0.25)';
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
}

function drawWater(ctx) {
  ctx.fillStyle = 'rgba(48,112,255,0.7)';
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  for (let i = 0; i < 12; i++) {
    const x = Math.floor(Math.random() * TILE_SIZE);
    const y = Math.floor(Math.random() * TILE_SIZE);
    ctx.fillRect(x, y, 2, 1);
  }
}

function drawWire(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = '#a01818';
  ctx.fillRect(7, 0, 2, 16);
  ctx.fillRect(0, 7, 16, 2);
}

function drawLever(ctx) {
  ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = '#444';
  ctx.fillRect(4, 12, 8, 4);
  ctx.fillStyle = '#aaa';
  ctx.fillRect(7, 4, 2, 9);
  ctx.fillStyle = '#ddd';
  ctx.fillRect(6, 2, 4, 4);
}

function drawButton(ctx) {
  ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = '#888';
  ctx.fillRect(5, 6, 6, 4);
  ctx.fillStyle = '#bbb';
  ctx.fillRect(5, 6, 6, 1);
}

function drawLamp(ctx, on) {
  drawSolid(ctx, on ? 0xffd060 : 0x806020, 0.1);
  ctx.fillStyle = on ? 'rgba(255,255,180,0.6)' : 'rgba(0,0,0,0.3)';
  ctx.fillRect(2, 2, 12, 12);
  ctx.strokeStyle = '#553';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 4; i <= 12; i += 4) {
    ctx.moveTo(i, 2); ctx.lineTo(i, 14);
    ctx.moveTo(2, i); ctx.lineTo(14, i);
  }
  ctx.stroke();
}

function drawBedrock(ctx) {
  drawSolid(ctx, 0x303030, 0.4);
}

function drawObsidian(ctx) {
  drawSolid(ctx, 0x150726, 0.3);
  speckles(ctx, hexToRgb(0x150726), 14, 0.55);
  // Sparkles in a few colors.
  const sparkles = ['rgba(180,140,255,0.85)', 'rgba(120,80,200,0.6)', 'rgba(220,180,255,0.9)'];
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rng() * TILE_SIZE);
    const y = Math.floor(rng() * TILE_SIZE);
    ctx.fillStyle = sparkles[i % sparkles.length];
    ctx.fillRect(x, y, 1, 1);
  }
  // Glassy highlight band.
  ctx.fillStyle = 'rgba(80,40,140,0.35)';
  ctx.fillRect(0, 5, 16, 1);
  ctx.fillRect(0, 10, 16, 1);
}

function drawEnder(ctx) {
  drawSolid(ctx, 0xe0d3a8, 0.16);
  speckles(ctx, hexToRgb(0xe0d3a8), 14, 0.78);
  ctx.fillStyle = 'rgba(80,40,90,0.55)';
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(rng() * TILE_SIZE);
    const y = Math.floor(rng() * TILE_SIZE);
    ctx.fillRect(x, y, 2, 1);
  }
  // Subtle cracks.
  ctx.fillStyle = 'rgba(120,80,80,0.45)';
  ctx.fillRect(2, 4, 5, 1);
  ctx.fillRect(9, 8, 4, 1);
  ctx.fillRect(4, 12, 6, 1);
}

function drawCrystal(ctx) {
  ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
  // Soft purple background.
  ctx.fillStyle = 'rgba(110,40,180,0.55)';
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  // Diamond gem facets, two-tone.
  ctx.fillStyle = 'rgba(200,140,255,0.95)';
  ctx.beginPath();
  ctx.moveTo(8, 1); ctx.lineTo(14, 8); ctx.lineTo(8, 15); ctx.lineTo(2, 8);
  ctx.closePath();
  ctx.fill();
  // Inner faceted highlight.
  ctx.fillStyle = 'rgba(255,220,255,0.9)';
  ctx.beginPath();
  ctx.moveTo(8, 3); ctx.lineTo(12, 8); ctx.lineTo(8, 12); ctx.lineTo(4, 8);
  ctx.closePath();
  ctx.fill();
  // Bright spark.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(7, 6, 2, 1);
  ctx.fillRect(7, 7, 1, 1);
  // Outline.
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(8, 1); ctx.lineTo(14, 8); ctx.lineTo(8, 15); ctx.lineTo(2, 8);
  ctx.closePath();
  ctx.stroke();
}

function drawGlowstone(ctx) {
  drawSolid(ctx, 0xf5b340, 0.1);
  speckles(ctx, hexToRgb(0xf5b340), 12, 0.7);
  // Bright cluster nodes.
  ctx.fillStyle = 'rgba(255,250,200,0.95)';
  const cx = [3, 9, 12, 5, 14];
  const cy = [3, 5, 11, 12, 8];
  for (let i = 0; i < cx.length; i++) {
    ctx.fillRect(cx[i], cy[i], 2, 2);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  for (let i = 0; i < cx.length; i++) {
    ctx.fillRect(cx[i], cy[i], 1, 1);
  }
  // Soft glow ring.
  ctx.fillStyle = 'rgba(255,200,80,0.4)';
  ctx.fillRect(0, 0, 16, 1);
  ctx.fillRect(0, 15, 16, 1);
  ctx.fillRect(0, 0, 1, 16);
  ctx.fillRect(15, 0, 1, 16);
}

function drawPortal(ctx) {
  ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
  // Deep purple base, slightly translucent.
  const grad = ctx.createLinearGradient(0, 0, 0, TILE_SIZE);
  grad.addColorStop(0, 'rgba(90,30,180,0.85)');
  grad.addColorStop(0.5, 'rgba(160,80,240,0.85)');
  grad.addColorStop(1, 'rgba(60,20,140,0.85)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  // Streaks of light.
  ctx.fillStyle = 'rgba(255,210,255,0.9)';
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(rng() * TILE_SIZE);
    const y = Math.floor(rng() * TILE_SIZE);
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(rng() * TILE_SIZE);
    const y = Math.floor(rng() * TILE_SIZE);
    ctx.fillRect(x, y, 1, 1);
  }
}

function drawChestSide(ctx) {
  // Wood base.
  drawSolid(ctx, 0x8a5a2b, 0.13);
  // Plank seam (chest is two halves).
  ctx.fillStyle = '#3a2810';
  ctx.fillRect(0, 7, TILE_SIZE, 1);
  // Iron banding (top + bottom + corners).
  ctx.fillStyle = '#3a3a40';
  ctx.fillRect(0, 0, TILE_SIZE, 1);
  ctx.fillRect(0, 15, TILE_SIZE, 1);
  ctx.fillRect(0, 0, 1, TILE_SIZE);
  ctx.fillRect(15, 0, 1, TILE_SIZE);
  // Iron rivets.
  ctx.fillStyle = '#9aa0a8';
  ctx.fillRect(2, 1, 1, 1);
  ctx.fillRect(13, 1, 1, 1);
  ctx.fillRect(2, 14, 1, 1);
  ctx.fillRect(13, 14, 1, 1);
  // Lock plate.
  ctx.fillStyle = '#3a3a40';
  ctx.fillRect(7, 5, 2, 5);
  ctx.fillStyle = '#d9b35a';
  ctx.fillRect(7, 6, 2, 3);
  ctx.fillStyle = '#7a6020';
  ctx.fillRect(7, 8, 2, 1);
}

function drawChestTop(ctx) {
  drawSolid(ctx, 0x6e4520, 0.12);
  // Iron strapping along the lid.
  ctx.fillStyle = '#3a3a40';
  ctx.fillRect(0, 0, TILE_SIZE, 1);
  ctx.fillRect(0, 15, TILE_SIZE, 1);
  ctx.fillRect(0, 0, 1, TILE_SIZE);
  ctx.fillRect(15, 0, 1, TILE_SIZE);
  ctx.fillRect(7, 0, 1, TILE_SIZE);
  // Wood grain.
  ctx.fillStyle = '#5a3915';
  ctx.fillRect(2, 4, 4, 1);
  ctx.fillRect(9, 8, 5, 1);
  ctx.fillRect(3, 12, 3, 1);
}

// Returns a Three.js texture for the atlas.
export function buildAtlasTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Helper to write at index N: tx = N % TILES_PER_ROW, ty = N / TILES_PER_ROW.
  // Each tile gets a deterministic noise seed derived from its index so the
  // procedural patterns stay stable across reloads.
  const set = (idx, drawer) => {
    const tx = idx % TILES_PER_ROW;
    const ty = Math.floor(idx / TILES_PER_ROW);
    setNoiseSeed(idx * 9176 + 31);
    fillTile(ctx, tx, ty, drawer);
  };

  // Default: solid color tiles for every world-block id*3 + face.
  // Tools (placeable=false) don't need world tiles.
  for (const [id, def] of Object.entries(BLOCKS)) {
    const blockId = Number(id);
    if (blockId === BLOCK.AIR) continue;
    if (def.placeable === false) continue;
    const top = def.topColor ?? def.color;
    const side = def.sideColor ?? def.color;
    const bottom = def.bottomColor ?? def.color;
    set(tileIndex(blockId, 0), (c) => drawSolid(c, top, 0.12));
    set(tileIndex(blockId, 1), (c) => drawSolid(c, side, 0.12));
    set(tileIndex(blockId, 2), (c) => drawSolid(c, bottom, 0.12));
  }

  // Custom drawings overriding defaults.
  const grassDirt = hexToRgb(BLOCKS[BLOCK.DIRT].color);
  const grassTop = hexToRgb(BLOCKS[BLOCK.GRASS].color);
  set(tileIndex(BLOCK.GRASS, 0), (c) => { drawSolid(c, BLOCKS[BLOCK.GRASS].color, 0.2); });
  set(tileIndex(BLOCK.GRASS, 1), (c) => drawGrassSide(c, grassDirt, grassTop));
  set(tileIndex(BLOCK.GRASS, 2), (c) => drawSolid(c, BLOCKS[BLOCK.DIRT].color, 0.18));

  set(tileIndex(BLOCK.DIRT, 0), (c) => drawSolid(c, BLOCKS[BLOCK.DIRT].color, 0.18));
  set(tileIndex(BLOCK.DIRT, 1), (c) => drawSolid(c, BLOCKS[BLOCK.DIRT].color, 0.18));
  set(tileIndex(BLOCK.DIRT, 2), (c) => drawSolid(c, BLOCKS[BLOCK.DIRT].color, 0.18));

  set(tileIndex(BLOCK.STONE, 0), (c) => drawSolid(c, BLOCKS[BLOCK.STONE].color, 0.16));
  set(tileIndex(BLOCK.STONE, 1), (c) => drawSolid(c, BLOCKS[BLOCK.STONE].color, 0.16));
  set(tileIndex(BLOCK.STONE, 2), (c) => drawSolid(c, BLOCKS[BLOCK.STONE].color, 0.16));

  set(tileIndex(BLOCK.COBBLESTONE, 0), (c) => drawCobble(c, BLOCKS[BLOCK.COBBLESTONE].color));
  set(tileIndex(BLOCK.COBBLESTONE, 1), (c) => drawCobble(c, BLOCKS[BLOCK.COBBLESTONE].color));
  set(tileIndex(BLOCK.COBBLESTONE, 2), (c) => drawCobble(c, BLOCKS[BLOCK.COBBLESTONE].color));

  set(tileIndex(BLOCK.WOOD, 0), (c) => drawWoodTop(c, BLOCKS[BLOCK.WOOD].topColor));
  set(tileIndex(BLOCK.WOOD, 1), (c) => drawWoodSide(c, BLOCKS[BLOCK.WOOD].sideColor));
  set(tileIndex(BLOCK.WOOD, 2), (c) => drawWoodTop(c, BLOCKS[BLOCK.WOOD].bottomColor));

  set(tileIndex(BLOCK.LEAVES, 0), (c) => drawLeaves(c, BLOCKS[BLOCK.LEAVES].color));
  set(tileIndex(BLOCK.LEAVES, 1), (c) => drawLeaves(c, BLOCKS[BLOCK.LEAVES].color));
  set(tileIndex(BLOCK.LEAVES, 2), (c) => drawLeaves(c, BLOCKS[BLOCK.LEAVES].color));

  set(tileIndex(BLOCK.PLANKS, 0), (c) => drawPlanks(c, BLOCKS[BLOCK.PLANKS].color));
  set(tileIndex(BLOCK.PLANKS, 1), (c) => drawPlanks(c, BLOCKS[BLOCK.PLANKS].color));
  set(tileIndex(BLOCK.PLANKS, 2), (c) => drawPlanks(c, BLOCKS[BLOCK.PLANKS].color));

  set(tileIndex(BLOCK.BRICK, 0), (c) => drawBrick(c, BLOCKS[BLOCK.BRICK].color));
  set(tileIndex(BLOCK.BRICK, 1), (c) => drawBrick(c, BLOCKS[BLOCK.BRICK].color));
  set(tileIndex(BLOCK.BRICK, 2), (c) => drawBrick(c, BLOCKS[BLOCK.BRICK].color));

  set(tileIndex(BLOCK.GOLD, 0), (c) => drawOre(c, 0x808080, 0xf5d442));
  set(tileIndex(BLOCK.GOLD, 1), (c) => drawOre(c, 0x808080, 0xf5d442));
  set(tileIndex(BLOCK.GOLD, 2), (c) => drawOre(c, 0x808080, 0xf5d442));
  set(tileIndex(BLOCK.IRON, 0), (c) => drawOre(c, 0x808080, 0xd9c8a8));
  set(tileIndex(BLOCK.IRON, 1), (c) => drawOre(c, 0x808080, 0xd9c8a8));
  set(tileIndex(BLOCK.IRON, 2), (c) => drawOre(c, 0x808080, 0xd9c8a8));
  set(tileIndex(BLOCK.COAL, 0), (c) => drawOre(c, 0x808080, 0x111111));
  set(tileIndex(BLOCK.COAL, 1), (c) => drawOre(c, 0x808080, 0x111111));
  set(tileIndex(BLOCK.COAL, 2), (c) => drawOre(c, 0x808080, 0x111111));

  set(tileIndex(BLOCK.GLASS, 0), drawGlass);
  set(tileIndex(BLOCK.GLASS, 1), drawGlass);
  set(tileIndex(BLOCK.GLASS, 2), drawGlass);

  set(tileIndex(BLOCK.WATER, 0), drawWater);
  set(tileIndex(BLOCK.WATER, 1), drawWater);
  set(tileIndex(BLOCK.WATER, 2), drawWater);

  set(tileIndex(BLOCK.WIRE, 0), drawWire);
  set(tileIndex(BLOCK.WIRE, 1), drawWire);
  set(tileIndex(BLOCK.WIRE, 2), drawWire);
  set(tileIndex(BLOCK.LEVER, 0), drawLever);
  set(tileIndex(BLOCK.LEVER, 1), drawLever);
  set(tileIndex(BLOCK.LEVER, 2), drawLever);
  set(tileIndex(BLOCK.BUTTON, 0), drawButton);
  set(tileIndex(BLOCK.BUTTON, 1), drawButton);
  set(tileIndex(BLOCK.BUTTON, 2), drawButton);
  set(tileIndex(BLOCK.LAMP, 0), (c) => drawLamp(c, false));
  set(tileIndex(BLOCK.LAMP, 1), (c) => drawLamp(c, false));
  set(tileIndex(BLOCK.LAMP, 2), (c) => drawLamp(c, false));

  set(tileIndex(BLOCK.SAND, 0), (c) => drawSolid(c, BLOCKS[BLOCK.SAND].color, 0.1));
  set(tileIndex(BLOCK.SAND, 1), (c) => drawSolid(c, BLOCKS[BLOCK.SAND].color, 0.1));
  set(tileIndex(BLOCK.SAND, 2), (c) => drawSolid(c, BLOCKS[BLOCK.SAND].color, 0.1));

  set(tileIndex(BLOCK.SNOW, 0), (c) => drawSolid(c, 0xffffff, 0.05));
  set(tileIndex(BLOCK.SNOW, 1), (c) => drawSolid(c, 0xffffff, 0.05));
  set(tileIndex(BLOCK.SNOW, 2), (c) => drawSolid(c, 0xffffff, 0.05));

  set(tileIndex(BLOCK.BEDROCK, 0), drawBedrock);
  set(tileIndex(BLOCK.BEDROCK, 1), drawBedrock);
  set(tileIndex(BLOCK.BEDROCK, 2), drawBedrock);

  // Magic dimension blocks.
  set(tileIndex(BLOCK.OBSIDIAN, 0), (c) => drawObsidian(c));
  set(tileIndex(BLOCK.OBSIDIAN, 1), (c) => drawObsidian(c));
  set(tileIndex(BLOCK.OBSIDIAN, 2), (c) => drawObsidian(c));
  set(tileIndex(BLOCK.ENDER_STONE, 0), (c) => drawEnder(c));
  set(tileIndex(BLOCK.ENDER_STONE, 1), (c) => drawEnder(c));
  set(tileIndex(BLOCK.ENDER_STONE, 2), (c) => drawEnder(c));
  set(tileIndex(BLOCK.MAGIC_CRYSTAL, 0), (c) => drawCrystal(c));
  set(tileIndex(BLOCK.MAGIC_CRYSTAL, 1), (c) => drawCrystal(c));
  set(tileIndex(BLOCK.MAGIC_CRYSTAL, 2), (c) => drawCrystal(c));
  set(tileIndex(BLOCK.GLOWSTONE, 0), (c) => drawGlowstone(c));
  set(tileIndex(BLOCK.GLOWSTONE, 1), (c) => drawGlowstone(c));
  set(tileIndex(BLOCK.GLOWSTONE, 2), (c) => drawGlowstone(c));
  set(tileIndex(BLOCK.PORTAL, 0), (c) => drawPortal(c));
  set(tileIndex(BLOCK.PORTAL, 1), (c) => drawPortal(c));
  set(tileIndex(BLOCK.PORTAL, 2), (c) => drawPortal(c));

  // Chest.
  set(tileIndex(BLOCK.CHEST, 0), (c) => drawChestTop(c));
  set(tileIndex(BLOCK.CHEST, 1), (c) => drawChestSide(c));
  set(tileIndex(BLOCK.CHEST, 2), (c) => drawChestTop(c));

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  return { texture: tex, canvas };
}

// UV rect (u0,v0,u1,v1) for a given tile index in atlas space [0..1].
export function tileUV(tileIdx) {
  const tx = tileIdx % TILES_PER_ROW;
  const ty = Math.floor(tileIdx / TILES_PER_ROW);
  // Inset slightly to avoid bleeding from neighbor tiles.
  const inset = 0.5 / ATLAS_SIZE;
  const u0 = tx / TILES_PER_ROW + inset;
  const u1 = (tx + 1) / TILES_PER_ROW - inset;
  // Texture y is flipped vs canvas: row 0 sits at the top of the canvas, but
  // Three.js convention treats v=0 at the bottom. We invert so tile 0 corresponds
  // to the upper-left visually.
  const v1 = 1 - (ty / TILES_PER_ROW) - inset;
  const v0 = 1 - ((ty + 1) / TILES_PER_ROW) + inset;
  return [u0, v0, u1, v1];
}

// Color swatch for inventory UI (returns hex string).
export function blockSwatch(blockId) {
  const def = BLOCKS[blockId];
  if (!def) return '#000';
  const c = def.topColor ?? def.color;
  return `#${c.toString(16).padStart(6, '0')}`;
}
