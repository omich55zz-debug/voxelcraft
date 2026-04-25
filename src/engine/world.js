// Voxel world: a fixed-size grid of chunks.
// Coordinates: x (east), y (up), z (south). Origin at world (0, 0, 0).

import { createNoise2D, createNoise3D } from 'simplex-noise';
import { BLOCK, isOpaque, isRedstone } from './blocks.js';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
export const WORLD_CHUNKS_X = 8;
export const WORLD_CHUNKS_Z = 8;
export const WORLD_SIZE_X = CHUNK_SIZE * WORLD_CHUNKS_X;
export const WORLD_SIZE_Z = CHUNK_SIZE * WORLD_CHUNKS_Z;
export const SEA_LEVEL = 22;

// Mulberry32 deterministic PRNG.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    // Per-block extra data (used by redstone). Keyed by local index.
    this.meta = new Map();
    this.dirty = true;
    this.mesh = null;          // opaque mesh
    this.transparentMesh = null; // transparent (water/glass/leaves) mesh
  }

  static idx(x, y, z) {
    return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
  }

  get(x, y, z) {
    return this.blocks[Chunk.idx(x, y, z)];
  }

  set(x, y, z, id) {
    this.blocks[Chunk.idx(x, y, z)] = id;
    this.dirty = true;
  }

  getMeta(x, y, z) {
    return this.meta.get(Chunk.idx(x, y, z));
  }

  setMeta(x, y, z, value) {
    const i = Chunk.idx(x, y, z);
    if (value == null) this.meta.delete(i);
    else this.meta.set(i, value);
  }
}

export class World {
  constructor(seed, flavor = 'normal') {
    this.seed = seed | 0;
    this.flavor = flavor; // 'normal' | 'magic'
    const rand = mulberry32(this.seed);
    this.heightNoise = createNoise2D(rand);
    this.detailNoise = createNoise2D(rand);
    this.biomeNoise = createNoise2D(rand);
    this.caveNoise = createNoise3D(rand);
    this.oreNoise = createNoise3D(rand);
    this.treeNoise = createNoise2D(rand);
    this.chunks = new Map();
    this.changes = new Map(); // worldKey -> blockId, for save/load deltas
    this.redstoneBlocks = new Set(); // 'x,y,z' strings — wires, lamps, levers, buttons
    this.chestStores = new Map(); // 'x,y,z' -> [blockId, count][]
    this.villagerSpots = []; // {x, y, z, name}
    for (let cx = 0; cx < WORLD_CHUNKS_X; cx++) {
      for (let cz = 0; cz < WORLD_CHUNKS_Z; cz++) {
        const ch = new Chunk(cx, cz);
        if (flavor === 'magic') this.generateMagicChunk(ch);
        else this.generateChunk(ch);
        this.chunks.set(this.chunkKey(cx, cz), ch);
      }
    }
    if (flavor === 'magic') this.placeCrystalTowers();
    else this.placeTrees();
  }

  // Find the topmost non-air, non-water block at (x,z). Returns y of that block.
  findGroundY(x, z) {
    for (let y = WORLD_HEIGHT - 1; y >= 1; y--) {
      const id = this.getBlock(x, y, z);
      if (id !== BLOCK.AIR && id !== BLOCK.WATER && id !== BLOCK.LEAVES) return y;
    }
    return 1;
  }

  chunkKey(cx, cz) { return `${cx},${cz}`; }

  inBounds(x, y, z) {
    return x >= 0 && x < WORLD_SIZE_X &&
      y >= 0 && y < WORLD_HEIGHT &&
      z >= 0 && z < WORLD_SIZE_Z;
  }

  chunkAt(x, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    return this.chunks.get(this.chunkKey(cx, cz));
  }

  getBlock(x, y, z) {
    if (!this.inBounds(x, y, z)) return BLOCK.AIR;
    const ch = this.chunkAt(x, z);
    if (!ch) return BLOCK.AIR;
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return ch.get(lx, y, lz);
  }

