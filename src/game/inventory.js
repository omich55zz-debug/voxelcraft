// Inventory + hotbar state. The hotbar has 9 slots; items beyond fit into the
// extended inventory page. In creative mode all blocks/tools are infinite.

import { PALETTE, BLOCKS, BLOCK, blockName, isTool } from '../engine/blocks.js';

export class Inventory {
  constructor(creative = true) {
    this.creative = creative;
    // Default hotbar: useful basics + tools.
    this.hotbar = [
      BLOCK.TOOL_PICKAXE, BLOCK.TOOL_SWORD, BLOCK.TOOL_AXE,
      BLOCK.GRASS, BLOCK.WOOD, BLOCK.PLANKS,
      BLOCK.STONE, BLOCK.GLASS, BLOCK.LAMP,
    ];
    this.selected = 0;
    this.counts = new Map(); // itemId -> count (used in survival)
    if (creative) {
      for (const id of Object.keys(BLOCKS)) this.counts.set(Number(id), Infinity);
    }
  }

  setCreative(creative) {
    this.creative = creative;
    if (creative) {
      for (const id of Object.keys(BLOCKS)) this.counts.set(Number(id), Infinity);
    } else {
      // Survival starter kit: one of each tool + a few blocks.
      this.counts = new Map();
      this.counts.set(BLOCK.TOOL_PICKAXE, 1);
      this.counts.set(BLOCK.TOOL_SWORD, 1);
      this.counts.set(BLOCK.TOOL_AXE, 1);
      this.counts.set(BLOCK.TOOL_SHOVEL, 1);
      this.counts.set(BLOCK.PLANKS, 4);
    }
  }

  selectedBlock() { return this.hotbar[this.selected]; }
  selectedName() { return blockName(this.selectedBlock()); }
  selectedIsTool() { return isTool(this.selectedBlock()); }

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
    if (isTool(blockId)) return; // tools don't get consumed
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

// All palette items including tools.
export const FULL_PALETTE = PALETTE;
