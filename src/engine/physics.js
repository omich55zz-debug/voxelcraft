// Player AABB collision against the voxel grid.

import { isSolid } from './blocks.js';

export const PLAYER_HALF_W = 0.3;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.6;

// Move pos by delta with collision against the world. Mutates `pos` and
// returns { onGround, hitWall }.
export function moveAndCollide(world, pos, delta) {
  let onGround = false;
  let hitWall = false;

  const tryMove = (axis, d) => {
    if (d === 0) return false;
    const next = pos.clone();
    next[axis] += d;
    if (collides(world, next)) return true;
    pos[axis] = next[axis];
    return false;
  };

  const collidedY = tryMove('y', delta.y);
  if (collidedY) {
    if (delta.y < 0) onGround = true;
  }
  const collidedX = tryMove('x', delta.x);
  const collidedZ = tryMove('z', delta.z);
  if (collidedX || collidedZ) hitWall = true;

  return { onGround, hitWall };
}

// AABB-vs-voxels overlap test. Player center is at pos (feet at pos.y,
// head at pos.y + PLAYER_HEIGHT).
export function collides(world, pos) {
  const minX = pos.x - PLAYER_HALF_W;
  const maxX = pos.x + PLAYER_HALF_W;
  const minY = pos.y;
  const maxY = pos.y + PLAYER_HEIGHT;
  const minZ = pos.z - PLAYER_HALF_W;
  const maxZ = pos.z + PLAYER_HALF_W;
  const x0 = Math.floor(minX);
  const x1 = Math.floor(maxX);
  const y0 = Math.floor(minY);
  const y1 = Math.floor(maxY);
  const z0 = Math.floor(minZ);
  const z1 = Math.floor(maxZ);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        if (isSolid(world.getBlock(x, y, z))) return true;
      }
    }
  }
  return false;
}

// True if player feet block is liquid.
export function inWater(world, pos) {
  const x = Math.floor(pos.x);
  const y = Math.floor(pos.y + 0.5);
  const z = Math.floor(pos.z);
  const id = world.getBlock(x, y, z);
  return id === 8; // BLOCK.WATER
}
