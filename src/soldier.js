import * as THREE from 'three';
import { camoTexture } from './textures.js';

/**
 * A detailed, modular tactical soldier built from primitives.
 * Hierarchy: root -> hips -> spine -> chest -> head / arms, and hips -> legs.
 * Includes helmet + NVG mount, plate carrier with pouches, kneepads, boots,
 * gloves, backpack, radio antenna and a service rifle.
 */

const MAT = {};
function mat(key, opts) {
  if (!MAT[key]) MAT[key] = new THREE.MeshStandardMaterial(opts);
  return MAT[key];
}

function buildMaterials() {
  const multicam = camoTexture({ seed: 21, base: '#585a46' });
  multicam.repeat.set(2, 2);
  const multicamDark = camoTexture({ seed: 44, base: '#3d4033' });
  multicamDark.repeat.set(2, 2);

  mat('fatigues', {
    map: multicam,
    roughness: 0.92,
    metalness: 0.02,
    color: 0xbfbfb8,
  });
  mat('gear', {
    map: multicamDark,
    roughness: 0.85,
    metalness: 0.05,
    color: 0x9aa093,
  });
  mat('vest', {
    map: multicamDark,
    roughness: 0.8,
    metalness: 0.06,
    color: 0x8d9386,
  });
  mat('skin', { color: 0x8d6b52, roughness: 0.72, metalness: 0.0 });
  mat('helmet', { color: 0x4a4f42, roughness: 0.72, metalness: 0.28 });
  mat('polymer', { color: 0x2b2c29, roughness: 0.55, metalness: 0.32 });
  mat('steel', { color: 0x3a3c3b, roughness: 0.4, metalness: 0.85 });
  mat('boot', { color: 0x2a2723, roughness: 0.85, metalness: 0.05 });
  mat('glove', { color: 0x33322d, roughness: 0.8 });
  mat('lens', {
    color: 0x2a4a55,
    roughness: 0.08,
    metalness: 0.95,
    emissive: 0x0a2430,
    emissiveIntensity: 0.55,
  });
  mat('nvg', { color: 0x1f2320, roughness: 0.6, metalness: 0.35 });
  mat('patch', { color: 0x6a5c3a, roughness: 0.9 });
  mat('eye', { color: 0x14100d, roughness: 0.35 });
  mat('strap', { color: 0x35382f, roughness: 0.9 });
  return MAT;
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rt, rb, h, material, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function sphere(r, material, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), material);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Enemy service rifle (AK-pattern) — small but readable at distance. */
function buildEnemyRifle(M) {
  const g = new THREE.Group();
  g.add(box(0.055, 0.075, 0.42, M.steel, 0, 0, 0)); // receiver
  g.add(box(0.028, 0.028, 0.5, M.steel, 0, 0.012, 0.42)); // barrel
  g.add(cyl(0.017, 0.017, 0.09, M.steel, 8)).position.set(0, 0.012, 0.66); // muzzle brake
  g.add(box(0.05, 0.09, 0.14, M.polymer, 0, -0.075, 0.03)); // magazine
  g.add(box(0.045, 0.075, 0.13, M.polymer, 0, -0.01, -0.22)); // grip/stock junction
  g.add(box(0.05, 0.055, 0.3, M.polymer, 0, -0.025, -0.36)); // stock
  g.add(box(0.04, 0.09, 0.055, M.polymer, 0, -0.06, -0.06)); // pistol grip
  // optic
  g.add(box(0.045, 0.05, 0.16, M.nvg, 0, 0.075, 0.06));
  g.add(cyl(0.026, 0.026, 0.03, M.lens, 10)).position.set(0, 0.078, 0.14);
  return g;
}

