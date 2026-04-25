// Block type definitions. Each block has visual and gameplay properties.
// id 0 is reserved for AIR.

export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  WOOD: 5,
  LEAVES: 6,
  SAND: 7,
  WATER: 8,
  GLASS: 9,
  PLANKS: 10,
  BRICK: 11,
  // Redstone family
  WIRE: 12,
  LEVER: 13,
  BUTTON: 14,
  LAMP: 15,
  // Decorative
  GOLD: 16,
  IRON: 17,
  COAL: 18,
  BEDROCK: 19,
  SNOW: 20,
};

// Per-block descriptor.
// color: rgb hex (used for procedural texture).
// solid: blocks movement.
// transparent: cull faces against same neighbor only? false = opaque (cull when neighbor is opaque),
//              true = always render unless the neighbor is the same block (e.g. water).
// hardness: how long it takes to mine (relative units).
// liquid: water-like.
// emits: if >0, this block emits light (0..15).
// powered: redstone visual flag, written/read at runtime.
const D = (overrides) => ({
  solid: true,
  transparent: false,
  hardness: 1,
  liquid: false,
  emits: 0,
  drops: null,
  ...overrides,
});

export const BLOCKS = {
  [BLOCK.AIR]: D({ name: 'air', solid: false, transparent: true, hardness: 0, color: 0x000000 }),
  [BLOCK.GRASS]: D({ name: 'Трава', color: 0x6cb04b, topColor: 0x6cb04b, sideColor: 0x8a6a3a, bottomColor: 0x8b5a2b, hardness: 1 }),
  [BLOCK.DIRT]: D({ name: 'Земля', color: 0x8b5a2b, hardness: 1 }),
  [BLOCK.STONE]: D({ name: 'Камень', color: 0x808080, hardness: 4, drops: BLOCK.COBBLESTONE }),
  [BLOCK.COBBLESTONE]: D({ name: 'Булыжник', color: 0x6b6b6b, hardness: 4 }),
  [BLOCK.WOOD]: D({ name: 'Древесина', color: 0x6b4a26, topColor: 0xa07a4e, sideColor: 0x6b4a26, bottomColor: 0xa07a4e, hardness: 2 }),
  [BLOCK.LEAVES]: D({ name: 'Листва', color: 0x3a7a2a, transparent: true, hardness: 0.5 }),
  [BLOCK.SAND]: D({ name: 'Песок', color: 0xe6d27a, hardness: 1 }),
  [BLOCK.WATER]: D({ name: 'Вода', color: 0x3070ff, transparent: true, solid: false, liquid: true, hardness: 0 }),
  [BLOCK.GLASS]: D({ name: 'Стекло', color: 0xb8e5ff, transparent: true, hardness: 0.5 }),
  [BLOCK.PLANKS]: D({ name: 'Доски', color: 0xb98654, hardness: 2 }),
  [BLOCK.BRICK]: D({ name: 'Кирпич', color: 0xa14a3a, hardness: 3 }),
  [BLOCK.WIRE]: D({ name: 'Провод', color: 0x551111, transparent: true, solid: false, hardness: 0.2 }),
  [BLOCK.LEVER]: D({ name: 'Рычаг', color: 0x999999, transparent: true, solid: false, hardness: 0.5 }),
  [BLOCK.BUTTON]: D({ name: 'Кнопка', color: 0xcccccc, transparent: true, solid: false, hardness: 0.5 }),
  [BLOCK.LAMP]: D({ name: 'Лампа', color: 0xcfa030, hardness: 1, emits: 12 }),
  [BLOCK.GOLD]: D({ name: 'Золото', color: 0xf5d442, hardness: 5 }),
  [BLOCK.IRON]: D({ name: 'Железо', color: 0xb0b0b8, hardness: 5 }),
  [BLOCK.COAL]: D({ name: 'Уголь', color: 0x222222, hardness: 4 }),
  [BLOCK.BEDROCK]: D({ name: 'Бедрок', color: 0x333333, hardness: 1000 }),
  [BLOCK.SNOW]: D({ name: 'Снег', color: 0xf5f9ff, hardness: 0.5 }),
};

// Order shown in inventory / hotbar.
export const PALETTE = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.COBBLESTONE,
  BLOCK.WOOD, BLOCK.PLANKS, BLOCK.LEAVES, BLOCK.SAND,
  BLOCK.GLASS, BLOCK.BRICK, BLOCK.GOLD, BLOCK.IRON,
  BLOCK.COAL, BLOCK.SNOW,
  BLOCK.WIRE, BLOCK.LEVER, BLOCK.BUTTON, BLOCK.LAMP,
];

export function isOpaque(id) {
  if (id === BLOCK.AIR) return false;
  const b = BLOCKS[id];
  return b ? !b.transparent : false;
}

export function isSolid(id) {
  if (id === BLOCK.AIR) return false;
  const b = BLOCKS[id];
  return b ? b.solid : false;
}

export function isLiquid(id) {
  return BLOCKS[id]?.liquid === true;
}

export function blockName(id) {
  return BLOCKS[id]?.name || 'unknown';
}

export function blockHardness(id) {
  return BLOCKS[id]?.hardness ?? 1;
}

export function isRedstone(id) {
  return id === BLOCK.WIRE || id === BLOCK.LEVER ||
    id === BLOCK.BUTTON || id === BLOCK.LAMP;
}
