import * as THREE from 'three';
import { camoTexture, flashTexture } from './textures.js';

/**
 * Realistic-ish firearm view models. Barrels point down -Z (camera forward).
 * Each gun is built from primitives with correct proportions: receiver, rail,
 * handguard, barrel, muzzle device, magazine, grip, stock, optic.
 */

export const WEAPONS = {
  carbine: {
    id: 'carbine',
    name: 'M4A1 CARBINE',
    short: 'M4A1',
    auto: true,
    damage: 26,
    headshot: 2.6,
    rpm: 780,
    magSize: 30,
    reserve: 210,
    spread: 0.0075,
    adsSpread: 0.0016,
    recoil: 0.011,
    recoilYaw: 0.005,
    kick: 0.035,
    adsFov: 46,
    hipFov: 75,
    reloadTime: 1.85,
    range: 220,
    optic: 'reddot',
    zoom: 1.6,
  },
  dmr: {
    id: 'dmr',
    name: 'SR-25 DMR',
    short: 'SR-25',
    auto: false,
    damage: 62,
    headshot: 3.0,
    rpm: 320,
    magSize: 20,
    reserve: 120,
    spread: 0.006,
    adsSpread: 0.0006,
    recoil: 0.026,
    recoilYaw: 0.008,
    kick: 0.06,
    adsFov: 24,
    hipFov: 75,
    reloadTime: 2.3,
    range: 400,
    optic: 'scope',
    zoom: 3.2,
  },
};

const M = {
  finish: new THREE.MeshStandardMaterial({ color: 0x26282a, roughness: 0.42, metalness: 0.86 }),
  blackPoly: new THREE.MeshStandardMaterial({ color: 0x1b1c1d, roughness: 0.68, metalness: 0.18 }),
  tanPoly: new THREE.MeshStandardMaterial({ color: 0x4b463a, roughness: 0.72, metalness: 0.12 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x53585c, roughness: 0.3, metalness: 0.95 }),
  opticBody: new THREE.MeshStandardMaterial({ color: 0x1e2122, roughness: 0.5, metalness: 0.7 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x9fd7e8,
    roughness: 0.05,
    metalness: 0,
    transmission: 0.92,
    thickness: 0.02,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  }),
  tubeInner: new THREE.MeshStandardMaterial({
    color: 0x07090a,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  }),
  reticle: new THREE.MeshBasicMaterial({
    color: 0x0a0a0a,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
  }),
  dot: new THREE.MeshBasicMaterial({
    color: 0xff2b1c,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
  sleeve: new THREE.MeshStandardMaterial({
    map: (() => {
      const t = camoTexture({ seed: 23, base: '#5b5f4a' });
      t.repeat.set(2, 2);
      return t;
    })(),
    roughness: 0.94,
    color: 0xb6b6ae,
  }),
  glove: new THREE.MeshStandardMaterial({ color: 0x2a2b27, roughness: 0.82 }),
  skin: new THREE.MeshStandardMaterial({ color: 0x8f6a4f, roughness: 0.7 }),
};

function box(w, h, d, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}
function cyl(r, h, material, seg = 14, openEnded = false) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg, 1, openEnded), material);
}
function cylR(r, h, material, seg = 14) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), material);
}

/** Picatinny rail with visible teeth. */
function rail(length, zStart, y, material) {
  const g = new THREE.Group();
  g.add(box(0.03, 0.008, length, material, 0, 0, zStart - length / 2));
  const teeth = Math.floor(length / 0.014);
  for (let i = 0; i < teeth; i++) {
    g.add(box(0.032, 0.006, 0.006, material, 0, 0.006, zStart - 0.007 - i * 0.014));
  }
  g.position.y = y;
  return g;
}