export class Soldier {
  /**
   * @param {object} opts
   * @param {number} opts.scale height scale
   * @param {number} opts.seed variant seed
   */
  constructor(opts = {}) {
    const M = buildMaterials();
    const seed = opts.seed ?? 0;
    const scale = opts.scale ?? 1;

    this.root = new THREE.Group();
    this.root.scale.setScalar(scale);
    this.phase = Math.random() * Math.PI * 2;
    this.speedFactor = 1;
    this.dead = false;
    this.deathT = 0;
    this.hitParts = [];
    this.gunFlash = null;

    // ---- hips ----
    const hips = new THREE.Group();
    hips.position.y = 0.94;
    this.hips = hips;
    this.root.add(hips);

    const pelvis = box(0.34, 0.2, 0.23, M.fatigues, 0, 0.02, 0);
    hips.add(pelvis);
    // drop-leg holster + pouch
    hips.add(box(0.11, 0.2, 0.11, M.polymer, 0.2, -0.14, 0.02));
    hips.add(box(0.1, 0.13, 0.1, M.gear, -0.2, -0.1, 0.04));

    // ---- spine / chest ----
    const spine = new THREE.Group();
    spine.position.y = 0.12;
    hips.add(spine);
    this.spine = spine;

    const torso = box(0.4, 0.44, 0.24, M.fatigues, 0, 0.26, 0);
    spine.add(torso);

    // plate carrier
    const vest = box(0.44, 0.4, 0.29, M.vest, 0, 0.27, 0.005);
    spine.add(vest);
    // shoulder straps
    spine.add(box(0.11, 0.1, 0.3, M.gear, -0.13, 0.46, 0));
    spine.add(box(0.11, 0.1, 0.3, M.gear, 0.13, 0.46, 0));
    // front pouches
    for (let i = 0; i < 3; i++) {
      spine.add(box(0.1, 0.13, 0.07, M.gear, -0.13 + i * 0.13, 0.17, 0.17));
    }
    // admin pouch + radio
    spine.add(box(0.13, 0.08, 0.05, M.gear, 0.11, 0.34, 0.18));
    spine.add(box(0.08, 0.14, 0.06, M.nvg, -0.15, 0.4, 0.16));
    // antenna
    const ant = cyl(0.005, 0.008, 0.4, M.nvg, 6);
    ant.position.set(-0.19, 0.66, 0.12);
    ant.rotation.z = 0.14;
    spine.add(ant);
    // unit patch
    spine.add(box(0.07, 0.09, 0.01, M.patch, 0.16, 0.32, 0.15));

    // backpack
    const pack = box(0.3, 0.34, 0.18, M.gear, 0, 0.28, -0.21);
    spine.add(pack);
    spine.add(box(0.26, 0.1, 0.06, M.gear, 0, 0.12, -0.24));

    // belt kit
    spine.add(box(0.36, 0.07, 0.26, M.gear, 0, 0.03, 0));
    spine.add(box(0.1, 0.12, 0.08, M.gear, 0.16, -0.03, 0.1));
    spine.add(box(0.09, 0.14, 0.07, M.gear, -0.14, -0.03, 0.11));

    // ---- head ----
    const neck = new THREE.Group();
    neck.position.y = 0.5;
    spine.add(neck);
    this.head = neck;
    neck.add(cyl(0.06, 0.07, 0.08, M.skin, 10)).position.y = 0.03;

    const skull = sphere(0.115, M.skin, 1, 1.1, 1.02);
    skull.position.y = 0.16;
    neck.add(skull);
    // face shading / jaw
    neck.add(box(0.13, 0.09, 0.1, M.skin, 0, 0.11, 0.055));
    // eyes
    neck.add(sphere(0.017, M.eye).translateX(-0.042).translateY(0.17).translateZ(0.098));
    neck.add(sphere(0.017, M.eye).translateX(0.042).translateY(0.17).translateZ(0.098));

    // helmet: dome + rim + rails + NVG mount
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.145, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
      M.helmet
    );
    helmet.position.y = 0.185;
    helmet.scale.set(1.02, 1.06, 1.04);
    helmet.castShadow = true;
    neck.add(helmet);
    // helmet rim
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.138, 0.014, 8, 20), M.helmet);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.196;
    neck.add(rim);
    // side rails
    neck.add(box(0.02, 0.05, 0.13, M.nvg, -0.13, 0.2, 0.02));
    neck.add(box(0.02, 0.05, 0.13, M.nvg, 0.13, 0.2, 0.02));
    // NVG shroud + mount + goggles
    neck.add(box(0.07, 0.04, 0.05, M.nvg, 0, 0.27, 0.11));
    const nvg = box(0.1, 0.07, 0.08, M.nvg, 0, 0.26, 0.16);
    neck.add(nvg);
    const nvgLens = cyl(0.024, 0.024, 0.03, M.lens, 10);
    nvgLens.rotation.x = Math.PI / 2;
    nvgLens.position.set(-0.028, 0.26, 0.205);
    neck.add(nvgLens);
    const nvgLens2 = nvgLens.clone();
    nvgLens2.position.x = 0.028;
    neck.add(nvgLens2);
    // chin strap
    neck.add(box(0.19, 0.02, 0.03, M.strap, 0, 0.09, 0.08));

    // ---- arms ----
    const mkArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.235, 0.4, 0);
      spine.add(shoulder);
      // deltoid
      shoulder.add(sphere(0.09, M.fatigues));
      // upper arm
      const upper = box(0.11, 0.26, 0.12, M.fatigues, 0, -0.15, 0);
      shoulder.add(upper);
      // elbow pad
      shoulder.add(box(0.1, 0.07, 0.11, M.gear, 0, -0.28, 0.01));
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      // forearm + glove
      elbow.add(box(0.095, 0.24, 0.1, M.fatigues, 0, -0.12, 0));
      elbow.add(box(0.085, 0.09, 0.11, M.glove, 0, -0.26, 0.01));
      const hand = box(0.075, 0.09, 0.13, M.glove, 0, -0.32, 0.02);
      elbow.add(hand);
      return { shoulder, elbow, hand };
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    // ---- rifle held in both hands ----
    const rifle = buildEnemyRifle(M);
    rifle.position.set(0.06, 0.5, 0.42);
    rifle.rotation.set(0, 0, 0);
    this.rifle = rifle;
    spine.add(rifle);
    // muzzle flash sprite (hidden until firing)
    const flashGeo = new THREE.SphereGeometry(0.075, 8, 6);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffd08a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.gunFlash = new THREE.Mesh(flashGeo, flashMat);
    this.gunFlash.position.set(0, 0.012, 0.72);
    this.gunFlash.scale.set(0.6, 0.6, 1.8);
    rifle.add(this.gunFlash);

    // pose: right hand on grip, left hand supports handguard
    this.armR.shoulder.rotation.set(-0.95, 0, -0.32);
    this.armR.elbow.rotation.x = -0.85;
    this.armL.shoulder.rotation.set(-1.05, 0, 0.5);
    this.armL.elbow.rotation.x = -1.15;

    // ---- legs ----
    const mkLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.105, -0.02, 0);
      hips.add(hip);
      hip.add(box(0.145, 0.34, 0.16, M.fatigues, 0, -0.16, 0));
      // thigh rig / kneepad
      hip.add(box(0.13, 0.1, 0.14, M.gear, 0, -0.34, 0.02));
      const knee = new THREE.Group();
      knee.position.y = -0.36;
      hip.add(knee);
      knee.add(box(0.125, 0.32, 0.14, M.fatigues, 0, -0.15, 0));
      knee.add(box(0.115, 0.09, 0.12, M.gear, 0, -0.02, 0.01)); // kneepad
      // boot
      knee.add(box(0.135, 0.1, 0.16, M.boot, 0, -0.32, 0));
      knee.add(box(0.14, 0.08, 0.17, M.boot, 0, -0.36, 0.04));
      knee.add(box(0.135, 0.06, 0.1, M.boot, 0, -0.39, 0.12));
      return { hip, knee };
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    // hitboxes cover the whole body so raycasts always connect
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.userData.soldier = this;
        this.hitParts.push(o);
      }
    });

    this.root.userData.soldier = this;
  }

  /** 0..1 blend for walking; lean scales with speed. */
  update(dt, moving, aiming = false) {
    if (this.dead) return;
    this.phase += dt * (moving ? 9 * this.speedFactor : 2.2);
    const swing = moving ? Math.sin(this.phase) * 0.62 : Math.sin(this.phase) * 0.07;
    const counter = moving ? Math.sin(this.phase + Math.PI) * 0.62 : Math.sin(this.phase + Math.PI) * 0.07;

    this.legL.hip.rotation.x = swing;
    this.legR.hip.rotation.x = counter;
    this.legL.knee.rotation.x = Math.max(0, -swing) * 1.1 - 0.06;
    this.legR.knee.rotation.x = Math.max(0, -counter) * 1.1 - 0.06;

    // torso bob + counter-rotation
    this.spine.position.y = 0.12 + Math.abs(Math.sin(this.phase)) * (moving ? 0.028 : 0.008);
    this.spine.rotation.y = moving ? Math.sin(this.phase) * 0.11 : Math.sin(this.phase * 0.6) * 0.03;
    this.hips.rotation.z = moving ? Math.sin(this.phase) * 0.035 : 0;

    // head scans around when idle
    const scan = moving ? 0 : Math.sin(this.phase * 0.35) * 0.25;
    this.head.rotation.y = scan;

    const targetShoulder = aiming ? -0.72 : -0.95;
    this.armR.shoulder.rotation.x += (targetShoulder - this.armR.shoulder.rotation.x) * Math.min(1, dt * 8);

    if (this.gunFlash) {
      const m = this.gunFlash.material;
      if (m.opacity > 0) m.opacity = Math.max(0, m.opacity - dt * 14);
    }
  }

  triggerFlash() {
    if (this.gunFlash) this.gunFlash.material.opacity = 1;
  }

  /** Collapse with a fall + limb slump. Stays on the ground. */
  die() {
    this.dead = true;
    this.deathT = 0;
    this.dieDir = Math.random() < 0.5 ? 1 : -1;
  }

  updateDead(dt) {
    this.deathT = Math.min(1, this.deathT + dt * 1.6);
    const t = this.deathT;
    const ease = 1 - Math.pow(1 - t, 3);
    // pitch backwards and drop
    this.root.rotation.x = ease * (Math.PI / 2) * 0.96 * this.dieDir;
    this.root.position.y = -ease * 0.72;
    this.spine.rotation.z = ease * 0.25 * this.dieDir;
    this.head.rotation.z = ease * 0.4 * this.dieDir;
    this.armL.shoulder.rotation.z = 0.5 + ease * 1.1;
    this.armR.shoulder.rotation.z = -0.32 - ease * 0.9;
    this.legL.hip.rotation.x = -0.3 - ease * 0.5;
    this.legR.hip.rotation.x = 0.3 + ease * 0.4;
    this.legL.knee.rotation.x = 0.4 + ease * 0.7;
    this.legR.knee.rotation.x = 0.3 + ease * 0.6;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose?.();
      }
    });
  }
}
