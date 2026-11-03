import * as THREE from 'three';
import { softDotTexture } from './textures.js';

/**
 * Pooled combat effects: bullet tracers, impact sparks, dust puffs,
 * blood spray and muzzle smoke. Everything is preallocated and recycled
 * so combat never triggers garbage collection spikes.
 */
export class Fx {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.dotTex = softDotTexture({ color: '#ffffff' });

    // ---- tracers -------------------------------------------------
    this.tracers = [];
    for (let i = 0; i < 40; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0xffd9a0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.tracers.push({ line, life: 0, max: 0.1 });
    }
    this.tracerIdx = 0;

    // ---- particles (sparks + blood + dust) -----------------------
    this.particles = [];
    for (let i = 0; i < 90; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.dotTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.scale.setScalar(0.12);
      scene.add(sprite);
      this.particles.push({
        sprite,
        life: 0,
        max: 1,
        vel: new THREE.Vector3(),
        gravity: 0,
        size: 0.12,
        fade: 1,
      });
    }
    this.pIdx = 0;
    this._v = new THREE.Vector3();
  }

  /* ---------------------------------------------------------- tracers */
  tracer(from, to, color = 0xffd9a0, life = 0.085) {
    const t = this.tracers[this.tracerIdx];
    this.tracerIdx = (this.tracerIdx + 1) % this.tracers.length;
    const pos = t.line.geometry.attributes.position;
    pos.array[0] = from.x;
    pos.array[1] = from.y;
    pos.array[2] = from.z;
    pos.array[3] = to.x;
    pos.array[4] = to.y;
    pos.array[5] = to.z;
    pos.needsUpdate = true;
    t.line.geometry.computeBoundingSphere();
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.95;
    t.line.visible = true;
    t.life = life;
    t.max = life;
  }

  /* --------------------------------------------------------- emitter */
  _spawn(point, vel, { color = 0xffffff, size = 0.12, life = 0.5, gravity = 0, fade = 1, additive = true } = {}) {
    const p = this.particles[this.pIdx];
    this.pIdx = (this.pIdx + 1) % this.particles.length;
    p.sprite.position.copy(point);
    p.sprite.material.color.setHex(color);
    p.sprite.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.sprite.material.opacity = 1;
    p.sprite.visible = true;
    p.sprite.scale.setScalar(size);
    p.vel.copy(vel);
    p.life = life;
    p.max = life;
    p.gravity = gravity;
    p.size = size;
    p.fade = fade;
    return p;
  }

  /** Bullet striking concrete/metal. */
  impact(point, normal, { color = 0xffc98a } = {}) {
    if (this.city) this.city.addBulletHole(point, normal);
    const n = normal || this._v.set(0, 1, 0);
    for (let i = 0; i < 4; i++) {
      const v = new THREE.Vector3(
        n.x * 1.8 + (Math.random() - 0.5) * 2.4,
        n.y * 1.4 + Math.random() * 1.9,
        n.z * 1.8 + (Math.random() - 0.5) * 2.4
      );
      this._spawn(point, v, {
        color,
        size: 0.05 + Math.random() * 0.05,
        life: 0.18 + Math.random() * 0.16,
        gravity: 7,
      });
    }
    // grey dust cloud
    for (let i = 0; i < 2; i++) {
      const v = new THREE.Vector3(
        n.x * 0.4 + (Math.random() - 0.5) * 0.6,
        Math.random() * 0.5,
        n.z * 0.4 + (Math.random() - 0.5) * 0.6
      );
      this._spawn(point, v, { color: 0x9c9a90, size: 0.22, life: 0.55, gravity: 0.4, additive: false });
    }
  }

  /** Bullet striking a soldier. */
  blood(point, dir) {
    for (let i = 0; i < 5; i++) {
      const v = new THREE.Vector3(
        dir.x * 1.4 + (Math.random() - 0.5) * 1.8,
        Math.random() * 1.4,
        dir.z * 1.4 + (Math.random() - 0.5) * 1.8
      );
      this._spawn(point, v, {
        color: i % 3 === 0 ? 0xd44a3a : 0x8e1f18,
        size: 0.06 + Math.random() * 0.06,
        life: 0.3 + Math.random() * 0.2,
        gravity: 8,
      });
    }
    this._spawn(point, new THREE.Vector3(0, 0.25, 0), {
      color: 0x7d1a14,
      size: 0.26,
      life: 0.3,
      gravity: 0.2,
      additive: false,
    });
  }

  /** Soft puff from a gun muzzle. */
  muzzleSmoke(point, dir) {
    this._spawn(point, new THREE.Vector3(dir.x * 0.5, 0.35, dir.z * 0.5), {
      color: 0xb9b6ac,
      size: 0.18,
      life: 0.35,
      gravity: -0.2,
      additive: false,
    });
  }

  update(dt) {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.line.visible = false;
        t.line.material.opacity = 0;
      } else {
        t.line.material.opacity = 0.95 * (t.life / t.max);
      }
    }

    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      const k = p.life / p.max;
      p.sprite.material.opacity = p.fade * Math.pow(k, 0.7);
    }
  }
}
