// Persistent user settings (localStorage). Other modules subscribe to changes.
const STORAGE_KEY = 'voxelcraft-settings-v1';

const DEFAULTS = {
  fov: 70,                  // degrees, 50..100
  renderDistance: 7,        // chunks, 3..12
  mouseSensitivity: 1.0,    // multiplier for mouse look, 0.2..3.0
  invertY: false,           // invert vertical mouse look
  touchSensitivity: 2.4,    // multiplier for touch swipe look
  touchButtonSize: 1.0,     // 0.7..1.4 multiplier
  masterVolume: 0.7,        // 0..1 placeholder for future audio
  showHud: true,            // master HUD visibility
  showCrosshair: true,
  showFps: false,
  smoothCamera: true,       // small camera bob smoothing
};

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

export class Settings {
  constructor() {
    const stored = loadStored();
    this.values = { ...DEFAULTS, ...stored };
    this._listeners = new Set();
  }

  get(key) { return this.values[key]; }

  set(key, value) {
    if (!(key in DEFAULTS)) return;
    this.values[key] = value;
    this._save();
    this._notify(key, value);
  }

  reset() {
    this.values = { ...DEFAULTS };
    this._save();
    this._notify(null, null);
  }

  defaults() { return { ...DEFAULTS }; }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values)); } catch { /* ignore */ }
  }

  _notify(key, value) {
    for (const fn of this._listeners) {
      try { fn(key, value, this.values); } catch { /* ignore */ }
    }
  }
}

// Singleton — every module imports from the same instance.
export const settings = new Settings();