  setBlock(x, y, z, id, recordChange = true) {
    if (!this.inBounds(x, y, z)) return;
    const ch = this.chunkAt(x, z);
    if (!ch) return;
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const prev = ch.get(lx, y, lz);
    ch.set(lx, y, lz, id);
    const key = `${x},${y},${z}`;
    if (isRedstone(prev) && !isRedstone(id)) this.redstoneBlocks.delete(key);
    if (isRedstone(id)) this.redstoneBlocks.add(key);
    if (recordChange) this.changes.set(key, id);
    // Mark neighbor chunks dirty if change was on a chunk border (so meshing
    // re-evaluates faces against this chunk).
    if (lx === 0) {
      const n = this.chunks.get(this.chunkKey(ch.cx - 1, ch.cz));
      if (n) n.dirty = true;
    }
    if (lx === CHUNK_SIZE - 1) {
      const n = this.chunks.get(this.chunkKey(ch.cx + 1, ch.cz));
      if (n) n.dirty = true;
    }
    if (lz === 0) {
      const n = this.chunks.get(this.chunkKey(ch.cx, ch.cz - 1));
      if (n) n.dirty = true;
    }
    if (lz === CHUNK_SIZE - 1) {
      const n = this.chunks.get(this.chunkKey(ch.cx, ch.cz + 1));
      if (n) n.dirty = true;
    }
  }

  getMeta(x, y, z) {
    const ch = this.chunkAt(x, z);
    if (!ch) return undefined;
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return ch.getMeta(lx, y, lz);
  }

  setMeta(x, y, z, value) {
    const ch = this.chunkAt(x, z);
    if (!ch) return;
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    ch.setMeta(lx, y, lz, value);
    ch.dirty = true;
  }

  // 2D height map sample.
  sampleHeight(wx, wz) {
    const continent = (this.heightNoise(wx * 0.006, wz * 0.006) + 1) * 0.5;
    const hills = (this.heightNoise(wx * 0.03, wz * 0.03) + 1) * 0.5;
    const detail = (this.detailNoise(wx * 0.12, wz * 0.12) + 1) * 0.5;
    const h = SEA_LEVEL - 4
      + continent * 16
      + hills * 8
      + detail * 3;
    return Math.floor(h);
  }

  // Returns 0=ocean, 1=plains, 2=desert, 3=mountain, 4=snow.
  sampleBiome(wx, wz, height) {
    if (height < SEA_LEVEL - 1) return 0;
    if (height > SEA_LEVEL + 18) return 4; // snow peaks
    if (height > SEA_LEVEL + 12) return 3; // mountains
    const b = this.biomeNoise(wx * 0.004, wz * 0.004);
    if (b > 0.45 && height < SEA_LEVEL + 6) return 2; // desert
    return 1; // plains
  }

