// First-person controller. Owns the camera and handles input + physics.

import * as THREE from 'three';
import { moveAndCollide, EYE_HEIGHT, inWater } from './physics.js';

export const MODE = {
  CREATIVE: 'creative',
  SURVIVAL: 'survival',
  EDUCATION: 'education',
  MAGIC: 'magic',
};

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.position = new THREE.Vector3(8, 40, 8);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.mode = MODE.CREATIVE;
    this.hp = 20;
    this.maxHp = 20;
    this.hunger = 20;
    this.maxHunger = 20;
    this.lastJumpTime = 0;
    this.invincibleUntil = 0;
    this._sinceFood = 0;
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === MODE.CREATIVE || mode === MODE.MAGIC || mode === MODE.EDUCATION) {
      this.flying = mode === MODE.CREATIVE || mode === MODE.MAGIC;
      this.hp = this.maxHp;
      this.hunger = this.maxHunger;
    } else {
      this.flying = false;
    }
  }

  applyMouseLook(dx, dy, sensitivity = 0.0025) {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    const lim = Math.PI / 2 - 0.001;
    if (this.pitch > lim) this.pitch = lim;
    if (this.pitch < -lim) this.pitch = -lim;
  }

  forwardVec() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  rightVec() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  // Eye position used for raycasting.
  eyePosition() {
    return new THREE.Vector3(this.position.x, this.position.y + EYE_HEIGHT, this.position.z);
  }

  // Look direction.
  lookDir() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(
      -Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cp,
    );
  }

  toggleFly() {
    if (this.mode === MODE.SURVIVAL) return;
    this.flying = !this.flying;
    if (this.flying) this.velocity.y = 0;
  }

  update(world, dt, input) {
    const speed = this.flying ? (input.sprint ? 16 : 9) : (input.sprint ? 6 : 4.3);
    const wantX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const wantZ = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const fwd = this.forwardVec();
    const rgt = this.rightVec();
    let mx = fwd.x * wantZ + rgt.x * wantX;
    let mz = fwd.z * wantZ + rgt.z * wantX;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }

    if (this.flying) {
      this.velocity.x = mx * speed;
      this.velocity.z = mz * speed;
      let vy = 0;
      if (input.jump) vy += speed;
      if (input.crouch) vy -= speed;
      this.velocity.y = vy;
    } else {
      // Smoothly accelerate for ground motion.
      const targetVx = mx * speed;
      const targetVz = mz * speed;
      const accel = this.onGround ? 12 : 4;
      this.velocity.x += (targetVx - this.velocity.x) * Math.min(1, accel * dt);
      this.velocity.z += (targetVz - this.velocity.z) * Math.min(1, accel * dt);

      // Gravity.
      const gravity = inWater(world, this.position) ? -8 : -28;
      this.velocity.y += gravity * dt;
      // Cap fall speed.
      if (this.velocity.y < -50) this.velocity.y = -50;

      // Jump.
      if (input.jump && this.onGround) {
        this.velocity.y = 9;
        this.onGround = false;
        const now = performance.now();
        // Double-tap jump triggers fly toggle in creative.
        if (this.mode === MODE.CREATIVE && now - this.lastJumpTime < 280) {
          this.toggleFly();
        }
        this.lastJumpTime = now;
      }
      // Swimming.
      if (inWater(world, this.position) && input.jump) {
        this.velocity.y = 4;
      }
    }

    const delta = new THREE.Vector3(
      this.velocity.x * dt,
      this.velocity.y * dt,
      this.velocity.z * dt,
    );
    const res = moveAndCollide(world, this.position, delta);
    this.onGround = res.onGround;
    if (res.onGround && this.velocity.y < 0) this.velocity.y = 0;

    // Sync camera.
    this.camera.position.copy(this.eyePosition());
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // Survival ticking.
    if (this.mode === MODE.SURVIVAL) {
      this._sinceFood += dt;
      if (this._sinceFood > 6) {
        this._sinceFood = 0;
        if (len > 0 && this.hunger > 0) this.hunger = Math.max(0, this.hunger - 1);
      }
      if (this.hunger <= 0 && this.hp > 0) this.hp = Math.max(0, this.hp - dt * 0.5);
      // Drown.
      const headBlock = world.getBlock(
        Math.floor(this.position.x),
        Math.floor(this.position.y + EYE_HEIGHT),
        Math.floor(this.position.z),
      );
      if (headBlock === 8) this.hp = Math.max(0, this.hp - dt * 0.7);
      // Fall damage.
      if (res.onGround && this.velocity.y === 0 && delta.y < -0.2 && Math.abs(delta.y / dt) > 14) {
        const fallSpeed = Math.abs(delta.y / dt);
        const dmg = Math.max(0, fallSpeed - 14) * 0.4;
        this.hp = Math.max(0, this.hp - dmg);
      }
    }
  }

  takeDamage(amount) {
    if (this.mode !== MODE.SURVIVAL) return;
    if (performance.now() < this.invincibleUntil) return;
    this.hp = Math.max(0, this.hp - amount);
    this.invincibleUntil = performance.now() + 600;
  }

  isDead() {
    return this.mode === MODE.SURVIVAL && this.hp <= 0;
  }

  respawn(world) {
    this.position.set(8, 40, 8);
    this.velocity.set(0, 0, 0);
    this.hp = this.maxHp;
    this.hunger = this.maxHunger;
    this.invincibleUntil = performance.now() + 1500;
    // Find a safe surface.
    for (let y = 60; y >= 1; y--) {
      const id = world.getBlock(8, y, 8);
      if (id !== 0 && id !== 8) {
        this.position.set(8.5, y + 1, 8.5);
        return;
      }
    }
  }
}