/** Gloved hands + camo forearms gripping the weapon. */
function buildHands({ rearZ = 0.10, frontZ = -0.28, gripY = -0.055 } = {}) {
  const g = new THREE.Group();

  // right hand on pistol grip
  const rHand = box(0.062, 0.085, 0.075, M.glove, 0.006, gripY, rearZ);
  rHand.rotation.x = -0.15;
  g.add(rHand);
  // fingers wrapping forward
  for (let i = 0; i < 4; i++) {
    g.add(box(0.055, 0.016, 0.022, M.glove, 0.006, gripY + 0.028 - i * 0.02, rearZ + 0.036));
  }
  g.add(box(0.02, 0.03, 0.05, M.glove, -0.028, gripY - 0.005, rearZ + 0.02)); // thumb
  // right forearm going back-right toward camera
  const rArm = box(0.075, 0.075, 0.3, M.sleeve, 0.06, gripY - 0.05, rearZ + 0.19);
  rArm.rotation.x = 0.16;
  rArm.rotation.y = -0.17;
  g.add(rArm);

  // left hand cupping the handguard
  const lHand = box(0.07, 0.075, 0.1, M.glove, -0.005, gripY + 0.024, frontZ);
  g.add(lHand);
  for (let i = 0; i < 4; i++) {
    g.add(box(0.06, 0.016, 0.02, M.glove, -0.008, gripY + 0.048, frontZ + 0.036 - i * 0.022));
  }
  g.add(box(0.022, 0.028, 0.05, M.glove, 0.03, gripY + 0.048, frontZ + 0.02)); // thumb over top
  const lArm = box(0.075, 0.075, 0.34, M.sleeve, -0.1, gripY - 0.075, frontZ + 0.2);
  lArm.rotation.x = 0.3;
  lArm.rotation.y = 0.42;
  g.add(lArm);

  return g;
}

/** Tube sight used for both the red dot and the magnified optic. */
function buildRedDot() {
  const g = new THREE.Group();
  // mount
  g.add(box(0.045, 0.026, 0.07, M.opticBody, 0, 0.012, 0));
  // body tube, open ended so you can look through it
  const body = cyl(0.028, 0.11, M.opticBody, 20, true);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.058, -0.01);
  g.add(body);
  const inner = cyl(0.0255, 0.108, M.tubeInner, 20, true);
  inner.rotation.x = Math.PI / 2;
  inner.position.copy(body.position);
  g.add(inner);
  // front and rear bezels
  for (const z of [0.045, -0.065]) {
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.005, 8, 20), M.opticBody);
    b.position.set(0, 0.058, z);
    g.add(b);
  }
  // glass
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.025, 20), M.glass);
  glass.position.set(0, 0.058, -0.062);
  g.add(glass);
  // red dot + faint reticle
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0028, 10), M.dot);
  dot.position.set(0, 0.058, -0.058);
  g.add(dot);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.0042, 0.0055, 16), M.dot);
  halo.position.set(0, 0.058, -0.0575);
  halo.material = M.dot.clone();
  halo.material.opacity = 0.4;
  g.add(halo);
  // windage/elevation turrets
  g.add(cylR(0.008, 0.016, M.opticBody, 10)).position.set(0, 0.09, -0.01);
  g.add(cylR(0.008, 0.016, M.opticBody, 10)).position.set(0.032, 0.058, -0.01);
  // backup iron sight flipped down
  g.add(box(0.006, 0.03, 0.006, M.opticBody, 0, 0.03, -0.075));
  return g;
}

