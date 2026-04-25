// HUD updates: hotbar slots, status bars, hint text, inventory panel.

import { blockName } from '../engine/blocks.js';
import { blockSwatch } from '../engine/textures.js';
import { PALETTE } from '../engine/blocks.js';

export class Hud {
  constructor(inventory) {
    this.inventory = inventory;
    this.hotbar = document.getElementById('hotbar');
    this.healthFill = document.querySelector('#health-bar .fill');
    this.hungerFill = document.querySelector('#hunger-bar .fill');
    this.modeIndicator = document.getElementById('mode-indicator');
    this.timeIndicator = document.getElementById('time-indicator');
    this.hintBox = document.getElementById('hint-box');
    this.inventoryPanel = document.getElementById('inventory');
    this.invGrid = document.getElementById('inventory-grid');
    this.hud = document.getElementById('hud');
    this.deathOverlay = document.getElementById('death');
    this.buildHotbar();
    this.buildInventoryGrid();
  }

  show() { this.hud.classList.remove('hidden'); }
  hide() { this.hud.classList.add('hidden'); }

  buildHotbar() {
    this.hotbar.innerHTML = '';
    for (let i = 0; i < this.inventory.hotbar.length; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      const sw = document.createElement('div');
      sw.className = 'swatch';
      slot.appendChild(sw);
      const name = document.createElement('div');
      name.className = 'name';
      slot.appendChild(name);
      const count = document.createElement('div');
      count.className = 'count';
      slot.appendChild(count);
      slot.dataset.slot = i;
      this.hotbar.appendChild(slot);
    }
  }

  buildInventoryGrid() {
    this.invGrid.innerHTML = '';
    for (const id of PALETTE) {
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      cell.dataset.blockId = id;
      const sw = document.createElement('div');
      sw.className = 'swatch';
      sw.style.background = blockSwatch(id);
      cell.appendChild(sw);
      const lbl = document.createElement('div');
      lbl.className = 'lbl';
      lbl.textContent = blockName(id);
      cell.appendChild(lbl);
      this.invGrid.appendChild(cell);
    }
  }

  refresh(player, timeOfDay) {
    const slots = this.hotbar.children;
    for (let i = 0; i < slots.length; i++) {
      const el = slots[i];
      el.classList.toggle('active', i === this.inventory.selected);
      const blockId = this.inventory.hotbar[i];
      const sw = el.querySelector('.swatch');
      sw.style.background = blockSwatch(blockId);
      el.querySelector('.name').textContent = blockName(blockId);
      const c = this.inventory.countOf(blockId);
      el.querySelector('.count').textContent = (c === Infinity ? '' : (c > 0 ? c : ''));
    }

    const hpPct = (player.hp / player.maxHp) * 100;
    const hgPct = (player.hunger / player.maxHunger) * 100;
    this.healthFill.style.width = `${Math.max(0, hpPct)}%`;
    this.hungerFill.style.width = `${Math.max(0, hgPct)}%`;
    this.modeIndicator.textContent = player.mode.toUpperCase();
    if (timeOfDay != null) {
      const totalMin = Math.floor(timeOfDay * 1440) % 1440;
      const hh = Math.floor(totalMin / 60).toString().padStart(2, '0');
      const mm = (totalMin % 60).toString().padStart(2, '0');
      this.timeIndicator.textContent = `${hh}:${mm}`;
    }
  }

  setHint(text) {
    if (!text) {
      this.hintBox.classList.add('empty');
      this.hintBox.textContent = '';
    } else {
      this.hintBox.classList.remove('empty');
      this.hintBox.textContent = text;
    }
  }

  toggleInventory(force) {
    if (force === true) this.inventoryPanel.classList.remove('hidden');
    else if (force === false) this.inventoryPanel.classList.add('hidden');
    else this.inventoryPanel.classList.toggle('hidden');
  }

  isInventoryOpen() { return !this.inventoryPanel.classList.contains('hidden'); }

  showDeath(visible) {
    this.deathOverlay.classList.toggle('hidden', !visible);
  }
}
