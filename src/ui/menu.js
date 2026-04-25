// Main menu / pause overlay.

import { hasSave } from '../game/save.js';

const MODE_DESCRIPTIONS = {
  creative: 'Бесконечные ресурсы, полёт, без врагов. Идеально для строительства.',
  survival: 'HP и голод, мобы по ночам. Добывайте ресурсы, чтобы выжить.',
  education: 'Пошаговые подсказки + бесконечные блоки. Для обучения.',
};

export class Menu {
  constructor() {
    this.root = document.getElementById('menu');
    this.modeBtns = Array.from(this.root.querySelectorAll('.mode-btn'));
    this.descriptionEl = document.getElementById('mode-description');
    this.btnNew = document.getElementById('btn-new');
    this.btnLoad = document.getElementById('btn-load');
    this.btnResume = document.getElementById('btn-resume');
    this.seedInput = document.getElementById('seed-input');
    this.selectedMode = 'creative';
    this.callbacks = { onStart: null, onLoad: null, onResume: null };
    this._wire();
    this.refreshLoadButton();
  }

  refreshLoadButton() {
    this.btnLoad.style.display = hasSave() ? '' : 'none';
  }

  _wire() {
    this.modeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.modeBtns.forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedMode = btn.dataset.mode;
        this.descriptionEl.textContent = MODE_DESCRIPTIONS[this.selectedMode] || '';
      });
    });
    this.btnNew.addEventListener('click', () => {
      const seed = parseInt(this.seedInput.value, 10) || Math.floor(Math.random() * 100000);
      this.callbacks.onStart?.(this.selectedMode, seed);
    });
    this.btnLoad.addEventListener('click', () => {
      this.callbacks.onLoad?.();
    });
    this.btnResume.addEventListener('click', () => {
      this.callbacks.onResume?.();
    });
  }

  show(canResume = false) {
    this.root.classList.remove('hidden');
    this.btnResume.classList.toggle('hidden', !canResume);
    this.refreshLoadButton();
  }

  hide() { this.root.classList.add('hidden'); }

  on(event, cb) { this.callbacks[event] = cb; }
}
