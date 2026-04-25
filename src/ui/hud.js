// HUD updates: hotbar slots, status bars, hint text, inventory panel,
// chest UI, NPC dialog toast, quest panel.

import { blockName, PALETTE, isTool, toolKind } from '../engine/blocks.js';
import { blockSwatch } from '../engine/textures.js';
import { TOOL_ICON_DRAWERS } from '../game/viewmodel.js';

// Pre-render tool icon sprites as data URLs so the hotbar swatches can show
// the same pixel art that's in the player's hand.
const TOOL_ICON_URLS = {};
function getToolIconUrl(toolName) {
  if (TOOL_ICON_URLS[toolName]) return TOOL_ICON_URLS[toolName];
  const drawer = TOOL_ICON_DRAWERS[toolName];
  if (!drawer) return null;
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawer(ctx);
  TOOL_ICON_URLS[toolName] = c.toDataURL('image/png');
  return TOOL_ICON_URLS[toolName];
}

// Pixel-art heart sprite, 11x10. Returns a data URL with the requested fill
// state: 'full', 'half', or 'empty'.
function makeHeartSprite(state) {
  const c = document.createElement('canvas');
  c.width = 11; c.height = 10;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // Outline mask (black).
  const O = '#1a0205';
  // Background (empty) red.
  const E = '#3a0a12';
  // Filled red + highlight.
  const F1 = '#cc1d28';
  const F2 = '#f04652';
  const HL = '#ffd0d4';
  const px = (x, y, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); };
  // Heart outline (10x9 inside 11x10).
  const outline = [
    [1,1],[2,1],[3,1],[6,1],[7,1],[8,1],
    [0,2],[4,2],[5,2],[9,2],
    [0,3],[9,3],
    [0,4],[9,4],
    [1,5],[8,5],
    [2,6],[7,6],
    [3,7],[6,7],
    [4,8],[5,8],
  ];
  for (const [x, y] of outline) px(x, y, O);
  // Fill empty.
  const fillCells = [];
  for (let y = 1; y <= 4; y++) {
    for (let x = 1; x <= 8; x++) {
      if ((y === 1 && (x === 4 || x === 5)) || (y === 2 && x === 0) || (y === 2 && x === 9)) continue;
      const isOutline = outline.some(([ox, oy]) => ox === x && oy === y);
      if (!isOutline) fillCells.push([x, y]);
    }
  }
  // Center/lower fill row by row inside outline.
  for (let y = 5; y <= 7; y++) {
    const inset = y - 4;
    for (let x = 1 + inset; x <= 8 - inset; x++) {
      const isOutline = outline.some(([ox, oy]) => ox === x && oy === y);
      if (!isOutline) fillCells.push([x, y]);
    }
  }
  if (state === 'empty') {
    for (const [x, y] of fillCells) px(x, y, E);
    return c.toDataURL();
  }
  for (const [x, y] of fillCells) {
    const isLeftHalf = x <= 4;
    if (state === 'half' && !isLeftHalf) {
      px(x, y, E);
    } else {
      // Lower rows darker, upper highlights brighter.
      const color = (y === 1 || y === 2) ? F2 : F1;
      px(x, y, color);
    }
  }
  // Two highlight pixels on the upper-left lobe.
  if (state === 'full' || state === 'half') {
    px(2, 2, HL); px(3, 2, HL);
  }
  return c.toDataURL();
}

// Pixel-art drumstick sprite for hunger, 11x10.
function makeFoodSprite(state) {
  const c = document.createElement('canvas');
  c.width = 11; c.height = 10;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const O = '#2a1500';
  const E_BONE = '#393226';
  const E_MEAT = '#3a2618';
  const BONE = '#f4e2b2';
  const BONE_HL = '#ffffff';
  const MEAT = '#9c5a26';
  const MEAT_HL = '#c97a3a';
  const px = (x, y, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); };
  // Outline of a drumstick rotated 45° (meat at top-left, bone at bottom-right).
  const outline = [
    [1,1],[2,1],[3,1],[4,1],
    [0,2],[5,2],
    [0,3],[5,3],
    [1,4],[2,4],[6,4],
    [3,5],[4,5],[7,5],
    [5,6],[8,6],
    [6,7],[9,7],
    [7,8],[8,8],[9,8],
  ];
  for (const [x, y] of outline) px(x, y, O);
  const meatCells = [
    [1,2],[2,2],[3,2],[4,2],
    [1,3],[2,3],[3,3],[4,3],
    [3,4],[4,4],[5,4],
    [4,5],[5,5],[6,5],
  ];
  const boneCells = [
    [6,6],[7,6],
    [7,7],[8,7],
    [8,8],
  ];
  if (state === 'empty') {
    for (const [x, y] of meatCells) px(x, y, E_MEAT);
    for (const [x, y] of boneCells) px(x, y, E_BONE);
    return c.toDataURL();
  }
  // half/full
  const isLeftHalf = (x) => x <= 4;
  for (const [x, y] of meatCells) {
    if (state === 'half' && !isLeftHalf(x)) { px(x, y, E_MEAT); continue; }
    px(x, y, (y === 2 ? MEAT_HL : MEAT));
  }
  for (const [x, y] of boneCells) {
    if (state === 'half') { px(x, y, E_BONE); continue; }
    px(x, y, (y === 6 ? BONE_HL : BONE));
  }
  return c.toDataURL();
}

