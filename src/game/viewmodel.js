// First-person held-item viewmodel. A small mesh attached to the camera that
// shows what the player is currently holding (block, pickaxe, sword, axe,
// shovel) and animates a swing on use.

import * as THREE from 'three';
import { BLOCK, BLOCKS, isTool, toolKind } from '../engine/blocks.js';
import { tileIndex, tileUV, faceToTileFace } from '../engine/textures.js';

const HOLD_OFFSET = new THREE.Vector3(0.34, -0.28, -0.55);

// Build a textured mini-cube using the world atlas for a held block preview.
function buildBlockMesh(blockId, atlasMaterial) {
  const g = new THREE.BoxGeometry(0.32, 0.32, 0.32);
  // Three.js BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z (matches mesher).
  const faceOrder = [0, 1, 2, 3, 4, 5];
  const uv = g.attributes.uv;
  for (let i = 0; i < 6; i++) {
    const tile = tileIndex(blockId, faceToTileFace(faceOrder[i]));
    const [u0, v0, u1, v1] = tileUV(tile);
    // Each face: 4 vertices, BoxGeometry uv layout (top-left, top-right,
    // bottom-left, bottom-right).
    const o = i * 4;
    uv.setXY(o + 0, u0, v1);
    uv.setXY(o + 1, u1, v1);
    uv.setXY(o + 2, u0, v0);
    uv.setXY(o + 3, u1, v0);
  }
  uv.needsUpdate = true;
  // Atlas material uses vertexColors: true, so we need to provide a white
  // color attribute or the cube renders black.
  const colors = new Float32Array(g.attributes.position.count * 3);
  colors.fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(g, atlasMaterial);
  return mesh;
}

// Build a small canvas texture of size 16x16 used as a sprite for tool icons
// shown both in the viewmodel and the hotbar.
function makeToolTexture(drawer) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawer(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Pixel-art tool drawers. Each draws a 16x16 silhouette on a transparent
// background. Coordinates use canvas convention (y down).
function drawPickaxeIcon(ctx) {
  ctx.clearRect(0, 0, 16, 16);
  // Wooden handle (diagonal from bottom-left to upper-right).
  ctx.fillStyle = '#5e3a1a';
  for (let i = 0; i < 8; i++) ctx.fillRect(8 - i, 7 + i, 1, 1);
  ctx.fillStyle = '#8b5a2b';
  for (let i = 0; i < 8; i++) ctx.fillRect(7 - i, 7 + i, 1, 1);
  // Iron head (top-right wedge).
  ctx.fillStyle = '#a9a9b3';
  ctx.fillRect(8, 1, 5, 1);
  ctx.fillRect(9, 2, 5, 1);
  ctx.fillRect(10, 3, 5, 1);
  ctx.fillRect(11, 4, 4, 1);
  ctx.fillRect(11, 5, 3, 1);
  ctx.fillStyle = '#d6d6dd';
  ctx.fillRect(12, 1, 1, 1);
  ctx.fillRect(13, 2, 1, 1);
  ctx.fillRect(14, 3, 1, 1);
  ctx.fillStyle = '#7c7c84';
  ctx.fillRect(8, 4, 3, 1);
}

function drawAxeIcon(ctx) {
  ctx.clearRect(0, 0, 16, 16);
  // Handle.
  ctx.fillStyle = '#5e3a1a';
  for (let i = 0; i < 9; i++) ctx.fillRect(7 - i, 7 + i, 1, 1);
  ctx.fillStyle = '#8b5a2b';
  for (let i = 0; i < 9; i++) ctx.fillRect(6 - i, 7 + i, 1, 1);
  // Iron blade (large square at upper right).
  ctx.fillStyle = '#a9a9b3';
  ctx.fillRect(8, 1, 6, 5);
  ctx.fillStyle = '#d6d6dd';
  ctx.fillRect(8, 1, 6, 1);
  ctx.fillRect(8, 1, 1, 5);
  ctx.fillStyle = '#7c7c84';
  ctx.fillRect(13, 5, 1, 1);
}

function drawShovelIcon(ctx) {
  ctx.clearRect(0, 0, 16, 16);
  ctx.fillStyle = '#5e3a1a';
  for (let i = 0; i < 9; i++) ctx.fillRect(8 - i, 7 + i, 1, 1);
  ctx.fillStyle = '#8b5a2b';
  for (let i = 0; i < 9; i++) ctx.fillRect(7 - i, 7 + i, 1, 1);
  // Spade head (rounded triangle at upper-right).
  ctx.fillStyle = '#a9a9b3';
  ctx.fillRect(10, 1, 4, 2);
  ctx.fillRect(9, 3, 5, 2);
  ctx.fillRect(10, 5, 3, 1);
  ctx.fillStyle = '#d6d6dd';
  ctx.fillRect(10, 1, 4, 1);
  ctx.fillStyle = '#7c7c84';
  ctx.fillRect(11, 5, 2, 1);
}

function drawSwordIcon(ctx) {
  ctx.clearRect(0, 0, 16, 16);
  // Handle / pommel.
  ctx.fillStyle = '#5e3a1a';
  ctx.fillRect(2, 12, 3, 1);
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(3, 13, 3, 1);
  ctx.fillRect(2, 14, 1, 1);
  // Cross-guard.
  ctx.fillStyle = '#3a2810';
  ctx.fillRect(4, 11, 5, 1);
  // Blade (diagonal silver from lower-left to upper-right).
  ctx.fillStyle = '#cfd6e0';
  for (let i = 0; i < 9; i++) ctx.fillRect(5 + i, 10 - i, 1, 1);
  ctx.fillStyle = '#f0f3f8';
  for (let i = 0; i < 9; i++) ctx.fillRect(6 + i, 10 - i, 1, 1);
  ctx.fillStyle = '#8a929c';
  for (let i = 0; i < 8; i++) ctx.fillRect(5 + i, 11 - i, 1, 1);
}

const TOOL_DRAWERS = {
  pickaxe: drawPickaxeIcon,
  axe: drawAxeIcon,
  shovel: drawShovelIcon,
  sword: drawSwordIcon,
};

// Build a flat 2-sided plane mesh that displays the tool icon.
function buildToolMesh(toolName) {
  const tex = makeToolTexture(TOOL_DRAWERS[toolName] ?? drawPickaxeIcon);
  const g = new THREE.PlaneGeometry(0.4, 0.4);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.05,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });
  const plane = new THREE.Mesh(g, mat);
  plane.renderOrder = 1000;
  return plane;
}

