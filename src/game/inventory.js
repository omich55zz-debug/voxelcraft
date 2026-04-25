// Inventory + hotbar state. The hotbar has 9 slots; items beyond fit into the
// extended inventory page. In creative mode all blocks are infinite.

import { PALETTE, BLOCKS, blockName } from '../engine/blocks.js';

export class Inventory {
  constructor(creative = true) {
    this.creative = creative;
    this.hotbar = [
      PALETTE[0], PALETTE[1], PALETTE[2], PALETTE[4], PALETTE[5],
      PALETTE[6], PALETTE[8], PALETTE[14], PALETTE[16],
    ];
    this.selected = 0;
    this.counts = new Map(); // blockId -> count (used in survival)
    if (creative) {
      for (const id of Object.keys(BLOCKS)) this.counts.set(Number(id), Infinity);
    }
  }

  setCreative(creative) {
    this.creative = creative;
    if (creative) {
      for (const id of Object.keys(BLOCKS)) this.counts.set(Number(id), Infinity);
    } else {
      // Start with a small starter pack.
      this.counts = new Map();
      this.counts.set(1, 8); // grass
      this.counts.set(5, 4); // wood
      this.counts.set(10, 8); // planks
    }
  }

  selectedBlock() { return this.hotbar[this.selected]; }
  selectedName() { return blockName(this.selectedBlock()); }

  setHotbar(slot, blockId) {
    if (slot < 0 || slot >= this.hotbar.length) return;
    this.hotbar[slot] = blockId;
  }

  cycle(delta) {
    this.selected = (this.selected + delta + this.hotbar.length) % this.hotbar.length;
  }

  pick(slot) {
    if (slot >= 0 && slot < this.hotbar.length) this.selected = slot;
  }

  has(blockId) {
    if (this.creative) return true;
    const c = this.counts.get(blockId) ?? 0;
    return c > 0;
  }

  consume(blockId) {
    if (this.creative) return;
    const c = this.counts.get(blockId) ?? 0;
    if (c <= 0) return;
    this.counts.set(blockId, c - 1);
  }

  add(blockId, n = 1) {
    if (this.creative) return;
    const c = this.counts.get(blockId) ?? 0;
    this.counts.set(blockId, c + n);
  }

  countOf(blockId) {
    if (this.creative) return Infinity;
    return this.counts.get(blockId) ?? 0;
  }
}
