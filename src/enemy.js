import * as THREE from 'three';
import { Soldier } from './soldier.js';

const STATE = {
  IDLE: 'idle',
  PATROL: 'patrol',
  CHASE: 'chase',
  ATTACK: 'attack',
  DEAD: 'dead',
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Enemy {
  constructor(scene, city, position, { health = 100, skill = 0.5 } = {}) {
    this.city = city;
    this.soldier = new Soldier({ seed: Math.random() * 100, scale: 0.97 + Math.random() * 0.08 });
    this.root = this.soldier.root;
    this.root.position.copy(position);
    scene.add(this.root);

    // zone tagging for headshots
    this.soldier.head.traverse((o) => {
      if (o.isMesh) o.userData.zone = 'head';
    });

    this.maxHealth = health;
    this.health = health;
    this.state = STATE.PATROL;
    this.stateTime = 0;
    this.skill = skill;
    this.speed = 2.1 + Math.random() * 0.5;
    this.chaseSpeed = 3.6 + Math.random() * 0.9;
    this.radius = 0.42;

    this.patrolTarget = this._pickPatrolPoint(position);
    this.repathTimer = 0;
    this.fireCooldown = 1 + Math.random() * 1.2;
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.aimTimer = 0;
    this.staggerTimer = 0;
    this.deadTimer = 0;
    this.remove = false;
    this.alerted = false;
    this.yaw = Math.random() * Math.PI * 2;
    this.velocity = new THREE.Vector3();
    this.walkPhase = Math.random() * 10;
    this.onKill = null;
    this.hasLOS = false;
    this.losTimer = Math.random() * 0.25;
    this.moving = false;
  }

  _pickPatrolPoint(origin) {
    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 18;
    return new THREE.Vector3(
      THREE.MathUtils.clamp(origin.x + Math.cos(a) * r, -120, 120),
      0,
      THREE.MathUtils.clamp(origin.z + Math.sin(a) * r, -120, 120)
    );
  }

  get alive() {
    return !this.soldier.dead;
  }

  /** Raycast targets for the player's bullets. */
  get hitMeshes() {
    return this.soldier.hitParts;
  }

  takeDamage(amount, isHead, hitPoint, normal) {
    if (!this.alive) return 0;
    this.health -= amount;
    this.alerted = true;
    this.staggerTimer = isHead ? 0.32 : 0.12;
    if (this.state !== STATE.ATTACK) this.state = STATE.CHASE;
    if (this.health <= 0) {
      this.soldier.die();
      this.state = STATE.DEAD;
      this.deadTimer = 0;
      // settle to the ground where it fell
      this.soldier.root.rotation.x = 0;
      const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.deathSlide = forward.multiplyScalar(0.5);
      return 1;
    }
    return 0;
  }

  update(dt, ctx) {
    const { player, camera, audio, hud } = ctx;
    const s = this.soldier;

    if (this.state === STATE.DEAD) {
      s.updateDead(dt);
      this.deadTimer += dt;
      // slide slightly along the fall direction
      if (this.deathSlide && this.deadTimer < 0.5) {
        this.root.position.addScaledVector(this.deathSlide, dt * 1.6);
      }
      if (this.deadTimer > 14) this.remove = true;
      return;
    }

    this.stateTime += dt;
    const toPlayer = _v.copy(player.position).sub(this.root.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();
    const dir = toPlayer.clone().normalize();

    // ---- perception ----
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.2 + Math.random() * 0.15;
      this.hasLOS = distance < 95 && this.city.hasLineOfSight(this.root.position, player.position);
    }
    if (this.hasLOS && distance < 90) this.alerted = true;

    // ---- state machine ----
    if (this.staggerTimer > 0) {
      this.staggerTimer -= dt;
      s.update(dt, false, false);
      return;
    }

    let moveDir = null;
    let sprint = false;

    if (this.alerted) {
      const preferred = 13 + Math.random() * 6;
      if (this.hasLOS && distance < 55) {
        this.state = STATE.ATTACK;
      } else if (this.state === STATE.ATTACK && this.hasLOS) {
        this.state = STATE.ATTACK;
      } else {
        this.state = STATE.CHASE;
      }

      if (this.state === STATE.ATTACK) {
        // hold position, strafe a little, shoot in bursts
        this.aimTimer += dt;
        this.fireCooldown -= dt;
        const strafe = Math.sin(this.stateTime * 1.1) * 0.5;
        moveDir = new THREE.Vector3(-dir.z * strafe, 0, dir.x * strafe);
        if (distance > preferred + 8) moveDir.add(dir);
        if (distance < preferred - 6) moveDir.add(dir.clone().negate());

        this._faceTowards(dir, dt, 5.5);

        if (this.fireCooldown <= 0 && this.aimTimer > 0.35 && this.hasLOS) {
          if (this.burstLeft <= 0) this.burstLeft = 2 + ((Math.random() * 3) | 0);
          this.burstTimer -= dt;
          if (this.burstTimer <= 0) {
            this._shoot(ctx, distance);
            this.burstLeft--;
            this.burstTimer = 0.11;
            if (this.burstLeft <= 0) {
              this.fireCooldown = 0.9 + Math.random() * 1.4 - this.skill * 0.3;
            }
          }
        }
      } else {
        moveDir = dir.clone();
        sprint = distance > 16;
        this._faceTowards(dir, dt, 6);
      }
    } else {
      // patrol between random points
      this.state = STATE.PATROL;
      const toTarget = this.patrolTarget.clone().sub(this.root.position);
      toTarget.y = 0;
      if (toTarget.lengthSq() < 4) {
        this.patrolTarget = this._pickPatrolPoint(this.root.position);
      } else {
        moveDir = toTarget.normalize();
      }
      this._faceTowards(moveDir || dir, dt, 2.4);
    }

    this.moving = false;
    if (moveDir && moveDir.lengthSq() > 0.0001) {
      moveDir.normalize();
      const spd = (sprint ? this.chaseSpeed : this.speed) * (this.state === STATE.ATTACK ? 0.6 : 1);
      const step = spd * dt;
      this.root.position.addScaledVector(moveDir, step);
      this.moving = step > 0.001;
      // keep them inside the arena and out of buildings
      this.root.position.x = THREE.MathUtils.clamp(this.root.position.x, -128, 128);
      this.root.position.z = THREE.MathUtils.clamp(this.root.position.z, -128, 128);
      this.city.resolveCollision(this.root.position, this.radius, 1.7);
    }

    this.walkPhase += dt * (this.moving ? (sprint ? 12 : 7.5) : 1);
    s.speedFactor = sprint ? 1.35 : 1;
    s.update(dt, this.moving, this.state === STATE.ATTACK);

    // keep feet on the ground
    this.root.position.y = 0;
    this.root.rotation.y = this.yaw;
  }

  _faceTowards(dir, dt, speed) {
    const targetYaw = Math.atan2(dir.x, dir.z);
    let diff = targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, dt * speed);
  }

  _shoot(ctx, distance) {
    const { player, camera, audio, hud, city } = ctx;
    this.soldier.triggerFlash();
    audio.enemyShot(distance);

    // accuracy falls off with range and improves with skill
    const base = 0.72 - Math.min(0.42, distance * 0.0075) + this.skill * 0.16;
    const chance = THREE.MathUtils.clamp(base, 0.12, 0.86);
    if (Math.random() > chance) {
      // near miss: impact dust next to the player
      const near = player.position.clone().add(
        new THREE.Vector3((Math.random() - 0.5) * 2.4, 0.9 + Math.random(), (Math.random() - 0.5) * 2.4)
      );
      hud.tracer(this.muzzleWorld(), near, 0xffd9a0);
      return;
    }
    const dmg = (7 + Math.random() * 7) * (distance < 20 ? 1.15 : 1);
    hud.tracer(this.muzzleWorld(), player.position.clone().add(new THREE.Vector3(0, 1.35, 0)), 0xffd9a0);
    player.takeDamage(dmg, this.root.position);
  }

  muzzleWorld() {
    const out = new THREE.Vector3();
    this.soldier.rifle.updateWorldMatrix(true, false);
    out.set(0, 0.012, 0.72).applyMatrix4(this.soldier.rifle.matrixWorld);
    return out;
  }

  /** Called when a stealth kill or cleanup is needed. */
  dispose(scene) {
    scene.remove(this.root);
    this.soldier.dispose();
  }
}