/** Big variable-power scope: 30mm tube, objective bell, turrets, reticle. */
function buildScope() {
  const g = new THREE.Group();
  const tubeY = 0.085;
  // rail mount + rings
  g.add(box(0.042, 0.03, 0.2, M.opticBody, 0, 0.012, 0.02));
  for (const z of [0.085, -0.055]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 8, 18), M.opticBody);
    ring.position.set(0, tubeY, z);
    g.add(ring);
    g.add(box(0.014, 0.045, 0.014, M.opticBody, 0, tubeY - 0.028, z));
  }
  // main tube (open so the player looks down it)
  const tube = cyl(0.021, 0.24, M.opticBody, 22, true);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, tubeY, 0.01);
  g.add(tube);
  const inner = cyl(0.0192, 0.238, M.tubeInner, 22, true);
  inner.rotation.x = Math.PI / 2;
  inner.position.copy(tube.position);
  g.add(inner);
  // objective bell (front)
  const bell = cylR(0.031, 0.06, M.opticBody, 22, true);
  bell.rotation.x = Math.PI / 2;
  bell.position.set(0, tubeY, -0.15);
  g.add(bell);
  const bellInner = cylR(0.0285, 0.058, M.tubeInner, 22, true);
  bellInner.rotation.x = Math.PI / 2;
  bellInner.position.copy(bell.position);
  g.add(bellInner);
  // sunshade lip
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.004, 8, 22), M.opticBody);
  lip.position.set(0, tubeY, -0.181);
  g.add(lip);
  // ocular (rear)
  const ocular = cylR(0.028, 0.05, M.opticBody, 22, true);
  ocular.rotation.x = Math.PI / 2;
  ocular.position.set(0, tubeY, 0.145);
  g.add(ocular);
  const ocularInner = cylR(0.0255, 0.048, M.tubeInner, 22, true);
  ocularInner.rotation.x = Math.PI / 2;
  ocularInner.position.copy(ocular.position);
  g.add(ocularInner);
  // fast-focus eyepiece ring
  const eyeRing = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.0055, 8, 22), M.opticBody);
  eyeRing.position.set(0, tubeY, 0.168);
  g.add(eyeRing);
  // front objective glass (faint tint so the view reads as a lens)
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0275, 24), M.glass);
  lens.position.set(0, tubeY, -0.176);
  g.add(lens);
  const rearLens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 24), M.glass);
  rearLens.position.set(0, tubeY, 0.166);
  g.add(rearLens);

  // mil-dot reticle etched near the objective
  const rGroup = new THREE.Group();
  rGroup.position.set(0, tubeY, -0.172);
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.0012, 0.03), M.reticle);
  rGroup.add(cross);
  const crossH = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.0012), M.reticle);
  rGroup.add(crossH);
  for (let i = 1; i <= 3; i++) {
    for (const s of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.0011, 0.0011), M.reticle);
      d.position.set(0, s * i * 0.006, 0);
      rGroup.add(d);
    }
  }
  // thick outer posts
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.PlaneGeometry(0.0016, 0.018), M.reticle);
    post.position.set(0, s * 0.021, 0);
    rGroup.add(post);
    const postH = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.0016), M.reticle);
    postH.position.set(s * 0.021, 0, 0);
    rGroup.add(postH);
  }
  g.add(rGroup);

  // turrets
  g.add(cylR(0.011, 0.022, M.opticBody, 12)).position.set(0, tubeY + 0.03, 0.01);
  g.add(cylR(0.011, 0.022, M.opticBody, 12)).position.set(0.026, tubeY, 0.01).rotateZ(Math.PI / 2);
  const parallax = cylR(0.014, 0.018, M.opticBody, 12);
  parallax.rotation.z = Math.PI / 2;
  parallax.position.set(-0.026, tubeY, 0.01);
  g.add(parallax);
  // magnification ring
  const magRing = new THREE.Mesh(new THREE.TorusGeometry(0.023, 0.006, 8, 18), M.blackPoly);
  magRing.position.set(0, tubeY, 0.115);
  g.add(magRing);
  return g;
}

