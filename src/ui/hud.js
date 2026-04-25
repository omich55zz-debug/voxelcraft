// HUD updates: hotbar slots, status bars, hint text, inventory panel,
// chest UI, NPC dialog toast, quest panel.

import { blockName, PALETTE } from '../engine/blocks.js';
import { blockSwatch } from '../engine/textures.js';

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
    this.chestPanel = document.getElementById('chest');
    this.chestGrid = document.getElementById('chest-grid');
    this.questPanel = document.getElementById('quest-panel');
    this.dialogToast = document.getElementById('dialog-toast');
    this._dialogTimer = null;
    this._chestCb = null;
    this.buildHotbar();
    this.buildInventoryGrid();
    this._bindChest();
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && !this.chestPanel.classList.contains('hidden')) {
        this.hideChest();
      }
    });
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

  setQuest(quest, completed, total) {
    if (!quest) {
      this.questPanel.classList.add('hidden');
      return;
    }
    this.questPanel.classList.remove('hidden');
    this.questPanel.querySelector('.quest-name').textContent = quest.title;
    this.questPanel.querySelector('.quest-hint').textContent = quest.hint;
    this.questPanel.querySelector('.quest-progress').textContent =
      `Прогресс: ${completed}/${total}`;
  }

  showDialog(text, durationMs = 4500) {
    this.dialogToast.textContent = text;
    this.dialogToast.classList.remove('hidden');
    if (this._dialogTimer) clearTimeout(this._dialogTimer);
    this._dialogTimer = setTimeout(() => {
      this.dialogToast.classList.add('hidden');
    }, durationMs);
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

  // ---------- chest UI ----------
  _bindChest() {
    this.chestGrid.addEventListener('click', (ev) => {
      const cell = ev.target.closest('.chest-cell');
      if (!cell) return;
      const slot = parseInt(cell.dataset.slot, 10);
      const action = ev.shiftKey ? 'put' : 'take';
      this._chestCb?.(slot, action);
    });
  }

  showChest(items, cb) {
    this._chestCb = cb;
    this.chestGrid.innerHTML = '';
    for (let i = 0; i < items.length; i++) {
      const cell = document.createElement('div');
      cell.className = 'chest-cell';
      cell.dataset.slot = i;
      const sw = document.createElement('div');
      sw.className = 'swatch';
      const item = items[i];
      if (item) {
        sw.style.background = blockSwatch(item.id);
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = blockName(item.id);
        cell.appendChild(name);
        const count = document.createElement('div');
        count.className = 'count';
        count.textContent = item.count > 1 ? item.count : '';
        cell.appendChild(count);
      } else {
        sw.style.background = '#222';
      }
      cell.insertBefore(sw, cell.firstChild);
      this.chestGrid.appendChild(cell);
    }
    this.chestPanel.classList.remove('hidden');
  }

  hideChest() {
    this.chestPanel.classList.add('hidden');
    this._chestCb = null;
  }
}
