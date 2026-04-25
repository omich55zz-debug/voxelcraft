// Core game loop: scene/renderer setup, chunk meshing, input, AI, day/night.

import * as THREE from 'three';

import { World, CHUNK_SIZE, WORLD_CHUNKS_X, WORLD_CHUNKS_Z } from '../engine/world.js';
import { buildChunkMesh } from '../engine/mesher.js';
import { buildAtlasTexture } from '../engine/textures.js';
import { Player, MODE } from '../engine/player.js';
import { raycastVoxel } from '../engine/raycast.js';
import {
  BLOCK, BLOCKS, blockHardness, isRedstone,
  isTool, toolSpeed, isChest, isPortal,
} from '../engine/blocks.js';
import { RedstoneSim } from '../engine/redstone.js';
import { Inventory } from './inventory.js';
import { Zombie, Villager } from './mobs.js';
import { saveGame } from './save.js';
import { EducationState } from './education.js';
import { QuestTracker } from './quests.js';
import { ViewModel } from './viewmodel.js';
import { settings } from './settings.js';

const PLACE_DELAY = 180; // ms between placements when holding RMB

export class Game {
  constructor(canvas, hud) {
    this.canvas = canvas;
    this.hud = hud;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x88bbee);
    this.scene.fog = new THREE.Fog(0x88bbee, 50, 140);

    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), 1, 0.1, 500);
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
    this.quests = null;
    this.villagers = [];
    this.openChestPos = null;
    // Add the camera to the scene so children (held-item viewmodel) render.
    this.scene.add(this.camera);
    this.viewModel = new ViewModel(this.camera, this.opaqueMaterial);

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
    this._applySettings();
    settings.onChange(() => this._applySettings());
    addEventListener('resize', () => this._resize());
  }

  _applySettings() {
    const fov = settings.get('fov');
    if (fov && this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const rd = settings.get('renderDistance');
    if (rd != null && this.scene.fog) {
      const blocks = Math.max(40, rd * 16);
      this.scene.fog.near = blocks * 0.5;
      this.scene.fog.far = blocks;
      this.camera.far = Math.max(200, blocks + 80);
      this.camera.updateProjectionMatrix();
    }
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
    const flavor = (mode === MODE.MAGIC) ? 'magic' : 'normal';
    this.world = new World(seed, flavor);
    this.redstone = new RedstoneSim(this.world);
    this.player = new Player(this.camera);
    this.player.setMode(mode);
    this.inventory = new Inventory(
      mode === MODE.CREATIVE || mode === MODE.EDUCATION || mode === MODE.MAGIC,
    );
    this.hud.inventory = this.inventory;
    this.hud.buildHotbar();
    if (mode === MODE.EDUCATION) {
      this.education = new EducationState(this.player);
    } else {
      this.education = null;
    }
    this.quests = new QuestTracker();
    this.timeOfDay = 0.35;
    // Generate a starting village in the normal overworld first, so we can
    // place the spawn just outside it on a clear patch.
    const cx = (CHUNK_SIZE * WORLD_CHUNKS_X) / 2;
    const cz = (CHUNK_SIZE * WORLD_CHUNKS_Z) / 2;
    if (flavor === 'normal') {
      const spots = this.world.generateVillage(cx, cz);
      this.world.villagerSpots = spots;
      for (const s of spots) {
        const v = new Villager(this.world, s.x, s.y, s.z, s.name);
        this.villagers.push(v);
        this.mobGroup.add(v.group);
      }
    }
    // Spawn ~16 blocks south of the village center, looking north toward it.
    const spawnOffset = (flavor === 'normal') ? 16 : 0;
    const sx = cx + 0.5;
    const sz = cz + spawnOffset + 0.5;
    let sy = 60;
    for (let y = 60; y >= 1; y--) {
      const id = this.world.getBlock(Math.floor(sx), y, Math.floor(sz));
      if (id !== BLOCK.AIR && id !== BLOCK.WATER) { sy = y + 1; break; }
    }
    this.player.position.set(sx, sy, sz);
    this.player.yaw = Math.PI; // face -z (north toward village)
    if (this.education) {
      this.education.startPos.copy(this.player.position);
      this.education.startYaw = this.player.yaw;
    }
    this.regenAllChunks();
    this.hud.setQuest(this.quests.active(), this.quests.completedCount(), this.quests.totalCount());
  }

  loadFromSave(save) {
    this.disposeWorld();
    const mode = save.player.mode || MODE.CREATIVE;
    this.world = new World(save.seed, save.flavor || 'normal');
    this.world.applyChanges(save.changes || {});
    if (save.chests) {
      for (const [k, items] of Object.entries(save.chests)) {
        this.world.chestStores.set(k, items);
      }
    }
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
    this.quests = new QuestTracker();
    this.regenAllChunks();
    this.hud.setQuest(this.quests.active(), this.quests.completedCount(), this.quests.totalCount());
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
    this.villagers = [];
    this.openChestPos = null;
    this.hud.hideChest();
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
      if (e.button === 0) {
        this.mouseButtons.left = true;
        this.viewModel?.triggerSwing();
      }
      if (e.button === 2) {
        this.mouseButtons.right = true;
        this.viewModel?.triggerSwing();
        this.tryPlace();
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseButtons.left = false;
      if (e.button === 2) this.mouseButtons.right = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.pointerLocked || this.paused) return;
      const sens = 0.0025 * (settings.get('mouseSensitivity') || 1.0);
      const dy = settings.get('invertY') ? -e.movementY : e.movementY;
      this.player.applyMouseLook(e.movementX, dy, sens);
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
    // Open chest UI when right-clicking a chest.
    if (isChest(hit.block.id)) {
      this.openChest(hit.block.x, hit.block.y, hit.block.z);
      this._lastPlace = now;
      return;
    }
    // Right-click portal -> swap to magic dimension.
    if (isPortal(hit.block.id)) {
      this.enterMagicDimension();
      this._lastPlace = now;
      return;
    }

    const blockId = this.inventory.selectedBlock();
    // Tools cannot be placed in the world.
    if (isTool(blockId)) return;
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
    this.quests?.state.notePlace(blockId);
    this.pollQuests();
  }

  interact() {
    // Talk to nearest villager within 3 blocks first.
    const v = this.nearestVillagerWithinSight(3.5);
    if (v) {
      this.hud.showDialog(v.greet());
      if (this.quests) this.quests.state.spokeToVillager = true;
      this.pollQuests();
      return;
    }
    const hit = this.raycast();
    if (!hit) return;
    if (hit.block.id === BLOCK.LEVER) {
      this.redstone.toggleLever(hit.block.x, hit.block.y, hit.block.z);
    } else if (hit.block.id === BLOCK.BUTTON) {
      this.redstone.pressButton(hit.block.x, hit.block.y, hit.block.z);
    } else if (isChest(hit.block.id)) {
      this.openChest(hit.block.x, hit.block.y, hit.block.z);
    } else if (isPortal(hit.block.id)) {
      this.enterMagicDimension();
    }
  }

  nearestVillagerWithinSight(maxDist) {
    if (!this.villagers || this.villagers.length === 0) return null;
    const eye = this.player.eyePosition();
    let best = null;
    let bestDist = maxDist;
    for (const v of this.villagers) {
      if (!v.alive) continue;
      const d = eye.distanceTo(v.position);
      if (d < bestDist) { best = v; bestDist = d; }
    }
    return best;
  }

  openChest(x, y, z) {
    let items = this.world.getChest(x, y, z);
    if (!items) {
      items = new Array(27).fill(null);
      this.world.setChest(x, y, z, items);
    }
    this.openChestPos = { x, y, z };
    this.hud.showChest(items, (slot, action) => this.onChestSlot(slot, action));
    if (this.quests) this.quests.state.openedChest = true;
  }

  onChestSlot(slot, action) {
    if (!this.openChestPos) return;
    const items = this.world.getChest(
      this.openChestPos.x, this.openChestPos.y, this.openChestPos.z,
    );
    if (!items) return;
    if (action === 'take' && items[slot]) {
      const it = items[slot];
      this.inventory.add(it.id, it.count);
      items[slot] = null;
    } else if (action === 'put') {
      const heldId = this.inventory.selectedBlock();
      if (heldId === BLOCK.AIR) return;
      if (isTool(heldId)) return; // don't deposit tools
      if (!this.inventory.has(heldId)) return;
      this.inventory.consume(heldId);
      if (items[slot] && items[slot].id === heldId) items[slot].count += 1;
      else items[slot] = { id: heldId, count: 1 };
    }
    this.world.setChest(
      this.openChestPos.x, this.openChestPos.y, this.openChestPos.z, items,
    );
    this.hud.showChest(items, (s, a) => this.onChestSlot(s, a));
  }

  enterMagicDimension() {
    if (this.quests) this.quests.state.enteredMagic = true;
    this.hud.showDialog('Портал активирован! Перенос в магическое измерение...');
    setTimeout(() => this.startNewWorld((Math.random() * 1e9) | 0, MODE.MAGIC), 800);
  }

  pollQuests() {
    if (!this.quests) return;
    const completed = this.quests.poll();
    if (completed) {
      this.hud.showDialog(`Квест выполнен: ${completed.title}!`);
    }
    this.hud.setQuest(
      this.quests.active(),
      this.quests.completedCount(),
      this.quests.totalCount(),
    );
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
    // Sword swing: try to hit a nearby zombie first.
    const heldId = this.inventory.selectedBlock();
    if (heldId === BLOCK.TOOL_SWORD) {
      this.trySwordHit();
    }
    const k = `${hit.block.x},${hit.block.y},${hit.block.z}`;
    if (this._breakingTarget !== k) {
      this._breakingTarget = k;
      this._breakHoldTime = 0;
    }
    const def = BLOCKS[hit.block.id];
    if (!def || hit.block.id === BLOCK.AIR || hit.block.id === BLOCK.BEDROCK) return;
    const required = blockHardness(hit.block.id);
    const speed = toolSpeed(heldId, hit.block.id);
    // Creative & magic break instantly. Otherwise hardness * 0.3s / speed.
    const fast = this.player.mode === MODE.CREATIVE || this.player.mode === MODE.MAGIC;
    const needTime = fast ? 0 : (required * 0.3) / speed;
    this._breakHoldTime += dt;
    if (this._breakHoldTime >= needTime) {
      const drop = def.drops ?? hit.block.id;
      const brokenId = hit.block.id;
      this.world.setBlock(hit.block.x, hit.block.y, hit.block.z, BLOCK.AIR);
      this.world.setMeta(hit.block.x, hit.block.y, hit.block.z, null);
      // If we broke a chest, drop its contents into the player inventory.
      if (brokenId === BLOCK.CHEST) {
        const items = this.world.getChest(hit.block.x, hit.block.y, hit.block.z);
        if (items) {
          for (const it of items) if (it) this.inventory.add(it.id, it.count);
          this.world.setChest(hit.block.x, hit.block.y, hit.block.z, null);
        }
      }
      this._breakingTarget = null;
      this._breakHoldTime = 0;
      // Add to inventory in survival/education.
      if (drop !== BLOCK.AIR && drop != null) this.inventory.add(drop, 1);
      this.education?.noteBreak();
      this.quests?.state.noteBreak(brokenId);
      if (brokenId === BLOCK.MAGIC_CRYSTAL) this.quests.state.foundCrystal = true;
      // Mark redstone-affected chunk if appropriate.
      if (isRedstone(brokenId)) {
        this.redstone.markDirty(hit.block.x, hit.block.z);
      }
      this.pollQuests();
    }
  }

  trySwordHit() {
    const now = performance.now();
    if (now - (this._lastSwordSwing ?? 0) < 400) return;
    const eye = this.player.eyePosition();
    const dir = this.player.lookDir();
    let bestMob = null;
    let bestT = 4; // 4-block reach
    for (const m of this.mobs) {
      if (!m.alive) continue;
      const toMob = m.position.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(eye);
      const t = toMob.dot(dir);
      if (t < 0 || t > bestT) continue;
      const perp = toMob.clone().sub(dir.clone().multiplyScalar(t)).length();
      if (perp < 0.7) { bestMob = m; bestT = t; }
    }
    if (bestMob) {
      this._lastSwordSwing = now;
      const wasAlive = bestMob.alive;
      bestMob.damage(6);
      if (wasAlive && !bestMob.alive) {
        this.quests?.state.noteKill(bestMob.kind);
        this.pollQuests();
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

  updateVillagers(dt) {
    for (const v of this.villagers) {
      if (!v.alive) continue;
      v.update(dt);
    }
  }

  checkLitLamps() {
    if (!this.world || !this.quests) return;
    let lit = 0;
    for (const key of this.world.redstoneBlocks) {
      const [x, y, z] = key.split(',').map(Number);
      if (this.world.getBlock(x, y, z) === BLOCK.LAMP) {
        const meta = this.world.getMeta(x, y, z);
        if (meta && meta > 0) lit++;
      }
    }
    if (lit > this.quests.state.litLamps) {
      this.quests.state.litLamps = lit;
      this.pollQuests();
    }
  }

  // ---------- day / night ----------
  updateSky(dt) {
    this.timeOfDay = (this.timeOfDay + dt * this.daySpeed) % 1;
    // t=0 midnight, t=0.5 noon. dayFactor: 0 at midnight, 1 at noon.
    const t = this.timeOfDay;
    const dayFactor = Math.max(0, -Math.cos(t * Math.PI * 2));
    // Sun arcs from east (sunrise t=0.25) to west (sunset t=0.75).
    const sunAngle = (t - 0.25) * Math.PI * 2;
    const sx = Math.sin(sunAngle) * 200;
    const sy = Math.max(0, Math.cos(sunAngle)) * 200 + 40;
    this.sunLight.position.set(sx, sy, 100);
    this.sunLight.intensity = 0.35 + dayFactor * 0.85;
    this.ambient.intensity = 0.3 + dayFactor * 0.45;
    this.hemi.intensity = 0.25 + dayFactor * 0.4;
    // Sky color: night -> dark blue, dawn/dusk -> orange, day -> bright blue.
    const skyColor = new THREE.Color();
    const day = new THREE.Color(0x88bbee);
    const noon = new THREE.Color(0xa9d2f5);
    const dusk = new THREE.Color(0xff9550);
    const night = new THREE.Color(0x0a1530);
    // Horizon glow when sun is near the horizon (t around 0.25 or 0.75).
    const horizonGlow = Math.max(0,
      1 - Math.min(Math.abs(t - 0.25), Math.abs(t - 0.75)) * 8);
    if (dayFactor > 0.02) {
      skyColor.copy(day).lerp(noon, dayFactor * 0.7);
      if (horizonGlow > 0) skyColor.lerp(dusk, horizonGlow * 0.6);
    } else {
      skyColor.copy(night);
      if (horizonGlow > 0) skyColor.lerp(dusk, horizonGlow * 0.5);
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
      this.updateVillagers(dt);
      this.updateSky(dt);
      const redstoneChanged = this.redstone?.step(dt);
      if (redstoneChanged) {
        this._rebuildDirtyChunks();
        this.checkLitLamps();
      }
      // Education tracking.
      this.education?.update(this.player, this.world);
      const hint = this.education?.current()?.text ?? null;
      this.hud.setHint(hint);
      // Held viewmodel.
      this.viewModel.setHeld(this.inventory.selectedBlock());
      const walkSpeed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
      this.viewModel.update(dt, walkSpeed);
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
