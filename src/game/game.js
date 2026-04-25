// Core game loop: scene/renderer setup, chunk meshing, input, AI, day/night.

import * as THREE from 'three';

import { World, CHUNK_SIZE, WORLD_CHUNKS_X, WORLD_CHUNKS_Z } from '../engine/world.js';
import { buildChunkMesh } from '../engine/mesher.js';
import { buildAtlasTexture } from '../engine/textures.js';
import { Player, MODE } from '../engine/player.js';
import { raycastVoxel } from '../engine/raycast.js';
import { BLOCK, BLOCKS, blockHardness, isRedstone } from '../engine/blocks.js';
import { RedstoneSim } from '../engine/redstone.js';
import { Inventory } from './inventory.js';
import { Zombie } from './mobs.js';
import { saveGame } from './save.js';
import { EducationState } from './education.js';

const PLACE_DELAY = 180; // ms between placements when holding RMB

export class Game {
  constructor(canvas, hud) {
    this.canvas = canvas;
    this.hud = hud;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x88bbee);
    this.scene.fog = new THREE.Fog(0x88bbee, 50, 140);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Lighting (sun + ambient).
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sunLight.position.set(50, 100, 30);
    this.scene.add(this.sunLight);
    this.ambient = new THREE.AmbientLight(0x6677aa, 0.6);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0xfffbe0, 0x4a3825, 0.4);
    this.scene.add(this.hemi);

    // Atlas texture & material.
    const atlas = buildAtlasTexture();
    this.atlasTexture = atlas.texture;
    this.opaqueMaterial = new THREE.MeshLambertMaterial({
      map: this.atlasTexture,
      vertexColors: true,
      alphaTest: 0.5,
    });
    this.transparentMaterial = new THREE.MeshLambertMaterial({
      map: this.atlasTexture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
    });

    // World + player + inventory + redstone sim.
    this.world = null;
    this.player = new Player(this.camera);
    this.inventory = new Inventory(true);
    this.hud.inventory = this.inventory;
    this.hud.buildHotbar();
    this.redstone = null;
    this.education = null;

    this.chunkMeshes = new Map(); // key -> { opaque, transparent }

    // Selection highlight.
    const wireGeom = new THREE.BoxGeometry(1.001, 1.001, 1.001);
    const edges = new THREE.EdgesGeometry(wireGeom);
    this.selectionMesh = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
    this.selectionMesh.visible = false;
    this.scene.add(this.selectionMesh);

    // Mobs + container.
    this.mobs = [];
    this.mobGroup = new THREE.Group();
    this.scene.add(this.mobGroup);

    // Input state.
    this.keys = new Set();
    this.mouseButtons = { left: false, right: false };
    this._lastPlace = 0;
    this._breakHoldTime = 0;
    this._breakingTarget = null;
    this.pointerLocked = false;

    // Time of day (0..1, 0 = midnight, 0.5 = noon).
    this.timeOfDay = 0.4;
    this.daySpeed = 1 / 600; // 10 minute day cycle
    this._mobSpawnAccumulator = 0;
    this.paused = true;
    this.running = false;
    this._lastT = 0;
    this._frameRaf = null;

    this._bindInput();
    this._resize();
    addEventListener('resize', () => this._resize());
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  startNewWorld(seed, mode) {
    this.disposeWorld();
    this.world = new World(seed);
    this.redstone = new RedstoneSim(this.world);
    this.player = new Player(this.camera);
    this.player.setMode(mode);
    this.inventory = new Inventory(mode === MODE.CREATIVE || mode === MODE.EDUCATION);
    this.hud.inventory = this.inventory;
    this.hud.buildHotbar();
    if (mode === MODE.EDUCATION) {
      this.education = new EducationState(this.player);
    } else {
      this.education = null;
    }
    this.timeOfDay = 0.35;
    // Spawn at the world center, on the ground.
    const sx = (CHUNK_SIZE * WORLD_CHUNKS_X) / 2 + 0.5;
    const sz = (CHUNK_SIZE * WORLD_CHUNKS_Z) / 2 + 0.5;
    let sy = 60;
    for (let y = 60; y >= 1; y--) {
      const id = this.world.getBlock(Math.floor(sx), y, Math.floor(sz));
      if (id !== BLOCK.AIR && id !== BLOCK.WATER) { sy = y + 1; break; }
    }
    this.player.position.set(sx, sy, sz);
    if (this.education) {
      this.education.startPos.copy(this.player.position);
      this.education.startYaw = this.player.yaw;
    }
    this.regenAllChunks();
  }

  loadFromSave(save) {
    this.disposeWorld();
    const mode = save.player.mode || MODE.CREATIVE;
    this.world = new World(save.seed);
    this.world.applyChanges(save.changes || {});
    this.redstone = new RedstoneSim(this.world);
    this.player = new Player(this.camera);
    this.player.setMode(mode);
    this.player.position.set(save.player.x, save.player.y, save.player.z);
    this.player.yaw = save.player.yaw || 0;
    this.player.pitch = save.player.pitch || 0;
    this.player.hp = save.player.hp ?? this.player.maxHp;
    this.player.hunger = save.player.hunger ?? this.player.maxHunger;
    this.timeOfDay = save.timeOfDay ?? 0.4;
    this.inventory = new Inventory(save.inventory?.creative ?? (mode === MODE.CREATIVE));
    if (save.inventory?.hotbar) this.inventory.hotbar = save.inventory.hotbar;
    if (save.inventory?.selected != null) this.inventory.selected = save.inventory.selected;
    if (save.inventory?.counts) {
      for (const [k, v] of Object.entries(save.inventory.counts)) {
        this.inventory.counts.set(Number(k), v);
      }
    }
    this.hud.inventory = this.inventory;
    this.hud.buildHotbar();
    this.education = mode === MODE.EDUCATION ? new EducationState(this.player) : null;
    this.regenAllChunks();
  }

  disposeWorld() {
    for (const meshes of this.chunkMeshes.values()) {
      if (meshes.opaque) {
        this.scene.remove(meshes.opaque);
        meshes.opaque.geometry.dispose();
      }
      if (meshes.transparent) {
        this.scene.remove(meshes.transparent);
        meshes.transparent.geometry.dispose();
      }
    }
    this.chunkMeshes.clear();
    while (this.mobGroup.children.length) this.mobGroup.remove(this.mobGroup.children[0]);
    this.mobs = [];
  }

  regenAllChunks() {
    for (const ch of this.world.chunks.values()) {
      this._buildChunk(ch);
      ch.dirty = false;
    }
  }

  _buildChunk(chunk) {
    const key = `${chunk.cx},${chunk.cz}`;
    const existing = this.chunkMeshes.get(key);
    if (existing) {
      if (existing.opaque) {
        this.scene.remove(existing.opaque);
        existing.opaque.geometry.dispose();
      }
      if (existing.transparent) {
        this.scene.remove(existing.transparent);
        existing.transparent.geometry.dispose();
      }
    }
    const built = buildChunkMesh(this.world, chunk);
    let opaqueMesh = null;
    let transparentMesh = null;
    if (built.opaque) {
      opaqueMesh = new THREE.Mesh(built.opaque, this.opaqueMaterial);
      opaqueMesh.frustumCulled = true;
      this.scene.add(opaqueMesh);
    }
    if (built.transparent) {
      transparentMesh = new THREE.Mesh(built.transparent, this.transparentMaterial);
      transparentMesh.renderOrder = 1;
      transparentMesh.frustumCulled = true;
      this.scene.add(transparentMesh);
    }
    this.chunkMeshes.set(key, { opaque: opaqueMesh, transparent: transparentMesh });
  }

  _rebuildDirtyChunks() {
    for (const ch of this.world.chunks.values()) {
      if (ch.dirty) {
        this._buildChunk(ch);
        ch.dirty = false;
      }
    }
  }

  // ---------- input ----------
  _bindInput() {
    addEventListener('keydown', (e) => {
      if (this.hud.isInventoryOpen() && e.code === 'KeyE') {
        this.hud.toggleInventory(false);
        return;
      }
      this.keys.add(e.code);
      if (e.code === 'Escape') this.requestPause();
      if (e.code === 'KeyE' && !this.paused) this.hud.toggleInventory();
      if (e.code === 'KeyF' && !this.paused) this.player.toggleFly();
      if (e.code === 'KeyR' && !this.paused && this.pointerLocked) this.interact();
      const num = e.code.match(/^Digit([1-9])$/);
      if (num) this.inventory.pick(parseInt(num[1], 10) - 1);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('wheel', (e) => {
      if (this.paused) return;
      const dir = Math.sign(e.deltaY);
      this.inventory.cycle(dir);
    }, { passive: true });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.paused) return;
      if (!this.pointerLocked) {
        this.canvas.requestPointerLock?.();
        return;
      }
      if (e.button === 0) this.mouseButtons.left = true;
      if (e.button === 2) this.mouseButtons.right = true;
      if (e.button === 2) this.tryPlace();
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseButtons.left = false;
      if (e.button === 2) this.mouseButtons.right = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.pointerLocked || this.paused) return;
      this.player.applyMouseLook(e.movementX, e.movementY);
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = (document.pointerLockElement === this.canvas);
    });
    document.getElementById('inventory-grid').addEventListener('click', (ev) => {
      const cell = ev.target.closest('.inv-cell');
      if (!cell) return;
      const blockId = parseInt(cell.dataset.blockId, 10);
      this.inventory.setHotbar(this.inventory.selected, blockId);
    });
    document.getElementById('btn-respawn').addEventListener('click', () => {
      this.player.respawn(this.world);
      this.hud.showDeath(false);
    });
  }

  requestPause() {
    this.paused = true;
    this.hud.hide();
    document.exitPointerLock?.();
    document.getElementById('menu').classList.remove('hidden');
    document.getElementById('btn-resume').classList.remove('hidden');
    if (this.world) this.maybeAutosave();
  }

  resume() {
    this.paused = false;
    this.hud.show();
    document.getElementById('menu').classList.add('hidden');
    this.canvas.requestPointerLock?.();
  }

  // ---------- gameplay ----------

  // Determine the targeted block and place candidate; returns a hit object or null.
  raycast() {
    return raycastVoxel(this.world, this.player.eyePosition(), this.player.lookDir(), 7);
  }

  tryPlace() {
    if (this.paused || !this.world) return;
    const now = performance.now();
    if (now - this._lastPlace < PLACE_DELAY) return;
    const hit = this.raycast();
    if (!hit) return;

    // If the targeted block is a lever or button, interact instead of placing.
    if (hit.block.id === BLOCK.LEVER) {
      this.redstone.toggleLever(hit.block.x, hit.block.y, hit.block.z);
      this._lastPlace = now;
      return;
    }
    if (hit.block.id === BLOCK.BUTTON) {
      this.redstone.pressButton(hit.block.x, hit.block.y, hit.block.z);
      this._lastPlace = now;
      return;
    }

    const blockId = this.inventory.selectedBlock();
    if (!this.inventory.has(blockId)) return;
    if (!this.world.inBounds(hit.place.x, hit.place.y, hit.place.z)) return;
    if (this.world.getBlock(hit.place.x, hit.place.y, hit.place.z) !== BLOCK.AIR) return;
    // Don't place inside the player.
    const px = Math.floor(this.player.position.x);
    const py = Math.floor(this.player.position.y);
    const pz = Math.floor(this.player.position.z);
    if (BLOCKS[blockId]?.solid && hit.place.x === px && hit.place.z === pz &&
        (hit.place.y === py || hit.place.y === py + 1)) {
      return;
    }
    this.world.setBlock(hit.place.x, hit.place.y, hit.place.z, blockId);
    if (isRedstone(blockId)) {
      this.world.setMeta(hit.place.x, hit.place.y, hit.place.z, 0);
      this.redstone.markDirty(hit.place.x, hit.place.z);
    }
    this.inventory.consume(blockId);
    this._lastPlace = now;
    this.education?.notePlace();
  }

  interact() {
    const hit = this.raycast();
    if (!hit) return;
    if (hit.block.id === BLOCK.LEVER) {
      this.redstone.toggleLever(hit.block.x, hit.block.y, hit.block.z);
    } else if (hit.block.id === BLOCK.BUTTON) {
      this.redstone.pressButton(hit.block.x, hit.block.y, hit.block.z);
    }
  }

  tryBreak(dt) {
    const hit = this.raycast();
    if (!hit) {
      this._breakingTarget = null;
      this._breakHoldTime = 0;
      this.selectionMesh.visible = false;
      return;
    }
    this.selectionMesh.visible = true;
    this.selectionMesh.position.set(hit.block.x + 0.5, hit.block.y + 0.5, hit.block.z + 0.5);

    if (!this.mouseButtons.left) {
      this._breakingTarget = null;
      this._breakHoldTime = 0;
      return;
    }
    const k = `${hit.block.x},${hit.block.y},${hit.block.z}`;
    if (this._breakingTarget !== k) {
      this._breakingTarget = k;
      this._breakHoldTime = 0;
    }
    const def = BLOCKS[hit.block.id];
    if (!def || hit.block.id === BLOCK.AIR || hit.block.id === BLOCK.BEDROCK) return;
    const required = blockHardness(hit.block.id);
    // Creative breaks instantly. Survival/Education uses hardness * 0.3s.
    const needTime = (this.player.mode === MODE.CREATIVE) ? 0 : required * 0.3;
    this._breakHoldTime += dt;
    if (this._breakHoldTime >= needTime) {
      const drop = def.drops ?? hit.block.id;
      this.world.setBlock(hit.block.x, hit.block.y, hit.block.z, BLOCK.AIR);
      this.world.setMeta(hit.block.x, hit.block.y, hit.block.z, null);
      this._breakingTarget = null;
      this._breakHoldTime = 0;
      // Add to inventory in survival/education.
      if (drop !== BLOCK.AIR && drop != null) this.inventory.add(drop, 1);
      this.education?.noteBreak();
      // Mark redstone-affected chunk if appropriate.
      if (isRedstone(hit.block.id)) {
        this.redstone.markDirty(hit.block.x, hit.block.z);
      }
    }
  }

  // ---------- mobs (survival only) ----------
  spawnNightMobs(dt) {
    if (this.player.mode !== MODE.SURVIVAL) return;
    const isNight = this.timeOfDay < 0.22 || this.timeOfDay > 0.78;
    if (!isNight) return;
    this._mobSpawnAccumulator += dt;
    if (this._mobSpawnAccumulator < 8) return;
    this._mobSpawnAccumulator = 0;
    if (this.mobs.filter((m) => m.alive).length >= 6) return;
    // Spawn 12-20 blocks away.
    const angle = Math.random() * Math.PI * 2;
    const dist = 14 + Math.random() * 6;
    const sx = this.player.position.x + Math.cos(angle) * dist;
    const sz = this.player.position.z + Math.sin(angle) * dist;
    if (!this.world.inBounds(Math.floor(sx), 1, Math.floor(sz))) return;
    let sy = 0;
    for (let y = 60; y >= 1; y--) {
      const id = this.world.getBlock(Math.floor(sx), y, Math.floor(sz));
      if (id !== BLOCK.AIR && id !== BLOCK.WATER) { sy = y + 1; break; }
    }
    if (sy === 0) return;
    const z = new Zombie(this.world, sx, sy, sz);
    this.mobs.push(z);
    this.mobGroup.add(z.group);
  }

  updateMobs(dt) {
    for (const mob of this.mobs) {
      if (!mob.alive) continue;
      mob.update(dt, this.player.position);
      if (mob.didAttack) this.player.takeDamage(2);
    }
    // Cull dead mobs.
    if (this.mobs.length > 0) {
      this.mobs = this.mobs.filter((m) => {
        if (!m.alive) {
          this.mobGroup.remove(m.group);
          return false;
        }
        return true;
      });
    }
  }

  // ---------- day / night ----------
  updateSky(dt) {
    this.timeOfDay = (this.timeOfDay + dt * this.daySpeed) % 1;
    // Sun arcs across the sky.
    const t = this.timeOfDay;
    const angle = t * Math.PI * 2 - Math.PI / 2;
    const sx = Math.cos(angle) * 200;
    const sy = Math.sin(angle) * 200;
    this.sunLight.position.set(sx, Math.abs(sy) + 30, 100);
    // Brightness falls off at night.
    const dayFactor = Math.max(0, Math.sin(t * Math.PI * 2));
    this.sunLight.intensity = 0.4 + dayFactor * 0.7;
    this.ambient.intensity = 0.25 + dayFactor * 0.4;
    this.hemi.intensity = 0.2 + dayFactor * 0.4;
    // Sky color: morning -> blue, noon -> bright blue, evening -> orange, night -> dark blue.
    const skyColor = new THREE.Color();
    if (dayFactor > 0.05) {
      const horizon = new THREE.Color(0x88bbee);
      const mid = new THREE.Color(0xa9d2f5);
      skyColor.copy(horizon).lerp(mid, dayFactor);
    } else {
      const dusk = new THREE.Color(0xff9550);
      const night = new THREE.Color(0x0a1530);
      const k = Math.min(1, Math.max(0, (Math.abs(dayFactor) + 0.2) * 2));
      skyColor.copy(night).lerp(dusk, k * 0.3);
    }
    this.scene.background.copy(skyColor);
    this.scene.fog.color.copy(skyColor);
  }

  // ---------- main loop ----------
  start() {
    if (this.running) return;
    this.running = true;
    this._lastT = performance.now();
    const tick = () => {
      this._frameRaf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - this._lastT) / 1000);
      this._lastT = now;
      if (this.paused) {
        this.renderer.render(this.scene, this.camera);
        return;
      }
      const input = {
        forward: this.keys.has('KeyW'),
        back: this.keys.has('KeyS'),
        left: this.keys.has('KeyA'),
        right: this.keys.has('KeyD'),
        jump: this.keys.has('Space'),
        crouch: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
        sprint: this.keys.has('ControlLeft') || this.keys.has('ControlRight'),
      };
      this.player.update(this.world, dt, input);
      if (this.player.isDead()) {
        this.hud.showDeath(true);
      }
      this.tryBreak(dt);
      if (this.mouseButtons.right && performance.now() - this._lastPlace > PLACE_DELAY) {
        this.tryPlace();
      }
      this.spawnNightMobs(dt);
      this.updateMobs(dt);
      this.updateSky(dt);
      const redstoneChanged = this.redstone?.step(dt);
      if (redstoneChanged) {
        this._rebuildDirtyChunks();
      }
      // Education tracking.
      this.education?.update(this.player, this.world);
      const hint = this.education?.current()?.text ?? null;
      this.hud.setHint(hint);
      this.hud.refresh(this.player, this.timeOfDay);
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  maybeAutosave() {
    if (!this.world) return;
    saveGame({
      world: this.world,
      player: this.player,
      timeOfDay: this.timeOfDay,
      inventory: this.inventory,
    });
  }
}
