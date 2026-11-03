import * as THREE from 'three';
import { Soldier } from './soldier.js';

const _v = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _aim = new THREE.Vector3();

const TEAM_COLORS = { alpha: 0x2f6fc0, bravo: 0xc0392b };

/**
 * AI soldier that fights for one of the two teams.
 * Uses the fully-modelled Soldier rig and shares the same damage/kill
 * contract as the player, so team deathmatch scoring is uniform.
 */
export class Bot {
  constructor({ scene, city, team, name, position, skill = 0.6, onDeath = null }) {
    this.scene = scene;
    this.city = city;
    this.team = team;
    this.name = name;
    this.skill = skill;
    this.onDeath = onDeath;

    this.soldier = new Soldier({ seed: Math.random() * 100, scale: 0.96 + Math.random() * 0.1 });
    this.root = this.soldier.root;
    this.root.position.copy(position);
    scene.add(this.root);
    this.root.userData.bot = this;

    // hit zones for the player's raycast
    this.soldier.head.traverse((o) => {
      if (o.isMesh) o.userData.zone = 'head';
    });

    // team identification: armbands + helmet stripe
    const bandMat = new THREE.MeshStandardMaterial({
      color: TEAM_COLORS[team],
      roughness: 0.78,
      metalness: 0.05,
      emissive: new THREE.Color(TEAM_COLORS[team]).multiplyScalar(0.22),
    });
    for (const arm of [this.soldier.armL, this.soldier.armR]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.118, 0.06, 0.128), bandMat);
      band.position.y = -0.06;
      arm.shoulder.add(band);
    }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.15), bandMat);
    stripe.position.set(0, 0.315, 0.01);
    this.soldier.head.add(stripe);

    this.maxHealth = 100;
    this.health = 100;
    this.alive = true;
    this.deadT = 0;
    this.radius = 0.42;

    this.speed = 2.5 + Math.random() * 0.4;
    this.chaseSpeed = 4.1 + Math.random() * 0.6;
    this.yaw = Math.random() * Math.PI * 2;
    this.walkPhase = Math.random() * 10;

    this.target = null;
    this.hasLOS = false;
    this.thinkTimer = Math.random() * 0.3;
    this.strafePhase = Math.random() * Math.PI * 2;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = 1 + Math.random() * 2;
    this.fireTimer = 0.5 + Math.random();
    this.roundTimer = 0;
    this.burstLeft = 0;
    this.aimTime = 0;
    this.hitFlash = 0;

    this.patrol = this._pickPatrol(position);
    this.moving = false;
    this.lastAttacker = null;
  }

  get position() {
    return this.root.position;
  }

  eye(out = _v) {
    return out.set(this.root.position.x, this.root.position.y + 1.56, this.root.position.z);
  }

  _pickPatrol(origin) {
    const pts = this.city.spawnPoints;
    for (let i = 0; i < 8; i++) {
      const p = pts[(Math.random() * pts.length) | 0];
      const d = p.distanceTo(origin);
      if (d > 14 && d < 62) return p.clone();
    }
    return origin.clone();
  }

  takeDamage(amount, { headshot = false, from = null, fx = null, point = null } = {}) {
    if (!this.alive) return;
    this.health -= amount;
    this.hitFlash = 0.18;
    if (from) {
      this.lastAttacker = from;
      // getting shot makes a bot turn and fight back
      if (!this.target || !this.target.alive) this.target = from;
      this.hasLOS = true;
    }
    if (fx && point) {
      _aim.copy(this.root.position).sub(point).normalize();
      fx.blood(point, _aim);
    }
    if (this.health <= 0) this.die(from);
  }

  die(killer) {
    if (!this.alive) return;
    this.alive = false;
    this.health = 0;
    this.deadT = 0;
    this.soldier.die();
    this.target = null;
    if (this.onDeath) this.onDeath(this, killer);
  }

  respawn(position) {
    this.root.position.copy(position);
    this.root.rotation.set(0, 0, 0);
    this.root.position.y = 0;
    this.soldier.dead = false;
    this.soldier.deathT = 0;
    this.soldier.spine.rotation.set(0, 0, 0);
    this.soldier.head.rotation.set(0, 0, 0);
    this.soldier.root.rotation.set(0, 0, 0);
    this.health = this.maxHealth;
    this.alive = true;
    this.deadT = 0;
    this.target = null;
    this.hasLOS = false;
    this.fireTimer = 0.4 + Math.random() * 0.6;
    this.burstLeft = 0;
    this.aimTime = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.patrol = this._pickPatrol(position);
    this.hitFlash = 0;
  }

  _pickTarget(targets) {
    let best = null;
    let bestScore = Infinity;
    for (const t of targets) {
      if (!t || !t.alive || t === this) continue;
      if (t.team === this.team) continue;
      const d = t.position.distanceToSquared(this.root.position);
      // wounded or recently aggressive targets get priority
      let bonus = 1;
      if (t === this.lastAttacker) bonus = 0.55;
      const s = d * bonus;
      if (s < bestScore) {
        bestScore = s;
        best = t;
      }
    }
    return best;
  }

  _faceTowards(point, dt, speed) {
    const dx = point.x - this.root.position.x;
    const dz = point.z - this.root.position.z;
    const targetYaw = Math.atan2(dx, dz);
    let diff = targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, dt * speed);
  }

  muzzleWorld(out = new THREE.Vector3()) {
    this.soldier.rifle.updateWorldMatrix(true, false);
    return out.set(0, 0.012, 0.72).applyMatrix4(this.soldier.rifle.matrixWorld);
  }

  update(dt, ctx) {
    const s = this.soldier;

    if (!this.alive) {
      s.updateDead(dt);
      this.deadT += dt;
      return;
    }

    this.hitFlash = Math.max(0, this.hitFlash - dt);

    // ---------------- perception ----------------
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.22 + Math.random() * 0.18;
      this.target = this._pickTarget(ctx.targets);
      if (this.target) {
        const dist = this.target.position.distanceTo(this.root.position);
        this.hasLOS =
          dist < 95 && this.city.hasLineOfSight(this.eye(_v), this.target.eye);
      } else {
        this.hasLOS = false;
      }
    }

    const target = this.target && this.target.alive ? this.target : null;
    let moveDir = null;
    let sprint = false;
    let aiming = false;

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = 1.1 + Math.random() * 2.2;
      this.strafeDir *= -1;
    }

    if (target) {
      const toT = _aim.copy(target.position).sub(this.root.position);
      toT.y = 0;
      const dist = toT.length();
      toT.normalize();
      this._faceTowards(target.position, dt, 7);

      if (this.hasLOS && dist < 72) {
        // ------- engage: hold a distance and strafe ----------
        aiming = true;
        this.strafePhase += dt * 1.7;
        const side = this.strafeDir * (0.55 + Math.sin(this.strafePhase) * 0.45);
        moveDir = new THREE.Vector3(-toT.z * side, 0, toT.x * side);
        if (dist > 26) moveDir.add(toT);
        else if (dist < 9) moveDir.addScaledVector(toT, -1);

        this.aimTime += dt;
        this.fireTimer -= dt;
        this.roundTimer -= dt;

        if (this.burstLeft > 0) {
          if (this.roundTimer <= 0) {
            this._fire(ctx, target, dist);
            this.burstLeft--;
            this.roundTimer = 0.1;
            if (this.burstLeft <= 0) {
              this.fireTimer = 0.55 + Math.random() * 0.75 - this.skill * 0.2;
            }
          }
        } else if (this.fireTimer <= 0 && this.aimTime > 0.28) {
          this.burstLeft = 2 + ((Math.random() * 3) | 0);
          this.roundTimer = 0;
        }
      } else {
        // ------- reposition: close the distance ----------
        moveDir = toT.clone();
        sprint = dist > 18;
        this.aimTime = 0;
        this.burstLeft = 0;
      }
    } else {
      // ------- patrol ----------
      const toPatrol = _v.copy(this.patrol).sub(this.root.position);
      toPatrol.y = 0;
      if (toPatrol.lengthSq() < 6) {
        this.patrol = this._pickPatrol(this.root.position);
      } else {
        moveDir = toPatrol.normalize();
        this._faceTowards(this.patrol, dt, 3);
      }
      this.aimTime = 0;
      this.burstLeft = 0;
    }

    // ---------------- locomotion ----------------
    this.moving = false;
    if (moveDir && moveDir.lengthSq() > 1e-5) {
      moveDir.normalize();
      const spd = sprint ? this.chaseSpeed : this.speed;
      this.root.position.addScaledVector(moveDir, spd * dt);
      this.moving = true;
    }
    this.root.position.x = THREE.MathUtils.clamp(this.root.position.x, -126, 126);
    this.root.position.z = THREE.MathUtils.clamp(this.root.position.z, -126, 126);
    this.city.resolveCollision(this.root.position, this.radius, 1.75);
    this.root.position.y = 0;

    this.walkPhase += dt * (this.moving ? (sprint ? 11 : 7) : 1);
    s.speedFactor = sprint ? 1.3 : 1;
    s.update(dt, this.moving, aiming);

    // lean into the shot while firing
    this.root.rotation.y = this.yaw;
  }

  _fire(ctx, target, dist) {
    const { fx, audio } = ctx;
    this.soldier.triggerFlash();
    const from = this.muzzleWorld(_muzzle);
    audio.enemyShot(dist);

    // accuracy drops with range, rises with skill and when standing still
    let chance = 0.66 - Math.min(0.4, dist * 0.007) + this.skill * 0.2;
    if (this.moving) chance -= 0.12;
    chance = THREE.MathUtils.clamp(chance, 0.08, 0.82);

    if (Math.random() > chance) {
      // miss: dust kicks up near the target
      const near = target.eye.clone().add(
        new THREE.Vector3((Math.random() - 0.5) * 2.6, (Math.random() - 0.4) * 1.4, (Math.random() - 0.5) * 2.6)
      );
      fx.tracer(from, near, 0xffd08a, 0.06);
      return;
    }

    fx.tracer(from, target.eye, 0xffd08a, 0.06);
    const dmg = 9 + Math.random() * 8;
    target.takeDamage(dmg, { from: this, headshot: false, fx });
  }

  dispose() {
    this.scene.remove(this.root);
    this.soldier.dispose();
  }
}
