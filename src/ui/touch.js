// Touch controls for mobile / Android devices. Provides a virtual joystick
// for movement (left thumb) and a swipe area (right thumb) for camera look,
// plus on-screen buttons for jump, fly, dig (left-click equivalent), place
// (right-click equivalent), inventory and the interact key (R).
//
// The touch UI hooks into the same `keys` set and `mouseButtons` flags that
// the desktop input code already uses, so the rest of the game does not have
// to know about touch input at all.

import { settings } from '../game/settings.js';

const ACTIVE_KEY_FOR_BUTTON = {
  'btn-jump':    'Space',
  'btn-fly':     'KeyF',
  'btn-crouch':  'ShiftLeft',
  'btn-sprint':  'ControlLeft',
};

export function isTouchDevice() {
  return (
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0)
  );
}

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('touch');
    if (!this.root) return;
    this._joyActiveTouchId = null;
    this._lookActiveTouchId = null;
    this._lookLastX = 0;
    this._lookLastY = 0;
    this._lookSensitivity = settings.get('touchSensitivity') || 2.4;
    this.joyKnob = this.root.querySelector('.joy-knob');
    this.joyBase = this.root.querySelector('.joy-base');
    this.lookArea = this.root.querySelector('.look-area');
    this._wireJoystick();
    this._wireLook();
    this._wireButtons();
    this._wireHotbar();
    this._applySettings();
    settings.onChange(() => this._applySettings());
  }

  _applySettings() {
    this._lookSensitivity = settings.get('touchSensitivity') || 2.4;
    const size = settings.get('touchButtonSize') || 1.0;
    if (this.root) this.root.style.setProperty('--touch-scale', String(size));
  }

  show() { if (this.root) this.root.classList.remove('hidden'); }
  hide() { if (this.root) this.root.classList.add('hidden'); }

  _wireJoystick() {
    const base = this.joyBase;
    if (!base) return;
    const radius = 48;
    const setKnob = (dx, dy) => {
      const len = Math.hypot(dx, dy);
      if (len > radius) { dx = dx * radius / len; dy = dy * radius / len; }
      this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      // Map joystick to WASD keys.
      const k = this.game.keys;
      const norm = (v) => Math.abs(v) / radius;
      const F = (-dy / radius) > 0.25;
      const B = ( dy / radius) > 0.25;
      const L = (-dx / radius) > 0.25;
      const R = ( dx / radius) > 0.25;
      const sprintFromMagnitude = norm(dx) > 0.85 || norm(dy) > 0.85;
      F ? k.add('KeyW') : k.delete('KeyW');
      B ? k.add('KeyS') : k.delete('KeyS');
      L ? k.add('KeyA') : k.delete('KeyA');
      R ? k.add('KeyD') : k.delete('KeyD');
      if (sprintFromMagnitude) k.add('ControlLeft');
    };
    const reset = () => {
      this.joyKnob.style.transform = 'translate(0, 0)';
      this.game.keys.delete('KeyW');
      this.game.keys.delete('KeyA');
      this.game.keys.delete('KeyS');
      this.game.keys.delete('KeyD');
      this.game.keys.delete('ControlLeft');
    };
    base.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      this._joyActiveTouchId = t.identifier;
      const r = base.getBoundingClientRect();
      const dx = t.clientX - (r.left + r.width / 2);
      const dy = t.clientY - (r.top + r.height / 2);
      setKnob(dx, dy);
      e.preventDefault();
    }, { passive: false });
    base.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._joyActiveTouchId) continue;
        const r = base.getBoundingClientRect();
        const dx = t.clientX - (r.left + r.width / 2);
        const dy = t.clientY - (r.top + r.height / 2);
        setKnob(dx, dy);
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyActiveTouchId) {
          this._joyActiveTouchId = null;
          reset();
        }
      }
    };
    base.addEventListener('touchend', end);
    base.addEventListener('touchcancel', end);
  }

  _wireLook() {
    const area = this.lookArea;
    if (!area) return;
    area.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      this._lookActiveTouchId = t.identifier;
      this._lookLastX = t.clientX;
      this._lookLastY = t.clientY;
      this._lookStart = performance.now();
      this._lookMoved = false;
      e.preventDefault();
    }, { passive: false });
    area.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._lookActiveTouchId) continue;
        const dx = t.clientX - this._lookLastX;
        const dy = t.clientY - this._lookLastY;
        this._lookLastX = t.clientX;
        this._lookLastY = t.clientY;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) this._lookMoved = true;
        const dyAdj = settings.get('invertY') ? -dy : dy;
        this.game.player?.applyMouseLook(dx * this._lookSensitivity, dyAdj * this._lookSensitivity, 0.0025);
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._lookActiveTouchId) continue;
        this._lookActiveTouchId = null;
        // A short tap that didn't move = "use" (place block / interact).
        const dur = performance.now() - this._lookStart;
        if (!this._lookMoved && dur < 220) {
          this.game.viewModel?.triggerSwing();
          this.game.tryPlace();
        }
      }
    };
    area.addEventListener('touchend', end);
    area.addEventListener('touchcancel', end);
  }

  _wireButtons() {
    const wireMomentary = (id, onDown, onUp) => {
      const el = this.root.querySelector(`#${id}`);
      if (!el) return;
      const down = (e) => { onDown(); el.classList.add('pressed'); e.preventDefault?.(); };
      const up   = (e) => { onUp(); el.classList.remove('pressed'); e.preventDefault?.(); };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up);
      el.addEventListener('touchcancel', up);
      el.addEventListener('mousedown', down);
      el.addEventListener('mouseup', up);
      el.addEventListener('mouseleave', up);
    };
    // Movement-related buttons -> set/clear keys.
    for (const [id, code] of Object.entries(ACTIVE_KEY_FOR_BUTTON)) {
      wireMomentary(id,
        () => this.game.keys.add(code),
        () => this.game.keys.delete(code));
    }
    // Dig button = hold left mouse button.
    wireMomentary('btn-dig',
      () => {
        this.game.mouseButtons.left = true;
        this.game.viewModel?.triggerSwing();
      },
      () => { this.game.mouseButtons.left = false; });
    // Place button = single right click (with hold-to-repeat).
    const placeBtn = this.root.querySelector('#btn-place');
    if (placeBtn) {
      const trigger = (e) => {
        this.game.viewModel?.triggerSwing();
        this.game.tryPlace();
        placeBtn.classList.add('pressed');
        e.preventDefault?.();
      };
      const release = () => placeBtn.classList.remove('pressed');
      placeBtn.addEventListener('touchstart', trigger, { passive: false });
      placeBtn.addEventListener('touchend', release);
      placeBtn.addEventListener('mousedown', trigger);
      placeBtn.addEventListener('mouseup', release);
    }
    // Tap-only buttons.
    const tap = (id, fn) => {
      const el = this.root.querySelector(`#${id}`);
      if (!el) return;
      const handler = (e) => { fn(); e.preventDefault?.(); };
      el.addEventListener('touchstart', handler, { passive: false });
      el.addEventListener('click', handler);
    };
    tap('btn-inv',     () => this.game.hud.toggleInventory());
    tap('btn-r',       () => this.game.interact());
    tap('btn-pause',   () => this.game.requestPause());
  }

  _wireHotbar() {
    const hb = document.getElementById('hotbar');
    if (!hb) return;
    hb.addEventListener('touchstart', (e) => {
      const slot = e.target.closest('.hotbar-slot');
      if (!slot) return;
      const idx = parseInt(slot.dataset.slot, 10);
      if (Number.isFinite(idx)) this.game.inventory.pick(idx);
      e.preventDefault();
    }, { passive: false });
  }
}
