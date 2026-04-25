// Build BufferGeometry for a chunk. Naive face-culling: render a face only if
// the neighbor is air or a different transparent block.

import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT } from './world.js';
import { BLOCK, BLOCKS, isOpaque } from './blocks.js';
import { tileIndex, faceToTileFace, tileUV } from './textures.js';

// Face order: +X, -X, +Y, -Y, +Z, -Z.
// For each face: dx,dy,dz of neighbor + 4 corner offsets (CCW when viewed from outside).
const FACES = [
  { // +X (east)
    dir: [1, 0, 0],
    corners: [
      [1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1],
    ],
    uvFlip: false,
    light: 0.85,
  },
  { // -X (west)
    dir: [-1, 0, 0],
    corners: [
      [0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0],
    ],
    light: 0.75,
  },
  { // +Y (top)
    dir: [0, 1, 0],
    corners: [
      [0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0],
    ],
    light: 1.0,
  },
  { // -Y (bottom)
    dir: [0, -1, 0],
    corners: [
      [0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1],
    ],
    light: 0.55,
  },
  { // +Z (south)
    dir: [0, 0, 1],
    corners: [
      [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1],
    ],
    light: 0.9,
  },
  { // -Z (north)
    dir: [0, 0, -1],
    corners: [
      [0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0],
    ],
    light: 0.8,
  },
];

// Returns true if this face should be rendered.
function shouldRender(blockId, neighborId) {
  if (blockId === BLOCK.AIR) return false;
  if (neighborId === BLOCK.AIR) return true;
  const neighborOpaque = isOpaque(neighborId);
  if (neighborOpaque) return false;
  // If both are the same transparent block (e.g. water-water), don't draw.
  if (neighborId === blockId) return false;
  // Otherwise, draw (e.g. opaque next to glass, glass next to water).
  // But: for transparent block we still want to render face when neighbor is a different transparent block.
  return true;
}

export function buildChunkMesh(world, chunk) {
  // Two pools: opaque and transparent.
  const opaque = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
  const transparent = { positions: [], normals: [], uvs: [], colors: [], indices: [] };

  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const id = chunk.get(lx, ly, lz);
        if (id === BLOCK.AIR) continue;
        const def = BLOCKS[id];
        const wx = baseX + lx;
        const wy = ly;
        const wz = baseZ + lz;

        // For non-cube redstone components (wire/lever/button), render thin geometry.
        if (id === BLOCK.WIRE) {
          addThinPlate(transparent, wx, wy, wz, id, world.getMeta(wx, wy, wz));
          continue;
        }
        if (id === BLOCK.LEVER) {
          addLever(transparent, wx, wy, wz, world.getMeta(wx, wy, wz));
          continue;
        }
        if (id === BLOCK.BUTTON) {
          addButton(transparent, wx, wy, wz, world.getMeta(wx, wy, wz));
          continue;
        }

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = wx + face.dir[0];
          const ny = wy + face.dir[1];
          const nz = wz + face.dir[2];
          const neighborId = world.getBlock(nx, ny, nz);
          if (!shouldRender(id, neighborId)) continue;

          const tile = tileIndex(id, faceToTileFace(f));
          const [u0, v0, u1, v1] = tileUV(tile);
          const target = def.transparent ? transparent : opaque;
          const baseIdx = target.positions.length / 3;
          // 4 corners, in face order: bottom-left, top-left, top-right, bottom-right
          const c0 = face.corners[0];
          const c1 = face.corners[1];
          const c2 = face.corners[2];
          const c3 = face.corners[3];
          target.positions.push(
            wx + c0[0], wy + c0[1], wz + c0[2],
            wx + c1[0], wy + c1[1], wz + c1[2],
            wx + c2[0], wy + c2[1], wz + c2[2],
            wx + c3[0], wy + c3[1], wz + c3[2],
          );
          for (let k = 0; k < 4; k++) {
            target.normals.push(face.dir[0], face.dir[1], face.dir[2]);
          }
          target.uvs.push(u0, v0, u0, v1, u1, v1, u1, v0);
          // Encode shading via vertex color (multiplier).
          let l = face.light;
          // If lamp emits, brighten.
          if (def.emits > 0 && (world.getMeta(wx, wy, wz) ?? 0) > 0) l = 1.0;
          for (let k = 0; k < 4; k++) target.colors.push(l, l, l);
          target.indices.push(
            baseIdx, baseIdx + 1, baseIdx + 2,
            baseIdx, baseIdx + 2, baseIdx + 3,
          );
        }
      }
    }
  }

  return {
    opaque: buildGeometry(opaque),
    transparent: buildGeometry(transparent),
  };
}

