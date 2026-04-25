// Quest chain. Quests advance based on player actions tracked by the game.
// Each quest is a {id, title, hint, check(state) -> boolean}.

import { BLOCK } from '../engine/blocks.js';

export class QuestState {
  constructor() {
    this.placed = new Map();   // blockId -> count placed
    this.broken = new Map();   // blockId -> count broken
    this.killed = new Map();   // mob kind -> count killed
    this.spokeToVillager = false;
    this.openedChest = false;
    this.litLamps = 0;
    this.enteredMagic = false;
    this.foundCrystal = false;
  }

  notePlace(id) { this.placed.set(id, (this.placed.get(id) ?? 0) + 1); }
  noteBreak(id) { this.broken.set(id, (this.broken.get(id) ?? 0) + 1); }
  noteKill(kind) { this.killed.set(kind, (this.killed.get(kind) ?? 0) + 1); }
}

const QUESTS = [
  {
    id: 'talk',
    title: '\u041f\u043e\u0437\u043d\u0430\u043a\u043e\u043c\u0438\u0442\u044c\u0441\u044f \u0441 \u0436\u0438\u0442\u0435\u043b\u0435\u043c \u0434\u0435\u0440\u0435\u0432\u043d\u0438',
    hint: '\u041f\u043e\u0434\u043e\u0439\u0434\u0438 \u043a NPC \u0438 \u043d\u0430\u0436\u043c\u0438 R \u0434\u043b\u044f \u0440\u0430\u0437\u0433\u043e\u0432\u043e\u0440\u0430.',
    check: (s) => s.spokeToVillager,
  },
  {
    id: 'chest',
    title: '\u041f\u043e\u0441\u0442\u0430\u0432\u044c \u0441\u0443\u043d\u0434\u0443\u043a',
    hint: '\u0412\u044b\u0431\u0435\u0440\u0438 \u0441\u0443\u043d\u0434\u0443\u043a \u0432 \u0438\u043d\u0432\u0435\u043d\u0442\u0430\u0440\u0435 \u0438 \u043f\u043e\u0441\u0442\u0430\u0432\u044c \u0435\u0433\u043e \u0440\u044f\u0434\u043e\u043c (\u041f\u041a\u041c).',
    check: (s) => (s.placed.get(BLOCK.CHEST) ?? 0) > 0,
  },
  {
    id: 'redstone',
    title: '\u0421\u0432\u0435\u0442 \u0432 \u0434\u043e\u043c\u0435',
    hint: '\u0421\u043e\u0431\u0435\u0440\u0438 \u0446\u0435\u043f\u044c \u0438\u0437 \u0440\u044b\u0447\u0430\u0433\u0430, \u043f\u0440\u043e\u0432\u043e\u0434\u0430 \u0438 \u043b\u0430\u043c\u043f\u044b. \u0417\u0430\u0436\u0433\u0438 \u043b\u0430\u043c\u043f\u0443.',
    check: (s) => s.litLamps >= 1,
  },
  {
    id: 'mine',
    title: '\u0421\u0440\u0443\u0431\u0438 5 \u0431\u043b\u043e\u043a\u043e\u0432 \u043a\u0430\u043c\u043d\u044f',
    hint: '\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439 \u043a\u0438\u0440\u043a\u0443 (\u0441\u043b\u043e\u0442 1) \u0438 \u0440\u0430\u0437\u0440\u0443\u0448\u044c 5 \u043a\u0430\u043c\u043d\u0435\u0439.',
    check: (s) => (s.broken.get(BLOCK.STONE) ?? 0) + (s.broken.get(BLOCK.COBBLESTONE) ?? 0) >= 5,
  },
  {
    id: 'magic-portal',
    title: '\u041e\u0442\u043a\u0440\u043e\u0439 \u043f\u043e\u0440\u0442\u0430\u043b \u0432 \u043c\u0430\u0433\u0438\u0447\u0435\u0441\u043a\u043e\u0435 \u0438\u0437\u043c\u0435\u0440\u0435\u043d\u0438\u0435',
    hint: '\u041f\u043e\u0441\u0442\u0430\u0432\u044c \u0431\u043b\u043e\u043a \u041f\u041e\u0420\u0422\u0410\u041b \u0438 \u043f\u0440\u043e\u0439\u0434\u0438 \u0447\u0435\u0440\u0435\u0437 \u043d\u0435\u0433\u043e.',
    check: (s) => s.enteredMagic,
  },
  {
    id: 'crystal',
    title: '\u041d\u0430\u0439\u0434\u0438 \u043c\u0430\u0433\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u043a\u0440\u0438\u0441\u0442\u0430\u043b\u043b',
    hint: '\u0418\u0449\u0438 \u0444\u0438\u043e\u043b\u0435\u0442\u043e\u0432\u044b\u0435 \u043a\u0440\u0438\u0441\u0442\u0430\u043b\u043b\u044b \u0432 \u043c\u0430\u0433\u0438\u0447\u0435\u0441\u043a\u043e\u043c \u043c\u0438\u0440\u0435.',
    check: (s) => s.foundCrystal,
  },
  {
    id: 'slay',
    title: '\u041f\u043e\u0431\u0435\u0434\u0438 3 \u0437\u043e\u043c\u0431\u0438',
    hint: '\u0414\u043e\u0436\u0434\u0438\u0441\u044c \u043d\u043e\u0447\u0438 \u0438 \u0441\u0440\u0430\u0436\u0430\u0439\u0441\u044f \u043c\u0435\u0447\u043e\u043c.',
    check: (s) => (s.killed.get('zombie') ?? 0) >= 3,
  },
];

export class QuestTracker {
  constructor() {
    this.state = new QuestState();
    this.completed = new Set();
    this.activeIdx = 0;
  }

  active() { return QUESTS[this.activeIdx]; }
  done() { return this.activeIdx >= QUESTS.length; }
  totalCount() { return QUESTS.length; }
  completedCount() { return this.completed.size; }

  // Returns the quest that just completed (or null).
  poll() {
    if (this.done()) return null;
    const q = QUESTS[this.activeIdx];
    if (q.check(this.state)) {
      this.completed.add(q.id);
      this.activeIdx++;
      return q;
    }
    return null;
  }
}