const HEART_FULL = makeHeartSprite('full');
const HEART_HALF = makeHeartSprite('half');
const HEART_EMPTY = makeHeartSprite('empty');
const FOOD_FULL = makeFoodSprite('full');
const FOOD_HALF = makeFoodSprite('half');
const FOOD_EMPTY = makeFoodSprite('empty');

const MODE_LABELS = {
  creative:  { label: 'Творчество', icon: '✦' },
  survival:  { label: 'Выживание', icon: '⚔' },
  education: { label: 'Обучение', icon: '✎' },
  magic:     { label: 'Магия', icon: '✷' },
};

function buildVitalRow(container, count, sprites) {
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const img = document.createElement('img');
    img.className = 'vital';
    img.src = sprites.empty;
    container.appendChild(img);
  }
  return container.children;
}

function refreshVitals(elements, value, max, sprites) {
  // Each icon represents 2 units, so 10 icons = 20 max (Minecraft-style).
  const halves = Math.round((value / max) * elements.length * 2);
  for (let i = 0; i < elements.length; i++) {
    const filled = halves - i * 2;
    const src = filled >= 2 ? sprites.full : (filled === 1 ? sprites.half : sprites.empty);
    if (elements[i].src !== src) elements[i].src = src;
  }
}

export class Hud {
  constructor(inventory) {
    this.inventory = inventory;
    this.hotbar = document.getElementById('hotbar');
    this.heartsRow = document.getElementById('hearts');
    this.hungerRow = document.getElementById('hunger');
    this.modePill = document.getElementById('mode-pill');
    this.timePill = document.getElementById('time-pill');
    this.fpsPill = document.getElementById('fps-pill');
    this.heartElems = buildVitalRow(this.heartsRow, 10, { full: HEART_FULL, half: HEART_HALF, empty: HEART_EMPTY });
    this.hungerElems = buildVitalRow(this.hungerRow, 10, { full: FOOD_FULL, half: FOOD_HALF, empty: FOOD_EMPTY });
    this._fpsAcc = 0;
    this._fpsCount = 0;
    this._fpsLast = performance.now();
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
      const idx = document.createElement('div');
      idx.className = 'idx';
      idx.textContent = String(i + 1);
      slot.appendChild(idx);
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
      if (isTool(blockId)) {
        const url = getToolIconUrl(toolKind(blockId));
        if (url) {
          sw.style.background = `${blockSwatch(blockId)} url(${url}) center center / 80% 80% no-repeat`;
          sw.style.imageRendering = 'pixelated';
        } else {
          sw.style.background = blockSwatch(blockId);
        }
      } else {
        sw.style.background = blockSwatch(blockId);
      }
      el.querySelector('.name').textContent = blockName(blockId);
      const c = this.inventory.countOf(blockId);
      el.querySelector('.count').textContent = (c === Infinity ? '' : (c > 0 ? c : ''));
    }

    refreshVitals(this.heartElems, player.hp, player.maxHp,
      { full: HEART_FULL, half: HEART_HALF, empty: HEART_EMPTY });
    refreshVitals(this.hungerElems, player.hunger, player.maxHunger,
      { full: FOOD_FULL, half: FOOD_HALF, empty: FOOD_EMPTY });
    // In creative-style modes hunger is irrelevant; dim the row.
    const hideHunger = (player.mode === 'creative' || player.mode === 'education' || player.mode === 'magic');
    this.hungerRow.classList.toggle('dimmed', hideHunger);

    const modeKey = player.mode in MODE_LABELS ? player.mode : 'creative';
    const m = MODE_LABELS[modeKey];
    this.modePill.querySelector('.txt').textContent = m.label;
    this.modePill.querySelector('.ico').textContent = m.icon;
    this.modePill.dataset.mode = modeKey;

    if (timeOfDay != null) {
      const totalMin = Math.floor(timeOfDay * 1440) % 1440;
      const hh = Math.floor(totalMin / 60).toString().padStart(2, '0');
      const mm = (totalMin % 60).toString().padStart(2, '0');
      this.timePill.querySelector('.txt').textContent = `${hh}:${mm}`;
      const isDay = timeOfDay > 0.25 && timeOfDay < 0.75;
      this.timePill.querySelector('.ico').textContent = isDay ? '☀' : '☾';
      this.timePill.classList.toggle('night', !isDay);
    }
    if (this.fpsPill && !this.fpsPill.classList.contains('hidden')) {
      const now = performance.now();
      const dt = now - this._fpsLast;
      this._fpsLast = now;
      this._fpsAcc += dt;
      this._fpsCount++;
      if (this._fpsAcc >= 500) {
        const fps = Math.round(1000 / (this._fpsAcc / this._fpsCount));
        this.fpsPill.querySelector('.txt').textContent = String(fps);
        this._fpsAcc = 0;
        this._fpsCount = 0;
      }
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
