// Simple mobs:
// - Zombie: hostile, spawns at night in survival, chases the player.
// - Villager: peaceful, found in starting villages, can be talked to.

import * as THREE from 'three';
import { isSolid } from '../engine/blocks.js';

class Mob {
  constructor(world, x, y, z) {
    this.world = world;
    this.position = new THREE.Vector3(x, y, z);
    this.velocity = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.targetYaw = this.yaw;
    this.alive = true;
    this.wanderCooldown = 0;
  }

  applyPhysics(dt) {
    this.velocity.y -= 28 * dt;
    if (this.velocity.y < -40) this.velocity.y = -40;

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
    const movedX = tryAxis('x', this.velocity.x * dt);
    const movedZ = tryAxis('z', this.velocity.z * dt);
    if ((!movedX || !movedZ) && this.velocity.y < 0.1) {
      const ahead = new THREE.Vector3(-Math.sin(this.targetYaw), 0, -Math.cos(this.targetYaw));
      const fx = Math.floor(this.position.x + ahead.x * 0.6);
      const fz = Math.floor(this.position.z + ahead.z * 0.6);
      const fy = Math.floor(this.position.y);
      if (isSolid(this.world.getBlock(fx, fy, fz)) &&
          !isSolid(this.world.getBlock(fx, fy + 1, fz)) &&
          !isSolid(this.world.getBlock(fx, fy + 2, fz))) {
        this.velocity.y = 7.5;
      }
    }
  }
}

export class Zombie extends Mob {
  constructor(world, x, y, z) {
    super(world, x, y, z);
    this.hp = 10;
    this.attackCooldown = 0;
    this.didAttack = false;
    this.kind = 'zombie';
    this.group = this.buildMesh();
    this.group.position.copy(this.position);
  }

  buildMesh() {
    const g = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: 0x68a87a });
    const cloth = new THREE.MeshLambertMaterial({ color: 0x4a5a8c });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.3), cloth);
    body.position.y = 0.95; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), skin);
    head.position.y = 1.65; g.add(head);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.02), eyeMat);
    eL.position.set(-0.1, 1.7, 0.23); g.add(eL);
    const eR = eL.clone(); eR.position.set(0.1, 1.7, 0.23); g.add(eR);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), skin);
    armL.position.set(-0.36, 1.05, 0.18); g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.36; g.add(armR);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), cloth);
    legL.position.set(-0.13, 0.35, 0); g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.13; g.add(legR);
    return g;
  }

  update(dt, playerPos) {
    if (!this.alive) return;
    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.position);
    const dist = toPlayer.length();
    const move = new THREE.Vector3();

    if (dist < 12) {
      this.targetYaw = Math.atan2(-toPlayer.x, -toPlayer.z);
      move.set(-Math.sin(this.targetYaw), 0, -Math.cos(this.targetYaw)).multiplyScalar(2.0);
    } else {
      this.wanderCooldown -= dt;
      if (this.wanderCooldown <= 0) {
        this.wanderCooldown = 1 + Math.random() * 3;
        this.targetYaw = Math.random() * Math.PI * 2;
      }
      move.set(-Math.sin(this.targetYaw), 0, -Math.cos(this.targetYaw)).multiplyScalar(1.0);
    }

    this.yaw += (this.targetYaw - this.yaw) * Math.min(1, dt * 4);
    this.velocity.x = move.x;
    this.velocity.z = move.z;
    this.applyPhysics(dt);

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.didAttack = dist < 1.4 && this.attackCooldown === 0;
    if (this.didAttack) this.attackCooldown = 1.0;

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

const VILLAGER_LINES = [
  'Привет! Добро пожаловать в нашу деревню.',
  'Говорят, в горах есть редкий золотой блок.',
  'Ставь блоки правой кнопкой, ломай — левой.',
  'В магическом измерении растут кристаллы — найдёшь обсидиан, построишь портал.',
  'Сундуки очень удобные: храни в них всё, что найдёшь.',
  'Будь осторожен ночью — зомби не дремлют!',
  'Кирка ускоряет добычу камня, топор — дерева, лопата — земли.',
];

export class Villager extends Mob {
  constructor(world, x, y, z, name = '\u0416\u0438\u0442\u0435\u043b\u044c') {
    super(world, x, y, z);
    this.hp = 20;
    this.kind = 'villager';
    this.name = name;
    this.lineIndex = Math.floor(Math.random() * VILLAGER_LINES.length);
    this.homeX = x;
    this.homeZ = z;
    this.group = this.buildMesh();
    this.group.position.copy(this.position);
  }

  buildMesh() {
    const g = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a880 });
    const robe = new THREE.MeshLambertMaterial({ color: 0x884a2c });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.95, 0.32), robe);
    body.position.y = 0.95; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
    head.position.y = 1.7; g.add(head);
    // Big nose.
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.25, 0.25), skin);
    nose.position.set(0, 1.62, 0.25); g.add(nose);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const eL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), eyeMat);
    eL.position.set(-0.12, 1.78, 0.26); g.add(eL);
    const eR = eL.clone(); eR.position.set(0.12, 1.78, 0.26); g.add(eR);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), robe);
    armL.position.set(-0.37, 1.05, 0); g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.37; g.add(armR);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.22), robe);
    legL.position.set(-0.13, 0.35, 0); g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.13; g.add(legR);
    return g;
  }

  update(dt) {
    if (!this.alive) return;
    // Wander near home.
    this.wanderCooldown -= dt;
    if (this.wanderCooldown <= 0) {
      this.wanderCooldown = 2 + Math.random() * 4;
      const dx = this.homeX - this.position.x;
      const dz = this.homeZ - this.position.z;
      const home = Math.hypot(dx, dz);
      if (home > 6) {
        this.targetYaw = Math.atan2(-dx, -dz);
      } else {
        this.targetYaw = Math.random() * Math.PI * 2;
      }
    }
    this.yaw += (this.targetYaw - this.yaw) * Math.min(1, dt * 3);
    const speed = 0.6;
    this.velocity.x = -Math.sin(this.targetYaw) * speed;
    this.velocity.z = -Math.cos(this.targetYaw) * speed;
    this.applyPhysics(dt);
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw + Math.PI;
  }

  greet() {
    const line = VILLAGER_LINES[this.lineIndex];
    this.lineIndex = (this.lineIndex + 1) % VILLAGER_LINES.length;
    return `${this.name}: ${line}`;
  }

  damage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.alive = false;
      this.group.visible = false;
    }
  }
}
