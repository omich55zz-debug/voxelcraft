// Voxel raycasting (DDA / Amanatides-Woo).

import { BLOCK } from './blocks.js';

// Returns the first non-air, non-water block hit, or null. The result
// includes the block coordinate, the face normal of the hit, and the
// adjacent (open) coordinate where placement should occur.
export function raycastVoxel(world, origin, direction, maxDist = 8) {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const dx = direction.x;
  const dy = direction.y;
  const dz = direction.z;

  const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
  const stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
  const stepZ = dz > 0 ? 1 : (dz < 0 ? -1 : 0);

  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;

  const fracX = stepX > 0 ? (1 - (origin.x - Math.floor(origin.x))) : (origin.x - Math.floor(origin.x));
  const fracY = stepY > 0 ? (1 - (origin.y - Math.floor(origin.y))) : (origin.y - Math.floor(origin.y));
  const fracZ = stepZ > 0 ? (1 - (origin.z - Math.floor(origin.z))) : (origin.z - Math.floor(origin.z));

  let tMaxX = stepX !== 0 ? fracX * tDeltaX : Infinity;
  let tMaxY = stepY !== 0 ? fracY * tDeltaY : Infinity;
  let tMaxZ = stepZ !== 0 ? fracZ * tDeltaZ : Infinity;

  let face = [0, 0, 0];
  let t = 0;

  while (t <= maxDist) {
    const id = world.getBlock(x, y, z);
    if (id !== BLOCK.AIR && id !== BLOCK.WATER) {
      return {
        block: { x, y, z, id },
        face,
        place: { x: x + face[0], y: y + face[1], z: z + face[2] },
        distance: t,
      };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      face = [-stepX, 0, 0];
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      face = [0, -stepY, 0];
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      face = [0, 0, -stepZ];
    }
  }
  return null;
}
