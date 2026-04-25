// Linear tutorial steps for the education mode. Each step has a description
// and a check function that returns true once the player completed it.

import { BLOCK } from '../engine/blocks.js';

export function buildLessons() {
  return [
    {
      id: 'look',
      text: 'Урок 1/6 — Управление: подвигайте мышью, чтобы осмотреться.',
      check: (s) => Math.abs(s.player.yaw - s.startYaw) > 0.5 || Math.abs(s.player.pitch) > 0.3,
    },
    {
      id: 'walk',
      text: 'Урок 2/6 — Движение: пройдите вперёд (W) на расстояние 5 блоков.',
      check: (s) => s.player.position.distanceTo(s.startPos) > 5,
    },
    {
      id: 'break',
      text: 'Урок 3/6 — ЛКМ — сломайте 3 блока.',
      check: (s) => s.stats.broken >= 3,
    },
    {
      id: 'place',
      text: 'Урок 4/6 — ПКМ — поставьте 3 блока (выбор блока — колесом мыши или 1-9).',
      check: (s) => s.stats.placed >= 3,
    },
    {
      id: 'redstone',
      text: 'Урок 5/6 — Редстоун: поставьте лампу (15) и рядом рычаг (13). Нажмите R по рычагу — лампа загорится.',
      check: (s) => s.stats.poweredLampSeen,
    },
    {
      id: 'final',
      text: 'Урок 6/6 — Свобода! Постройте всё, что хочется. Откройте инвентарь (E) для дополнительных блоков.',
      check: () => false,
    },
  ];
}

export class EducationState {
  constructor(player) {
    this.lessons = buildLessons();
    this.index = 0;
    this.startPos = player.position.clone();
    this.startYaw = player.yaw;
    this.stats = { broken: 0, placed: 0, poweredLampSeen: false };
  }

  current() { return this.lessons[this.index] ?? null; }

  update(player, world) {
    const cur = this.current();
    if (!cur) return;
    const ctx = { player, world, startPos: this.startPos, startYaw: this.startYaw, stats: this.stats };
    if (cur.check(ctx)) {
      this.index = Math.min(this.lessons.length - 1, this.index + 1);
    }
    // Detect lit lamp anywhere within range of the player.
    if (!this.stats.poweredLampSeen) {
      const px = Math.floor(player.position.x);
      const py = Math.floor(player.position.y);
      const pz = Math.floor(player.position.z);
      for (let dx = -10; dx <= 10; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
          for (let dz = -10; dz <= 10; dz++) {
            const x = px + dx, y = py + dy, z = pz + dz;
            if (world.getBlock(x, y, z) === BLOCK.LAMP && (world.getMeta(x, y, z) ?? 0) > 0) {
              this.stats.poweredLampSeen = true;
              return;
            }
          }
        }
      }
    }
  }

  notePlace() { this.stats.placed += 1; }
  noteBreak() { this.stats.broken += 1; }
}
