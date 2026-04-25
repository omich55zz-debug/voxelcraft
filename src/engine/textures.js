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

function drawNoise(ctx, baseRgb, intensity = 0.18) {
  const img = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * 2 * intensity;
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

function drawGrassSide(ctx, dirtRgb, grassRgb) {
  ctx.fillStyle = `rgb(${dirtRgb[0]},${dirtRgb[1]},${dirtRgb[2]})`;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  drawNoise(ctx, dirtRgb, 0.18);
  // Top strip with grass.
  ctx.fillStyle = `rgb(${grassRgb[0]},${grassRgb[1]},${grassRgb[2]})`;
  ctx.fillRect(0, 0, TILE_SIZE, 4);
  // Ragged edge.
  for (let x = 0; x < TILE_SIZE; x++) {
    const h = 4 + ((x * 7) % 3);
    ctx.fillRect(x, 0, 1, h);
  }
}

function drawWoodSide(ctx, color) {
  drawSolid(ctx, color, 0.1);
  // Vertical bands.
  const dark = shade(hexToRgb(color), 0.7);
  ctx.fillStyle = `rgb(${dark[0]},${dark[1]},${dark[2]})`;
  for (let x = 0; x < TILE_SIZE; x++) {
    if (x % 5 === 0) ctx.fillRect(x, 0, 1, TILE_SIZE);
  }
}

function drawWoodTop(ctx, color) {
  const rgb = hexToRgb(color);
  drawSolid(ctx, color, 0.1);
  // Concentric rings.
  ctx.strokeStyle = `rgb(${shade(rgb, 0.7).join(',')})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(8, 8, 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(8, 8, 6, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBrick(ctx, color) {
  drawSolid(ctx, color, 0.12);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  // Two rows of bricks, offset.
  ctx.beginPath();
  ctx.moveTo(0, 8); ctx.lineTo(16, 8);
  ctx.moveTo(8, 0); ctx.lineTo(8, 8);
  ctx.moveTo(0, 0); ctx.lineTo(0, 8);
  ctx.moveTo(16, 8); ctx.lineTo(16, 16);
  ctx.moveTo(4, 8); ctx.lineTo(4, 16);
  ctx.moveTo(12, 8); ctx.lineTo(12, 16);
  ctx.stroke();
}

function drawPlanks(ctx, color) {
  const rgb = hexToRgb(color);
  drawSolid(ctx, color, 0.1);
  ctx.strokeStyle = `rgb(${shade(rgb, 0.6).join(',')})`;
  ctx.beginPath();
  for (let y = 0; y < TILE_SIZE; y += 4) {
    ctx.moveTo(0, y); ctx.lineTo(TILE_SIZE, y);
  }
  ctx.stroke();
}

function drawLeaves(ctx, color) {
  const rgb = hexToRgb(color);
  drawSolid(ctx, color, 0.25);
  // Small darker dots.
  const dark = shade(rgb, 0.65);
  ctx.fillStyle = `rgb(${dark[0]},${dark[1]},${dark[2]})`;
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(Math.random() * TILE_SIZE);
    const y = Math.floor(Math.random() * TILE_SIZE);
    ctx.fillRect(x, y, 1, 1);
  }
}

function drawCobble(ctx, color) {
  drawSolid(ctx, color, 0.18);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 5); ctx.lineTo(7, 5); ctx.lineTo(7, 0);
  ctx.moveTo(7, 8); ctx.lineTo(16, 8);
  ctx.moveTo(4, 8); ctx.lineTo(4, 16);
  ctx.moveTo(11, 8); ctx.lineTo(11, 13); ctx.lineTo(16, 13);
  ctx.stroke();
}

function drawOre(ctx, _baseColor, oreColor) {
  drawSolid(ctx, 0x808080, 0.15);
  const c = hexToRgb(oreColor);
  ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
  // 4-5 random cluster patches.
  for (let i = 0; i < 5; i++) {
    const x = 2 + Math.floor(Math.random() * 12);
    const y = 2 + Math.floor(Math.random() * 12);
    ctx.fillRect(x, y, 2, 2);
    ctx.fillRect(x + 1, y - 1, 1, 1);
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
  drawSolid(ctx, 0x1a0a30, 0.35);
  // Sparkles.
  ctx.fillStyle = 'rgba(180,140,255,0.5)';
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(Math.random() * TILE_SIZE);
    const y = Math.floor(Math.random() * TILE_SIZE);
    ctx.fillRect(x, y, 1, 1);
  }
}

function drawEnder(ctx) {
  drawSolid(ctx, 0xd0c2a0, 0.18);
  ctx.fillStyle = 'rgba(80,40,90,0.4)';
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(Math.random() * TILE_SIZE);
    const y = Math.floor(Math.random() * TILE_SIZE);
    ctx.fillRect(x, y, 2, 1);
  }
}

function drawCrystal(ctx) {
  ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = 'rgba(160,80,255,0.55)';
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = 'rgba(255,200,255,0.8)';
  ctx.beginPath();
  ctx.moveTo(8, 1); ctx.lineTo(13, 8); ctx.lineTo(8, 15); ctx.lineTo(3, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(8, 3); ctx.lineTo(11, 8); ctx.lineTo(8, 13);
  ctx.stroke();
}

function drawGlowstone(ctx) {
  drawSolid(ctx, 0xffd070, 0.05);
  ctx.fillStyle = 'rgba(255,255,180,0.6)';
  for (let i = 0; i < 8; i++) {
    const x = 1 + Math.floor(Math.random() * 14);
    const y = 1 + Math.floor(Math.random() * 14);
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawPortal(ctx) {
  ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = 'rgba(154,58,252,0.5)';
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = 'rgba(220,160,255,0.7)';
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(Math.random() * TILE_SIZE);
    const y = Math.floor(Math.random() * TILE_SIZE);
    ctx.fillRect(x, y, 1, 1);
  }
}

function drawChestSide(ctx) {
  drawSolid(ctx, 0x8a5a2b, 0.12);
  ctx.fillStyle = '#5a3915';
  ctx.fillRect(0, 0, TILE_SIZE, 2);
  ctx.fillRect(0, 14, TILE_SIZE, 2);
  ctx.fillRect(0, 0, 2, TILE_SIZE);
  ctx.fillRect(14, 0, 2, TILE_SIZE);
  ctx.fillStyle = '#3a2810';
  ctx.fillRect(0, 7, TILE_SIZE, 1);
  // Lock.
  ctx.fillStyle = '#d9b35a';
  ctx.fillRect(7, 6, 2, 4);
}

function drawChestTop(ctx) {
  drawSolid(ctx, 0x6e4520, 0.12);
  ctx.fillStyle = '#5a3915';
  ctx.fillRect(0, 0, TILE_SIZE, 2);
  ctx.fillRect(0, 14, TILE_SIZE, 2);
  ctx.fillRect(0, 0, 2, TILE_SIZE);
  ctx.fillRect(14, 0, 2, TILE_SIZE);
}

// Returns a Three.js texture for the atlas.
export function buildAtlasTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Helper to write at index N: tx = N % TILES_PER_ROW, ty = N / TILES_PER_ROW.
  const set = (idx, drawer) => {
    const tx = idx % TILES_PER_ROW;
    const ty = Math.floor(idx / TILES_PER_ROW);
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