function buildGeometry(pool) {
  if (pool.positions.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pool.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pool.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(pool.uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(pool.colors, 3));
  g.setIndex(pool.indices);
  g.computeBoundingSphere();
  return g;
}

function addThinPlate(pool, wx, wy, wz, id, powered) {
  // Wire = thin slab on top of a block surface (y=wy + 0.05).
  const tile = tileIndex(id, 0);
  const [u0, v0, u1, v1] = tileUV(tile);
  const y = wy + 0.06;
  const baseIdx = pool.positions.length / 3;
  pool.positions.push(
    wx, y, wz,
    wx, y, wz + 1,
    wx + 1, y, wz + 1,
    wx + 1, y, wz,
  );
  for (let k = 0; k < 4; k++) pool.normals.push(0, 1, 0);
  pool.uvs.push(u0, v0, u0, v1, u1, v1, u1, v0);
  const l = powered ? 1.2 : 0.6;
  for (let k = 0; k < 4; k++) pool.colors.push(l, l * 0.4, l * 0.4);
  pool.indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
}

function addLever(pool, wx, wy, wz, powered) {
  // A small box from y..y+0.4.
  const tile = tileIndex(BLOCK.LEVER, 1);
  const [u0, v0, u1, v1] = tileUV(tile);
  const yMin = wy;
  const yMax = wy + 0.4;
  const xMin = wx + 0.3, xMax = wx + 0.7;
  const zMin = wz + 0.3, zMax = wz + 0.7;
  // Just six faces of a small box.
  const corners = [
    [xMin, yMin, zMax], [xMin, yMax, zMax], [xMax, yMax, zMax], [xMax, yMin, zMax], // +Z
    [xMax, yMin, zMin], [xMax, yMax, zMin], [xMin, yMax, zMin], [xMin, yMin, zMin], // -Z
    [xMax, yMin, zMax], [xMax, yMax, zMax], [xMax, yMax, zMin], [xMax, yMin, zMin], // +X
    [xMin, yMin, zMin], [xMin, yMax, zMin], [xMin, yMax, zMax], [xMin, yMin, zMax], // -X
    [xMin, yMax, zMax], [xMin, yMax, zMin], [xMax, yMax, zMin], [xMax, yMax, zMax], // +Y
    [xMin, yMin, zMin], [xMin, yMin, zMax], [xMax, yMin, zMax], [xMax, yMin, zMin], // -Y
  ];
  const l = powered ? 1.0 : 0.7;
  for (let f = 0; f < 6; f++) {
    const baseIdx = pool.positions.length / 3;
    for (let k = 0; k < 4; k++) {
      const c = corners[f * 4 + k];
      pool.positions.push(c[0], c[1], c[2]);
      pool.normals.push(0, 1, 0);
      pool.colors.push(l, l, l);
    }
    pool.uvs.push(u0, v0, u0, v1, u1, v1, u1, v0);
    pool.indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
  }
}

function addButton(pool, wx, wy, wz, powered) {
  const tile = tileIndex(BLOCK.BUTTON, 1);
  const [u0, v0, u1, v1] = tileUV(tile);
  const yMin = wy + 0.3, yMax = wy + 0.55;
  const xMin = wx + 0.35, xMax = wx + 0.65;
  const zMin = wz + 0.35, zMax = wz + 0.65;
  const corners = [
    [xMin, yMin, zMax], [xMin, yMax, zMax], [xMax, yMax, zMax], [xMax, yMin, zMax],
    [xMax, yMin, zMin], [xMax, yMax, zMin], [xMin, yMax, zMin], [xMin, yMin, zMin],
    [xMax, yMin, zMax], [xMax, yMax, zMax], [xMax, yMax, zMin], [xMax, yMin, zMin],
    [xMin, yMin, zMin], [xMin, yMax, zMin], [xMin, yMax, zMax], [xMin, yMin, zMax],
    [xMin, yMax, zMax], [xMin, yMax, zMin], [xMax, yMax, zMin], [xMax, yMax, zMax],
    [xMin, yMin, zMin], [xMin, yMin, zMax], [xMax, yMin, zMax], [xMax, yMin, zMin],
  ];
  const l = powered ? 1.0 : 0.75;
  for (let f = 0; f < 6; f++) {
    const baseIdx = pool.positions.length / 3;
    for (let k = 0; k < 4; k++) {
      const c = corners[f * 4 + k];
      pool.positions.push(c[0], c[1], c[2]);
      pool.normals.push(0, 1, 0);
      pool.colors.push(l, l, l);
    }
    pool.uvs.push(u0, v0, u0, v1, u1, v1, u1, v0);
    pool.indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
  }
}
