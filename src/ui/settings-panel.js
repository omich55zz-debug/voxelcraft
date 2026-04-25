// Settings panel: wires the input controls in #settings to the singleton
// settings store and applies UI-side toggles (HUD/crosshair visibility, FPS).

import { settings } from '../game/settings.js';

const BINDINGS = [
  { id: 'set-fov',         out: 'out-fov',        key: 'fov',              type: 'range' },
  { id: 'set-rd',          out: 'out-rd',         key: 'renderDistance',   type: 'range' },
  { id: 'set-mouse',       out: 'out-mouse',      key: 'mouseSensitivity', type: 'range' },
  { id: 'set-touch',       out: 'out-touch',      key: 'touchSensitivity', type: 'range' },
  { id: 'set-touch-size',  out: 'out-touch-size', key: 'touchButtonSize',  type: 'range' },
  { id: 'set-volume',      out: 'out-volume',     key: 'masterVolume',     type: 'range' },
  { id: 'set-invert-y',    key: 'invertY',         type: 'checkbox' },
  { id: 'set-show-hud',    key: 'showHud',         type: 'checkbox' },
  { id: 'set-show-crosshair', key: 'showCrosshair', type: 'checkbox' },
  { id: 'set-fps',         key: 'showFps',         type: 'checkbox' },
];

export class SettingsPanel {
  constructor() {
    this.root = document.getElementById('settings');
    this.btnClose = document.getElementById('set-close');
    this.btnReset = document.getElementById('set-reset');
    this._wire();
    this._refresh();
    this._applyUi();
    settings.onChange(() => this._applyUi());
  }

  show() { this.root.classList.remove('hidden'); this._refresh(); }
  hide() { this.root.classList.add('hidden'); }
  isOpen() { return !this.root.classList.contains('hidden'); }

  _wire() {
    for (const b of BINDINGS) {
      const el = document.getElementById(b.id);
      if (!el) continue;
      const out = b.out ? document.getElementById(b.out) : null;
      if (b.type === 'range') {
        el.addEventListener('input', () => {
          const v = parseFloat(el.value);
          settings.set(b.key, v);
          if (out) out.textContent = this._formatValue(b.key, v);
        });
      } else {
        el.addEventListener('change', () => {
          settings.set(b.key, !!el.checked);
        });
      }
    }
    this.btnClose?.addEventListener('click', () => this.hide());
    this.btnReset?.addEventListener('click', () => {
      settings.reset();
      this._refresh();
    });
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isOpen()) {
        this.hide();
        e.stopPropagation();
      }
    });
  }

  _refresh() {
    for (const b of BINDINGS) {
      const el = document.getElementById(b.id);
      if (!el) continue;
      const v = settings.get(b.key);
      if (b.type === 'range') {
        el.value = String(v);
        const out = b.out ? document.getElementById(b.out) : null;
        if (out) out.textContent = this._formatValue(b.key, v);
      } else {
        el.checked = !!v;
      }
    }
  }

  _formatValue(key, v) {
    if (key === 'fov') return `${Math.round(v)}°`;
    if (key === 'renderDistance') return `${v} чанков`;
    if (key === 'masterVolume') return `${Math.round(v * 100)}%`;
    if (key === 'touchButtonSize') return `${Math.round(v * 100)}%`;
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }

  _applyUi() {
    const hud = document.getElementById('hud');
    const cross = document.getElementById('crosshair');
    const fps = document.getElementById('fps-pill');
    if (hud) hud.classList.toggle('user-hidden', !settings.get('showHud'));
    if (cross) cross.classList.toggle('hidden', !settings.get('showCrosshair'));
    if (fps) fps.classList.toggle('hidden', !settings.get('showFps'));
  }
}
