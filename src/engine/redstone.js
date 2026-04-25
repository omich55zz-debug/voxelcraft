// Simple redstone-like logic simulation.
//
// Components:
// - LEVER: toggleable power source (meta: 0/1).
// - BUTTON: timed pulsed power source (meta: ticks remaining).
// - WIRE: propagates power 0..15 from neighboring sources/wires (meta: power).
// - LAMP: lights up when an adjacent wire/lever/button is powered (meta: 0/1).
//
// We rely on `world.redstoneBlocks` (Set of 'x,y,z' strings) for fast iteration.

import { BLOCK } from './blocks.js';

const NEIGHBORS_6 = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

export class RedstoneSim {
  constructor(world) {
    this.world = world;
    this.tickAccumulator = 0;
    this.tickInterval = 0.1; // 10 simulation ticks per second
    this.dirtyChunks = new Set();
  }

  toggleLever(x, y, z) {
    const cur = this.world.getMeta(x, y, z) ?? 0;
    this.world.setMeta(x, y, z, cur ? 0 : 1);
    this.markDirty(x, z);
  }

  pressButton(x, y, z) {
    this.world.setMeta(x, y, z, 12);
    this.markDirty(x, z);
  }

  markDirty(x, z) {
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    this.dirtyChunks.add(`${cx},${cz}`);
  }

  step(dt) {
    this.tickAccumulator += dt;
    if (this.tickAccumulator < this.tickInterval) return false;
    this.tickAccumulator = 0;

    if (this.world.redstoneBlocks.size === 0) {
      const changed = this.dirtyChunks.size > 0;
      return changed;
    }

    // Categorize redstone blocks; clean up stale entries.
    const wires = [];
    const lamps = [];
    const sources = []; // {x,y,z,power}
    const stale = [];
    for (const key of this.world.redstoneBlocks) {
      const [x, y, z] = key.split(',').map(Number);
      const id = this.world.getBlock(x, y, z);
      if (id === BLOCK.WIRE) {
        wires.push([x, y, z]);
      } else if (id === BLOCK.LAMP) {
        lamps.push([x, y, z]);
      } else if (id === BLOCK.LEVER) {
        if ((this.world.getMeta(x, y, z) ?? 0) > 0) sources.push({ x, y, z, power: 15 });
      } else if (id === BLOCK.BUTTON) {
        const m = this.world.getMeta(x, y, z) ?? 0;
        if (m > 0) {
          this.world.setMeta(x, y, z, m - 1);
          this.markDirty(x, z);
          sources.push({ x, y, z, power: 15 });
        }
      } else {
        stale.push(key);
      }
    }
    for (const k of stale) this.world.redstoneBlocks.delete(k);

    // Reset wire power to 0.
    for (const [x, y, z] of wires) {
      const m = this.world.getMeta(x, y, z) ?? 0;
      if (m !== 0) {
        this.world.setMeta(x, y, z, 0);
        this.markDirty(x, z);
      }
    }

    // BFS from sources through wires.
    const wireSet = new Set(wires.map(([x, y, z]) => `${x},${y},${z}`));
    const wirePower = new Map();
    const queue = [];
    for (const s of sources) {
      for (const [dx, dy, dz] of NEIGHBORS_6) {
        const nx = s.x + dx, ny = s.y + dy, nz = s.z + dz;
        const k = `${nx},${ny},${nz}`;
        if (!wireSet.has(k)) continue;
        if ((wirePower.get(k) ?? 0) < s.power) {
          wirePower.set(k, s.power);
          queue.push({ x: nx, y: ny, z: nz, power: s.power });
        }
      }
    }
    while (queue.length) {
      const { x, y, z, power } = queue.shift();
      if (power <= 1) continue;
      for (const [dx, dy, dz] of NEIGHBORS_6) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        const k = `${nx},${ny},${nz}`;
        if (!wireSet.has(k)) continue;
        const newP = power - 1;
        if ((wirePower.get(k) ?? 0) < newP) {
          wirePower.set(k, newP);
          queue.push({ x: nx, y: ny, z: nz, power: newP });
        }
      }
    }
    for (const [k, p] of wirePower) {
      const [x, y, z] = k.split(',').map(Number);
      this.world.setMeta(x, y, z, p);
      this.markDirty(x, z);
    }

    // Lamps: on if any neighbor is a powered source/wire.
    for (const [x, y, z] of lamps) {
      let on = false;
      for (const [dx, dy, dz] of NEIGHBORS_6) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        const nid = this.world.getBlock(nx, ny, nz);
        const nm = this.world.getMeta(nx, ny, nz) ?? 0;
        if ((nid === BLOCK.WIRE || nid === BLOCK.LEVER || nid === BLOCK.BUTTON) && nm > 0) {
          on = true;
          break;
        }
      }
      const before = this.world.getMeta(x, y, z) ?? 0;
      const target = on ? 1 : 0;
      if (before !== target) {
        this.world.setMeta(x, y, z, target);
        this.markDirty(x, z);
      }
    }

    return this.dirtyChunks.size > 0;
  }

  takeDirty() {
    const out = Array.from(this.dirtyChunks);
    this.dirtyChunks.clear();
    return out;
  }
}