function buildCarbine() {
  const g = new THREE.Group();
  // lower + upper receiver
  g.add(box(0.05, 0.062, 0.2, M.finish, 0, 0, 0.02));
  g.add(box(0.046, 0.03, 0.2, M.finish, 0, 0.042, 0.02)); // upper
  g.add(rail(0.22, 0.12, 0.062, M.finish));

  // heat shield / handguard with vent slots
  g.add(box(0.052, 0.052, 0.24, M.blackPoly, 0, 0.012, -0.2));
  for (let i = 0; i < 5; i++) {
    g.add(box(0.054, 0.012, 0.014, M.finish, 0, 0.03, -0.12 - i * 0.038));
  }
  g.add(rail(0.24, -0.32, 0.045, M.finish));

  // barrel + flash hider
  const barrel = cylR(0.0105, 0.26, M.steel, 14);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.012, -0.43);
  g.add(barrel);
  const hider = cylR(0.0155, 0.06, M.finish, 10);
  hider.rotation.x = Math.PI / 2;
  hider.position.set(0, 0.012, -0.575);
  g.add(hider);
  for (let i = 0; i < 3; i++) {
    g.add(box(0.017, 0.004, 0.008, M.steel, 0, 0.026, -0.565 - i * 0.016));
  }

  // gas block + front sight base
  g.add(box(0.03, 0.028, 0.03, M.finish, 0, 0.028, -0.33));

  // magazine (curved STANAG look)
  const mag = new THREE.Group();
  mag.position.set(0, -0.055, -0.01);
  mag.rotation.x = 0.12;
  const m1 = box(0.036, 0.1, 0.062, M.blackPoly, 0, -0.05, 0);
  mag.add(m1);
  const m2 = box(0.034, 0.07, 0.6 * 0.06, M.blackPoly, 0, -0.13, 0.012, 0.16);
  mag.add(m2);
  for (let i = 0; i < 3; i++) mag.add(box(0.038, 0.006, 0.058, M.finish, 0, -0.02 - i * 0.03, 0.004));
  g.add(mag);
  g.magazine = mag;

  // pistol grip
  const grip = box(0.036, 0.1, 0.05, M.blackPoly, 0.002, -0.062, 0.075);
  grip.rotation.x = -0.32;
  g.add(grip);
  // trigger + guard
  g.add(box(0.008, 0.022, 0.008, M.steel, 0, -0.036, 0.045));
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.023, 0.004, 6, 12, Math.PI), M.finish);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  guard.position.set(0, -0.03, 0.055);
  g.add(guard);
  // bolt catch / ejection port / charging handle
  g.add(box(0.006, 0.016, 0.03, M.steel, 0.026, 0.03, -0.02));
  g.add(box(0.02, 0.008, 0.026, M.finish, 0, 0.058, 0.11));

  // buffer tube + collapsible stock
  const buffer = cylR(0.017, 0.14, M.finish, 12);
  buffer.rotation.x = Math.PI / 2;
  buffer.position.set(0, 0.012, 0.19);
  g.add(buffer);
  g.add(box(0.044, 0.075, 0.14, M.blackPoly, 0, -0.004, 0.27));
  g.add(box(0.048, 0.02, 0.1, M.blackPoly, 0, 0.038, 0.27)); // cheek rest
  g.add(box(0.05, 0.09, 0.018, M.blackPoly, 0, -0.005, 0.345)); // buttpad
  // sling loop
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0025, 6, 10), M.finish)).position.set(0, -0.04, 0.34);

  // optic + magnifier
  const dot = buildRedDot();
  dot.position.set(0, 0.06, 0.01);
  g.add(dot);
  g.opticGroup = dot;
  // 3x magnifier folded to the side
  const magg = new THREE.Group();
  magg.add(cylR(0.019, 0.06, M.opticBody, 14, true)).rotation.x = Math.PI / 2;
  magg.position.set(0.06, 0.075, 0.09);
  magg.rotation.y = 0.5;
  g.add(magg);
  // pressure switch / laser box on the handguard
  g.add(box(0.03, 0.026, 0.05, M.blackPoly, 0.036, 0.012, -0.19));
  g.add(cylR(0.006, 0.012, M.steel, 8)).position.set(0.036, 0.012, -0.215).rotateX(Math.PI / 2);

  g.add(buildHands({ rearZ: 0.075, frontZ: -0.19, gripY: -0.05 }));
  return g;
}

