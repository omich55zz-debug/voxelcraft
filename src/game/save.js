// LocalStorage-based save/load. The world is rebuilt from seed + delta map,
// keeping save sizes small.

const KEY = 'voxelcraft.save.v1';

export function hasSave() {
  try { return localStorage.getItem(KEY) != null; } catch { return false; }
}

export function saveGame(state) {
  const payload = {
    seed: state.world.seed,
    changes: Object.fromEntries(state.world.changes),
    player: {
      x: state.player.position.x,
      y: state.player.position.y,
      z: state.player.position.z,
      yaw: state.player.yaw,
      pitch: state.player.pitch,
      mode: state.player.mode,
      hp: state.player.hp,
      hunger: state.player.hunger,
    },
    timeOfDay: state.timeOfDay,
    inventory: {
      hotbar: state.inventory.hotbar,
      selected: state.inventory.selected,
      counts: Object.fromEntries(
        Array.from(state.inventory.counts.entries()).filter(([, v]) => v !== Infinity),
      ),
      creative: state.inventory.creative,
    },
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.error('save failed', err);
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('load failed', err);
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