export class EnemyManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.enemies = [];
    this.wave = 0;
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.waveActive = false;
    this.kills = 0;
    this.onWaveStart = null;
    this.onWaveClear = null;
  }

  startWave(wave = this.wave + 1) {
    this.wave = wave;
    this.toSpawn = Math.min(11, 3 + wave);
    this.spawnTimer = 0.6;
    this.waveActive = true;
    if (this.onWaveStart) this.onWaveStart(wave, this.toSpawn);
  }

  spawnOne(playerPos) {
    const pts = this.city.spawnPoints;
    let best = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const p = pts[(Math.random() * pts.length) | 0];
      const d = p.distanceTo(playerPos);
      if (d > 32 && d < 105) {
        best = p;
        break;
      }
      if (!best || d > best.distanceTo(playerPos)) best = best || p;
    }
    if (!best) best = new THREE.Vector3(30, 0, 30);
    const hp = 100 + this.wave * 6;
    const skill = Math.min(1, 0.35 + this.wave * 0.07);
    const e = new Enemy(this.scene, this.city, best, { health: hp, skill });
    this.enemies.push(e);
    return e;
  }

  update(dt, ctx) {
    // wave flow
    if (this.waveActive) {
      this.spawnTimer -= dt;
      if (this.toSpawn > 0 && this.spawnTimer <= 0) {
        if (this.enemies.length < 9) {
          this.spawnOne(ctx.player.position);
          this.toSpawn--;
          this.spawnTimer = 0.9 + Math.random() * 1.1;
        }
      }
      if (this.toSpawn === 0 && this.enemies.length === 0) {
        this.waveActive = false;
        if (this.onWaveClear) this.onWaveClear(this.wave);
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, ctx);
      if (e.remove) {
        e.dispose(this.scene);
        this.enemies.splice(i, 1);
      }
    }
  }

  /** Remove every enemy (used on restart). */
  clear() {
    for (const e of this.enemies) e.dispose(this.scene);
    this.enemies.length = 0;
    this.wave = 0;
    this.toSpawn = 0;
    this.waveActive = false;
    this.kills = 0;
  }

  get aliveCount() {
    return this.enemies.filter((e) => e.alive).length;
  }
}

export { STATE };
