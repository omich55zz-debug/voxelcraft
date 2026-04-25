// Very simple mob: a "zombie" that wanders and chases the player when close.
// Visual is a stylized voxel humanoid (head + body), no skeletal animation.

import * as THREE from 'three';
import { isSolid } from '../engine/blocks.js';

export class Zombie {
  constructor(world, x, y, z) {
    this.world = world;
    this.position = new THREE.Vector3(x, y, z);
    this.velocity = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.targetYaw = this.yaw;
    this.hp = 10;
    this.attackCooldown = 0;
    this.wanderCooldown = 0;
    this.alive = true;
    this.group = this.buildMesh();
    this.group.position.copy(this.position);
  }

  buildMesh() {
    const g = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: 0x68a87a });
    const cloth = new THREE.MeshLambertMaterial({ color: 0x4a5a8c });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.3), cloth);
    body.position.y = 0.95;
    g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), skin);
    head.position.y = 1.65;
    g.add(head);
    // Eyes.
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.02), eyeMat);
    eL.position.set(-0.1, 1.7, 0.23);
    g.add(eL);
    const eR = eL.clone();
    eR.position.set(0.1, 1.7, 0.23);
    g.add(eR);
    // Arms.
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), skin);
    armL.position.set(-0.36, 1.05, 0.18);
    g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.36;
    g.add(armR);
    // Legs.
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), cloth);
    legL.position.set(-0.13, 0.35, 0);
    g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.13;
    g.add(legR);
    return g;
  }

  update(dt, playerPos) {
    if (!this.alive) return;
    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.position);
    const dist = toPlayer.length();
    let move = new THREE.Vector3();

    if (dist < 12) {
      // Chase.
      this.targetYaw = Math.atan2(-toPlayer.x, -toPlayer.z);
      move.set(-Math.sin(this.targetYaw), 0, -Math.cos(this.targetYaw)).multiplyScalar(2.0);
    } else {
      // Wander.
      this.wanderCooldown -= dt;
      if (this.wanderCooldown <= 0) {
        this.wanderCooldown = 1 + Math.random() * 3;
        this.targetYaw = Math.random() * Math.PI * 2;
      }
      move.set(-Math.sin(this.targetYaw), 0, -Math.cos(this.targetYaw)).multiplyScalar(1.0);
    }

    this.yaw += (this.targetYaw - this.yaw) * Math.min(1, dt * 4);

    // Move with very simple collision: don't enter solid blocks; if there's
    // a block in front and a clear block above, jump.
    this.velocity.x = move.x;
    this.velocity.z = move.z;
    this.velocity.y -= 28 * dt;
    if (this.velocity.y < -40) this.velocity.y = -40;

    const tryAxis = (axis, d) => {
      const next = this.position.clone();
      next[axis] += d;
      if (isSolid(this.world.getBlock(Math.floor(next.x), Math.floor(next.y + 0.4), Math.floor(next.z))) ||
          isSolid(this.world.getBlock(Math.floor(next.x), Math.floor(next.y + 1.5), Math.floor(next.z)))) {
        return false;
      }
      this.position[axis] = next[axis];
      return true;
    };

    // Vertical: gravity + ground.
    const newY = this.position.y + this.velocity.y * dt;
    const feetX = Math.floor(this.position.x);
    const feetZ = Math.floor(this.position.z);
    if (this.velocity.y < 0) {
      const groundY = Math.floor(newY);
      if (isSolid(this.world.getBlock(feetX, groundY, feetZ))) {
        this.position.y = groundY + 1;
        this.velocity.y = 0;
      } else {
        this.position.y = newY;
      }
    } else {
      this.position.y = newY;
    }

    let movedX = tryAxis('x', this.velocity.x * dt);
    let movedZ = tryAxis('z', this.velocity.z * dt);
    if (!movedX || !movedZ) {
      // Try jump.
      const ahead = new THREE.Vector3(-Math.sin(this.targetYaw), 0, -Math.cos(this.targetYaw));
      const fx = Math.floor(this.position.x + ahead.x * 0.6);
      const fz = Math.floor(this.position.z + ahead.z * 0.6);
      const fy = Math.floor(this.position.y);
      if (isSolid(this.world.getBlock(fx, fy, fz)) &&
          !isSolid(this.world.getBlock(fx, fy + 1, fz)) &&
          !isSolid(this.world.getBlock(fx, fy + 2, fz))) {
        if (this.velocity.y < 0.1) this.velocity.y = 8;
      }
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (dist < 1.4 && this.attackCooldown === 0) {
      this.attackCooldown = 1.0;
      this.lastAttackTimestamp = performance.now();
      this.didAttack = true;
    } else {
      this.didAttack = false;
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw + Math.PI;
  }

  damage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.alive = false;
      this.group.visible = false;
    }
  }
}
