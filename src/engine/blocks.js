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
  // Magic-dimension blocks
  OBSIDIAN: 21,
  ENDER_STONE: 22,
  MAGIC_CRYSTAL: 23,
  GLOWSTONE: 24,
  PORTAL: 25,
  CHEST: 26,
  // Tools (not placeable; live in hotbar/inventory)
  TOOL_PICKAXE: 100,
  TOOL_AXE: 101,
  TOOL_SHOVEL: 102,
  TOOL_SWORD: 103,
};

// Per-block descriptor.
// color: rgb hex (used for procedural texture).
// solid: blocks movement.
// transparent: cull faces against same neighbor only? false = opaque (cull when neighbor is opaque),
//              true = always render unless the neighbor is the same block (e.g. water).
// hardness: how long it takes to mine (relative units).
// liquid: water-like.
// emits: if >0, this block emits light (0..15).
// material: 'stone' | 'wood' | 'dirt' | 'metal' | 'glass' | 'organic' (for tool effectiveness).
// placeable: if false, item only lives in inventory (tools).
// tool: if set, this is a tool descriptor (not a placeable block).
const D = (overrides) => ({
  solid: true,
  transparent: false,
  hardness: 1,
  liquid: false,
  emits: 0,
  drops: null,
  placeable: true,
  material: 'misc',
  ...overrides,
});

const T = (overrides) => ({
  ...overrides,
  solid: false,
  transparent: true,
  placeable: false,
  hardness: 0,
  emits: 0,
  liquid: false,
  drops: null,
  material: 'tool',
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
  [BLOCK.BEDROCK]: D({ name: 'Бедрок', color: 0x333333, hardness: 1000, material: 'stone' }),
  [BLOCK.SNOW]: D({ name: 'Снег', color: 0xf5f9ff, hardness: 0.5, material: 'dirt' }),
  [BLOCK.OBSIDIAN]: D({ name: 'Обсидиан', color: 0x1a0a30, hardness: 8, material: 'stone' }),
  [BLOCK.ENDER_STONE]: D({ name: 'Эндер-камень', color: 0xd0c2a0, hardness: 4, material: 'stone' }),
  [BLOCK.MAGIC_CRYSTAL]: D({ name: 'Кристалл', color: 0xc070ff, hardness: 3, transparent: true, emits: 10, material: 'glass' }),
  [BLOCK.GLOWSTONE]: D({ name: 'Светокамень', color: 0xffd070, hardness: 1, emits: 14, material: 'stone' }),
  [BLOCK.PORTAL]: D({ name: 'Портал', color: 0x9a3afc, transparent: true, solid: false, hardness: 0.5, emits: 8, material: 'glass' }),
  [BLOCK.CHEST]: D({ name: 'Сундук', color: 0x8a5a2b, topColor: 0x6e4520, sideColor: 0x8a5a2b, bottomColor: 0x6e4520, hardness: 2, material: 'wood' }),

  // Tools.
  [BLOCK.TOOL_PICKAXE]: T({ name: 'Кирка', color: 0xaaaaaa, tool: 'pickaxe' }),
  [BLOCK.TOOL_AXE]: T({ name: 'Топор', color: 0x8b5a2b, tool: 'axe' }),
  [BLOCK.TOOL_SHOVEL]: T({ name: 'Лопата', color: 0x9a8a70, tool: 'shovel' }),
  [BLOCK.TOOL_SWORD]: T({ name: 'Меч', color: 0xe0e0ff, tool: 'sword' }),
};

// Set materials on common blocks.
BLOCKS[BLOCK.STONE].material = 'stone';
BLOCKS[BLOCK.COBBLESTONE].material = 'stone';
BLOCKS[BLOCK.GOLD].material = 'stone';
BLOCKS[BLOCK.IRON].material = 'stone';
BLOCKS[BLOCK.COAL].material = 'stone';
BLOCKS[BLOCK.BRICK].material = 'stone';
BLOCKS[BLOCK.WOOD].material = 'wood';
BLOCKS[BLOCK.PLANKS].material = 'wood';
BLOCKS[BLOCK.LEAVES].material = 'organic';
BLOCKS[BLOCK.DIRT].material = 'dirt';
BLOCKS[BLOCK.GRASS].material = 'dirt';
BLOCKS[BLOCK.SAND].material = 'dirt';
BLOCKS[BLOCK.GLASS].material = 'glass';

// Order shown in inventory / hotbar.
export const PALETTE = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.COBBLESTONE,
  BLOCK.WOOD, BLOCK.PLANKS, BLOCK.LEAVES, BLOCK.SAND,
  BLOCK.GLASS, BLOCK.BRICK, BLOCK.GOLD, BLOCK.IRON,
  BLOCK.COAL, BLOCK.SNOW,
  BLOCK.OBSIDIAN, BLOCK.ENDER_STONE, BLOCK.MAGIC_CRYSTAL, BLOCK.GLOWSTONE, BLOCK.PORTAL,
  BLOCK.CHEST,
  BLOCK.WIRE, BLOCK.LEVER, BLOCK.BUTTON, BLOCK.LAMP,
  BLOCK.TOOL_PICKAXE, BLOCK.TOOL_AXE, BLOCK.TOOL_SHOVEL, BLOCK.TOOL_SWORD,
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

export function isChest(id) {
  return id === BLOCK.CHEST;
}

export function isPortal(id) {
  return id === BLOCK.PORTAL;
}

export function isTool(id) {
  return BLOCKS[id]?.tool != null;
}

export function toolKind(id) {
  return BLOCKS[id]?.tool ?? null;
}

export function blockMaterial(id) {
  return BLOCKS[id]?.material ?? 'misc';
}

// Speed multiplier for breaking `targetBlockId` while holding `toolId`.
// Higher = faster mining. 1.0 is bare-hand baseline.
export function toolSpeed(toolId, targetBlockId) {
  const kind = toolKind(toolId);
  const mat = blockMaterial(targetBlockId);
  if (!kind) return 1;
  if (kind === 'pickaxe' && mat === 'stone') return 4;
  if (kind === 'axe' && mat === 'wood') return 4;
  if (kind === 'axe' && mat === 'organic') return 2;
  if (kind === 'shovel' && mat === 'dirt') return 4;
  if (kind === 'sword' && mat === 'organic') return 2;
  return 0.6; // wrong tool slows you down
}

export function isPlaceable(id) {
  return BLOCKS[id]?.placeable !== false && id !== BLOCK.AIR;
}