export class ViewModel {
  constructor(camera, atlasMaterial) {
    this.camera = camera;
    // A clone of the world's atlas material with depth testing disabled, so
    // the held block always renders on top of nearby world geometry instead
    // of clipping through it.
    this.atlasMaterial = atlasMaterial.clone();
    this.atlasMaterial.depthTest = false;
    this.atlasMaterial.depthWrite = false;
    this.root = new THREE.Group();
    this.root.position.copy(HOLD_OFFSET);
    this.root.renderOrder = 999;
    this.camera.add(this.root);
    this.currentBlockId = null;
    this.swingT = 0;     // 0..1 progress through a swing animation
    this.bobT = 0;
    this._lastWalkVel = 0;
  }

  // Replace the current held mesh.
  setHeld(blockId) {
    if (blockId === this.currentBlockId) return;
    this.currentBlockId = blockId;
    while (this.root.children.length) {
      const c = this.root.children[0];
      this.root.remove(c);
      if (c.geometry) c.geometry.dispose();
    }
    if (blockId == null || blockId === BLOCK.AIR) return;
    let mesh;
    if (isTool(blockId)) {
      mesh = buildToolMesh(toolKind(blockId));
      // Tilt the tool to feel held.
      mesh.rotation.z = -Math.PI / 5;
      mesh.rotation.y = 0.15;
    } else if (BLOCKS[blockId] && BLOCKS[blockId].placeable !== false) {
      mesh = buildBlockMesh(blockId, this.atlasMaterial);
      mesh.rotation.x = -0.25;
      mesh.rotation.y = -0.7;
      mesh.renderOrder = 1000;
    } else {
      return;
    }
    this.root.add(mesh);
  }

  // Trigger a swing animation (0..1) over the next ~0.25s.
  triggerSwing() {
    this.swingT = 0.0001;
  }

  update(dt, walkSpeed) {
    // Swing animation.
    if (this.swingT > 0) {
      this.swingT += dt / 0.28;
      if (this.swingT >= 1) this.swingT = 0;
    }
    // Bobbing tied to walk speed.
    const targetBob = Math.min(1, walkSpeed / 5);
    this._lastWalkVel += (targetBob - this._lastWalkVel) * Math.min(1, dt * 6);
    this.bobT += dt * 8 * (0.5 + this._lastWalkVel);

    const swing = this.swingT;
    const swingArc = Math.sin(swing * Math.PI); // 0 -> 1 -> 0
    const bobX = Math.cos(this.bobT) * 0.025 * this._lastWalkVel;
    const bobY = Math.abs(Math.sin(this.bobT)) * 0.03 * this._lastWalkVel;
    this.root.position.set(
      HOLD_OFFSET.x + bobX - swingArc * 0.2,
      HOLD_OFFSET.y + bobY - swingArc * 0.15,
      HOLD_OFFSET.z + swingArc * 0.1,
    );
    this.root.rotation.x = -swingArc * 0.6;
    this.root.rotation.z = -swingArc * 0.3;
  }
}

// Re-export the icon drawers so the HUD hotbar can paint matching swatches.
export const TOOL_ICON_DRAWERS = TOOL_DRAWERS;