function buildDMR() {
  const g = new THREE.Group();
  // receivers
  g.add(box(0.052, 0.07, 0.26, M.finish, 0, 0, 0.03));
  g.add(box(0.05, 0.032, 0.26, M.finish, 0, 0.048, 0.03));
  g.add(rail(0.28, 0.16, 0.07, M.finish));

  // free-float handguard with M-LOK slots
  g.add(box(0.056, 0.058, 0.36, M.tanPoly, 0, 0.014, -0.26));
  for (let i = 0; i < 6; i++) {
    g.add(box(0.058, 0.014, 0.02, M.finish, 0, 0.012, -0.13 - i * 0.05));
  }
  g.add(rail(0.34, -0.44, 0.048, M.finish));

  // heavy barrel + muzzle brake
  const barrel = cylR(0.0125, 0.42, M.steel, 16);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.014, -0.62);
  g.add(barrel);
  const brake = cylR(0.019, 0.085, M.finish, 12);
  brake.rotation.x = Math.PI / 2;
  brake.position.set(0, 0.014, -0.855);
  g.add(brake);
  for (let i = 0; i < 4; i++) {
    g.add(box(0.021, 0.005, 0.012, M.steel, 0, 0.03, -0.83 - i * 0.018));
  }

  // magazine (SR-25 pattern, straighter + longer)
  const mag = new THREE.Group();
  mag.position.set(0, -0.06, 0.0);
  mag.rotation.x = 0.08;
  mag.add(box(0.04, 0.15, 0.075, M.blackPoly, 0, -0.075, 0));
  for (let i = 0; i < 3; i++) mag.add(box(0.042, 0.006, 0.07, M.finish, 0, -0.02 - i * 0.045, 0));
  g.add(mag);
  g.magazine = mag;

  // grip + trigger
  const grip = box(0.038, 0.105, 0.052, M.blackPoly, 0.002, -0.068, 0.075);
  grip.rotation.x = -0.3;
  g.add(grip);
  g.add(box(0.008, 0.022, 0.008, M.steel, 0, -0.04, 0.045));
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.004, 6, 12, Math.PI), M.finish);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  guard.position.set(0, -0.032, 0.06);
  g.add(guard);

  // precision stock with cheek riser
  const buffer = cylR(0.018, 0.16, M.finish, 12);
  buffer.rotation.x = Math.PI / 2;
  buffer.position.set(0, 0.014, 0.2);
  g.add(buffer);
  g.add(box(0.05, 0.1, 0.2, M.tanPoly, 0, -0.01, 0.3));
  g.add(box(0.054, 0.026, 0.13, M.blackPoly, 0, 0.05, 0.3)); // cheek riser
  g.add(box(0.056, 0.1, 0.02, M.blackPoly, 0, -0.008, 0.41));
  g.add(box(0.03, 0.034, 0.08, M.blackPoly, 0, -0.05, 0.24)); // bag rider

  // big scope
  const scope = buildScope();
  scope.position.set(0, 0.05, 0.02);
  g.add(scope);
  g.opticGroup = scope;

  // bipod folded under the handguard
  for (const s of [-1, 1]) {
    const leg = box(0.012, 0.012, 0.16, M.finish, s * 0.02, -0.03, -0.4);
    leg.rotation.y = s * 0.18;
    g.add(leg);
  }
  // side saddle / cheek pad detail
  g.add(box(0.02, 0.05, 0.1, M.tanPoly, 0.032, 0.02, 0.06));

  g.add(buildHands({ rearZ: 0.08, frontZ: -0.25, gripY: -0.055 }));
  return g;
}

/**
 * Manages the first-person weapon: hip/ADS pose blending, recoil, sway,
 * muzzle flash and reload animation.
 */