  generateChunk(chunk) {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const height = Math.max(2, Math.min(WORLD_HEIGHT - 6, this.sampleHeight(wx, wz)));
        const biome = this.sampleBiome(wx, wz, height);
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          let id = BLOCK.AIR;
          if (y === 0) {
            id = BLOCK.BEDROCK;
          } else if (y < height - 4) {
            // Caves carved by 3D noise.
            const cv = this.caveNoise(wx * 0.07, y * 0.07, wz * 0.07);
            if (cv > 0.55) {
              id = BLOCK.AIR;
            } else {
              id = BLOCK.STONE;
              // Ores.
              const ore = this.oreNoise(wx * 0.25, y * 0.25, wz * 0.25);
              if (y < 12 && ore > 0.7) id = BLOCK.GOLD;
              else if (y < 30 && ore > 0.65) id = BLOCK.IRON;
              else if (y < 48 && ore > 0.6 && ore < 0.62) id = BLOCK.COAL;
            }
          } else if (y < height) {
            id = (biome === 2) ? BLOCK.SAND : BLOCK.DIRT;
          } else if (y === height) {
            if (biome === 0) id = BLOCK.SAND;
            else if (biome === 2) id = BLOCK.SAND;
            else if (biome === 4) id = BLOCK.SNOW;
            else if (biome === 3) id = BLOCK.STONE;
            else id = BLOCK.GRASS;
          } else if (y <= SEA_LEVEL) {
            id = BLOCK.WATER;
          }
          chunk.set(lx, y, lz, id);
        }
      }
    }
  }

  placeTrees() {
    for (let cx = 0; cx < WORLD_CHUNKS_X; cx++) {
      for (let cz = 0; cz < WORLD_CHUNKS_Z; cz++) {
        const ch = this.chunks.get(this.chunkKey(cx, cz));
        if (!ch) continue;
        for (let lx = 1; lx < CHUNK_SIZE - 1; lx++) {
          for (let lz = 1; lz < CHUNK_SIZE - 1; lz++) {
            const wx = ch.cx * CHUNK_SIZE + lx;
            const wz = ch.cz * CHUNK_SIZE + lz;
            const v = this.treeNoise(wx * 0.4, wz * 0.4);
            // Find surface y.
            let surfY = -1;
            for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
              const id = ch.get(lx, y, lz);
              if (id === BLOCK.GRASS) { surfY = y; break; }
              if (id !== BLOCK.AIR && id !== BLOCK.LEAVES && id !== BLOCK.WATER) break;
            }
            if (surfY < 0) continue;
            if (v > 0.78 && surfY + 6 < WORLD_HEIGHT) {
              this.placeTree(wx, surfY + 1, wz);
            }
          }
        }
      }
    }
  }

  placeTree(wx, wy, wz) {
    const trunkH = 4 + (Math.abs(wx * 31 + wz * 17) % 3);
    for (let i = 0; i < trunkH; i++) {
      this.setBlock(wx, wy + i, wz, BLOCK.WOOD, false);
    }
    const top = wy + trunkH;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (dx * dx + dz * dz + dy * dy > 5) continue;
          const x = wx + dx, y = top + dy, z = wz + dz;
          if (this.getBlock(x, y, z) === BLOCK.AIR) {
            this.setBlock(x, y, z, BLOCK.LEAVES, false);
          }
        }
      }
    }
    this.setBlock(wx, top + 1, wz, BLOCK.LEAVES, false);
  }

  // Apply a delta map of saved changes back onto a freshly generated world.
  applyChanges(changes) {
    for (const [key, id] of Object.entries(changes)) {
      const [x, y, z] = key.split(',').map(Number);
      this.setBlock(x, y, z, id, true);
    }
  }

  // Magic-dimension world generation: lower terrain, glowstone caves,
  // ender stone surface, sparse trees replaced by crystal towers.
  generateMagicChunk(chunk) {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const continent = (this.heightNoise(wx * 0.008, wz * 0.008) + 1) * 0.5;
        const detail = (this.detailNoise(wx * 0.05, wz * 0.05) + 1) * 0.5;
        const height = Math.max(4, Math.min(WORLD_HEIGHT - 8,
          Math.floor(SEA_LEVEL - 6 + continent * 18 + detail * 4)));
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          let id = BLOCK.AIR;
          if (y === 0) id = BLOCK.BEDROCK;
          else if (y < height - 3) {
            const cv = this.caveNoise(wx * 0.06, y * 0.06, wz * 0.06);
            if (cv > 0.6) id = BLOCK.AIR;
            else id = BLOCK.OBSIDIAN;
            const ore = this.oreNoise(wx * 0.25, y * 0.25, wz * 0.25);
            if (id === BLOCK.OBSIDIAN && ore > 0.7) id = BLOCK.GLOWSTONE;
          } else if (y < height) id = BLOCK.ENDER_STONE;
          else if (y === height) id = BLOCK.ENDER_STONE;
          chunk.set(lx, y, lz, id);
        }
      }
    }
  }

  placeCrystalTowers() {
    for (let cx = 0; cx < WORLD_CHUNKS_X; cx++) {
      for (let cz = 0; cz < WORLD_CHUNKS_Z; cz++) {
        const ch = this.chunks.get(this.chunkKey(cx, cz));
        if (!ch) continue;
        for (let lx = 2; lx < CHUNK_SIZE - 2; lx += 2) {
          for (let lz = 2; lz < CHUNK_SIZE - 2; lz += 2) {
            const wx = cx * CHUNK_SIZE + lx;
            const wz = cz * CHUNK_SIZE + lz;
            const v = this.treeNoise(wx * 0.3, wz * 0.3);
            if (v > 0.7) {
              const surfY = this.findGroundY(wx, wz);
              if (surfY < 1 || surfY > WORLD_HEIGHT - 6) continue;
              const h = 3 + Math.floor((Math.abs(wx * 13 + wz * 7) % 4));
              for (let i = 0; i < h; i++) {
                this.setBlock(wx, surfY + 1 + i, wz, BLOCK.MAGIC_CRYSTAL, false);
              }
              if (Math.abs(wx + wz) % 5 === 0) {
                this.setBlock(wx, surfY + 1 + h, wz, BLOCK.GLOWSTONE, false);
              }
            }
          }
        }
      }
    }
  }

  // Generate a small village near (cx, cz) center: 4 wooden houses + paths.
  // Returns an array of villager spawn points {x, y, z, name}.
  generateVillage(cx, cz) {
    const spawns = [];
    const houses = [
      { dx: -8, dz: -8 }, { dx: 8, dz: -8 },
      { dx: -8, dz: 8 }, { dx: 8, dz: 8 },
    ];
    for (let i = 0; i < houses.length; i++) {
      const hx = cx + houses[i].dx;
      const hz = cz + houses[i].dz;
      this.buildHouse(hx, hz);
      const sy = this.findGroundY(hx, hz) + 1;
      spawns.push({
        x: hx + 0.5, y: sy, z: hz + 0.5,
        name: `\u0416\u0438\u0442\u0435\u043b\u044c-${i + 1}`,
      });
    }
    // Stone path between houses (cross shape).
    for (let d = -8; d <= 8; d++) {
      const px = cx + d, pz = cz;
      const py = this.findGroundY(px, pz);
      if (this.getBlock(px, py, pz) === BLOCK.GRASS || this.getBlock(px, py, pz) === BLOCK.DIRT) {
        this.setBlock(px, py, pz, BLOCK.COBBLESTONE, false);
      }
      const px2 = cx, pz2 = cz + d;
      const py2 = this.findGroundY(px2, pz2);
      if (this.getBlock(px2, py2, pz2) === BLOCK.GRASS || this.getBlock(px2, py2, pz2) === BLOCK.DIRT) {
        this.setBlock(px2, py2, pz2, BLOCK.COBBLESTONE, false);
      }
    }
    // Central well (glass + water).
    const wy = this.findGroundY(cx, cz);
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      this.setBlock(cx + dx, wy + 1, cz + dz, BLOCK.COBBLESTONE, false);
    }
    this.setBlock(cx, wy, cz, BLOCK.WATER, false);
    this.setBlock(cx, wy + 1, cz, BLOCK.GLASS, false);
    return spawns;
  }

  buildHouse(hx, hz) {
    const groundY = this.findGroundY(hx, hz);
    const baseY = groundY + 1;
    const r = 3;
    // Floor (planks).
    for (let x = -r; x <= r; x++) {
      for (let z = -r; z <= r; z++) {
        this.setBlock(hx + x, baseY, hz + z, BLOCK.PLANKS, false);
      }
    }
    // Walls (planks). Height 3.
    for (let h = 1; h <= 3; h++) {
      for (let x = -r; x <= r; x++) {
        this.setBlock(hx + x, baseY + h, hz - r, BLOCK.PLANKS, false);
        this.setBlock(hx + x, baseY + h, hz + r, BLOCK.PLANKS, false);
      }
      for (let z = -r; z <= r; z++) {
        this.setBlock(hx - r, baseY + h, hz + z, BLOCK.PLANKS, false);
        this.setBlock(hx + r, baseY + h, hz + z, BLOCK.PLANKS, false);
      }
    }
    // Door (air opening on +Z side).
    this.setBlock(hx, baseY + 1, hz + r, BLOCK.AIR, false);
    this.setBlock(hx, baseY + 2, hz + r, BLOCK.AIR, false);
    // Windows (glass).
    this.setBlock(hx - r, baseY + 2, hz, BLOCK.GLASS, false);
    this.setBlock(hx + r, baseY + 2, hz, BLOCK.GLASS, false);
    this.setBlock(hx, baseY + 2, hz - r, BLOCK.GLASS, false);
    // Roof (cobblestone).
    for (let x = -r; x <= r; x++) {
      for (let z = -r; z <= r; z++) {
        this.setBlock(hx + x, baseY + 4, hz + z, BLOCK.COBBLESTONE, false);
      }
    }
    // Chimney.
    this.setBlock(hx + r - 1, baseY + 5, hz - r + 1, BLOCK.BRICK, false);
    this.setBlock(hx + r - 1, baseY + 6, hz - r + 1, BLOCK.BRICK, false);
    // Lamp inside.
    this.setBlock(hx, baseY + 3, hz, BLOCK.LAMP, false);
    // Chest inside (corner) — populated by game later.
    this.setBlock(hx - r + 1, baseY + 1, hz - r + 1, BLOCK.CHEST, false);
  }

  // Persistent chest contents.
  getChest(x, y, z) {
    const k = `${x},${y},${z}`;
    return this.chestStores.get(k) ?? null;
  }

  setChest(x, y, z, items) {
    const k = `${x},${y},${z}`;
    if (!items || items.length === 0) this.chestStores.delete(k);
    else this.chestStores.set(k, items);
  }

  // Helper: is the block at (x,y,z) opaque?
  isOpaqueAt(x, y, z) {
    const id = this.getBlock(x, y, z);
    return isOpaque(id);
  }
}
