import { Game } from './game/game.js';
import { Hud } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { Inventory } from './game/inventory.js';
import { hasSave, loadGame } from './game/save.js';

const canvas = document.getElementById('game-canvas');
const inv = new Inventory(true);
const hud = new Hud(inv);
const menu = new Menu();
const game = new Game(canvas, hud);

game.start();

menu.on('onStart', (mode, seed) => {
  game.startNewWorld(seed, mode);
  menu.hide();
  hud.show();
  game.resume();
});
menu.on('onLoad', () => {
  if (!hasSave()) return;
  const save = loadGame();
  if (save) {
    game.loadFromSave(save);
    menu.hide();
    hud.show();
    game.resume();
  }
});
menu.on('onResume', () => {
  if (!game.world) return;
  menu.hide();
  hud.show();
  game.resume();
});

// Re-show menu on Esc when running.
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !game.paused) {
    game.requestPause();
    menu.show(true);
  }
});

// Initial menu state.
menu.show(false);

// Debug: expose game to window for console inspection.
window.__voxel = { game, hud, menu };