export class WeaponView {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.position.set(0, 0, 0);
    camera.add(this.group);

    this.models = {
      carbine: buildCarbine(),
      dmr: buildDMR(),
    };
    this.muzzleLocal = {
      carbine: new THREE.Vector3(0, 0.012, -0.62),
      dmr: new THREE.Vector3(0, 0.014, -0.9),
    };

    // hip + ADS anchors per weapon (relative to camera)
    this.poses = {
      carbine: {
        hip: { pos: new THREE.Vector3(0.135, -0.145, -0.32), rot: new THREE.Euler(0.02, -0.1, 0.03) },
        ads: { pos: new THREE.Vector3(0.0, -0.123, -0.26), rot: new THREE.Euler(0, 0, 0) },
      },
      dmr: {
        hip: { pos: new THREE.Vector3(0.15, -0.155, -0.35), rot: new THREE.Euler(0.02, -0.12, 0.04) },
        // ocular sits right in front of the eye; optic axis on screen centre
        ads: { pos: new THREE.Vector3(0.0, -0.14, -0.06), rot: new THREE.Euler(0, 0, 0) },
      },
    };

    for (const key of Object.keys(this.models)) {
      const m = this.models[key];
      m.visible = false;
      m.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = false;
          o.frustumCulled = false;
          if (o.material && o.material.transparent === undefined) o.material.transparent = false;
        }
      });
      this.group.add(m);
    }

    // muzzle flash quad + light
    const flashTex = flashTexture();
    this.flashMat = new THREE.SpriteMaterial({
      map: flashTex,
      color: 0xffe0a0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.flash = new THREE.Sprite(this.flashMat);
    this.flash.scale.setScalar(0.34);
    this.flash.visible = false;
    this.group.add(this.flash);

    this.ejectMat = new THREE.MeshStandardMaterial({ color: 0xc9a35a, metalness: 0.9, roughness: 0.35 });

    this.current = 'carbine';
    this.ads = 0; // 0 hip -> 1 fully aimed
    this.aiming = false;
    this.recoil = 0;
    this.recoilRoll = 0;
    this.kickBack = 0;
    this.reloadT = -1;
    this.reloadDur = 2;
    this.sway = new THREE.Vector2();
    this.bobPhase = 0;
    this.flashT = 0;
    this.shells = [];
    this._v = new THREE.Vector3();
    this.applyWeapon('carbine');
  }

  applyWeapon(id) {
    this.current = id;
    for (const key of Object.keys(this.models)) this.models[key].visible = key === id;
    this.reloadT = -1;
  }

  /** World position of the muzzle (for tracers + audio distance). */
  muzzleWorld(out = new THREE.Vector3()) {
    const local = this.muzzleLocal[this.current].clone();
    const model = this.models[this.current];
    model.updateWorldMatrix(true, false);
    out.copy(local).applyMatrix4(model.matrixWorld);
    return out;
  }

  fire(strength = 1) {
    this.flashT = 0.055;
    this.flashMat.opacity = 1;
    this.flash.visible = true;
    this.flash.position.copy(this.muzzleLocal[this.current]);
    this.flash.scale.setScalar(0.24 + Math.random() * 0.18);
    this.flash.material.rotation = Math.random() * Math.PI;
    this.recoil = Math.min(1.4, this.recoil + strength);
    this.recoilRoll += (Math.random() - 0.5) * 0.02 * strength;
    this.kickBack = Math.min(0.09, this.kickBack + 0.028 * strength);
    this.spawnShell();
  }

  /** Brass flying out of the ejection port. */
  spawnShell() {
    const geo = new THREE.CylinderGeometry(0.004, 0.004, 0.014, 6);
    const mesh = new THREE.Mesh(geo, this.ejectMat);
    mesh.position.set(0.03, 0.045, 0.02);
    this.group.add(mesh);
    this.shells.push({
      mesh,
      vel: new THREE.Vector3(0.9 + Math.random() * 0.4, 0.7 + Math.random() * 0.4, 0.45),
      spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12),
      life: 0.8,
    });
  }

  startReload(duration) {
    this.reloadT = 0;
    this.reloadDur = duration;
  }

  update(dt, { aiming, moving, lookDelta, ads }) {
    this.aiming = aiming;
    const target = aiming ? 1 : 0;
    const speed = aiming ? 9 : 12;
    this.ads += (target - this.ads) * Math.min(1, dt * speed);
    if (Math.abs(this.ads - target) < 0.004) this.ads = target;

    const model = this.models[this.current];
    const pose = this.poses[this.current];
    const a = this.ads * this.ads * (3 - 2 * this.ads); // smoothstep

    // sway: passive breathing + drag from mouse movement, reduced while aiming
    const swayScale = 1 - a * 0.82;
    const targetSwayX = THREE.MathUtils.clamp(-lookDelta.x * 0.00055, -0.03, 0.03);
    const targetSwayY = THREE.MathUtils.clamp(lookDelta.y * 0.00055, -0.03, 0.03);
    this.sway.x += (targetSwayX - this.sway.x) * Math.min(1, dt * 6);
    this.sway.y += (targetSwayY - this.sway.y) * Math.min(1, dt * 6);

    this.bobPhase += dt * (moving ? 9 : 1.6);
    const bobAmt = moving ? 1 : 0.22;
    const bobX = Math.sin(this.bobPhase) * 0.008 * bobAmt * (1 - a * 0.85);
    const bobY = Math.abs(Math.cos(this.bobPhase)) * 0.01 * bobAmt * (1 - a * 0.85);

    // recoil springs back to zero
    this.recoil *= Math.pow(0.0016, dt);
    this.kickBack *= Math.pow(0.0015, dt);
    this.recoilRoll *= Math.pow(0.004, dt);

    // reload dips the weapon out of frame
    let reloadDip = 0;
    let reloadRoll = 0;
    if (this.reloadT >= 0) {
      this.reloadT += dt;
      const p = Math.min(1, this.reloadT / this.reloadDur);
      const arc = Math.sin(p * Math.PI);
      reloadDip = arc * 0.16;
      reloadRoll = arc * 0.5;
      if (p >= 1) this.reloadT = -1;
    }

    const px = THREE.MathUtils.lerp(pose.hip.pos.x, pose.ads.pos.x, a) + bobX + this.sway.x * swayScale;
    const py = THREE.MathUtils.lerp(pose.hip.pos.y, pose.ads.pos.y, a) + bobY + this.sway.y * swayScale - reloadDip;
    const pz = THREE.MathUtils.lerp(pose.hip.pos.z, pose.ads.pos.z, a) + this.kickBack * (1 - a * 0.55);

    model.position.set(px, py, pz);
    model.rotation.set(
      THREE.MathUtils.lerp(pose.hip.rot.x, pose.ads.rot.x, a) + this.recoil * 0.05 - reloadDip * 0.9,
      THREE.MathUtils.lerp(pose.hip.rot.y, pose.ads.rot.y, a) + this.sway.x * 0.5 * swayScale,
      THREE.MathUtils.lerp(pose.hip.rot.z, pose.ads.rot.z, a) + this.recoilRoll + reloadRoll
    );

    // breathing wobble at high zoom for realism
    model.position.x += Math.sin(this.bobPhase * 0.7) * 0.0022 * a;
    model.position.y += Math.cos(this.bobPhase * 0.9) * 0.0022 * a;

    // muzzle flash decay
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flashMat.opacity = Math.max(0, this.flashT / 0.055);
      if (this.flashT <= 0) this.flash.visible = false;
    }

    // shells
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      s.vel.y -= 5.2 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      if (s.life <= 0) {
        this.group.remove(s.mesh);
        s.mesh.geometry.dispose();
        this.shells.splice(i, 1);
      }
    }
  }
}
