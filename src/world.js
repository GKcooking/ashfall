import * as THREE from 'three';
import {
  rng,
  facadeTexture,
  asphaltTexture,
  concreteTexture,
  dirtTexture,
  softDotTexture,
  bulletHoleTexture,
} from './textures.js';

const CITY_RADIUS = 132;

function boxGeo(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);

    this.colliders = []; // {minX,maxX,minZ,maxZ,minY,maxY}
    this.shootables = []; // meshes bullets can hit
    this.firePoints = [];
    this.reusable = [];
    this.rand = rng(1337);

    this._buildSky();
    this._buildGround();
    this._buildBlocks();
    this._buildProps();
    this._buildAsh();
    this._buildSmoke();
    this._buildLights();
  }

  /* ---------------------------------------------------------------- sky */
  _buildSky() {
    const geo = new THREE.SphereGeometry(500, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x3b4145) },
        mid: { value: new THREE.Color(0x8a8b84) },
        bot: { value: new THREE.Color(0xb0aa9c) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
        varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y;
          vec3 c = mix(bot, mid, smoothstep(-0.05, 0.18, h));
          c = mix(c, top, smoothstep(0.15, 0.75, h));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
  }

  /* ------------------------------------------------------------- ground */
  _buildGround() {
    const asphalt = asphaltTexture();
    asphalt.repeat.set(38, 38);
    const groundMat = new THREE.MeshStandardMaterial({
      map: asphalt,
      roughness: 0.96,
      metalness: 0.02,
      color: 0x9c9c98,
    });
    const g = new THREE.Mesh(new THREE.PlaneGeometry(560, 560, 1, 1), groundMat);
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    g.name = 'ground';
    this.root.add(g);
    this.shootables.push(g);
    this.ground = g;

    // scattered dirt/gravel patches
    const dirt = dirtTexture();
    dirt.repeat.set(6, 6);
    const dirtMat = new THREE.MeshStandardMaterial({
      map: dirt,
      roughness: 1,
      color: 0x8d8477,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const r = this.rand;
    for (let i = 0; i < 26; i++) {
      const size = 8 + r() * 26;
      const patch = new THREE.Mesh(new THREE.CircleGeometry(size, 12), dirtMat);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set((r() - 0.5) * 240, 0.012, (r() - 0.5) * 240);
      patch.receiveShadow = true;
      this.root.add(patch);
    }
  }

  /* -------------------------------------------------------- city blocks */
  _buildBlocks() {
    const con = concreteTexture();
    con.repeat.set(3, 3);
    const sideMat = new THREE.MeshStandardMaterial({
      map: con,
      roughness: 0.94,
      metalness: 0.02,
      color: 0xa5a29a,
    });
    this.sideMat = sideMat;

    const facades = [];
    for (let i = 0; i < 7; i++) {
      const tex = facadeTexture({ seed: 5 + i * 9, tint: ['#8b8880', '#7c7a72', '#93897c', '#6f7273', '#8a7f70', '#7a7d76', '#8d8478'][i] });
      tex.repeat.set(3, 4);
      facades.push(
        new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.93,
          metalness: 0.03,
          color: 0xb2b0a8,
        })
      );
    }
    const facadesDark = facades.map((m) => {
      const c = m.clone();
      c.color = new THREE.Color(0x8d8b84);
      return c;
    });

    const PITCH = 48;
    const r = this.rand;
    this.spawnPoints = [];

    for (let ix = -2; ix <= 2; ix++) {
      for (let iz = -2; iz <= 2; iz++) {
        const cx = ix * PITCH;
        const cz = iz * PITCH;
        const isPlaza = ix === 0 && iz === 0;

        // sidewalk slab under every block
        const slab = new THREE.Mesh(boxGeo(38, 0.28, 38), sideMat);
        slab.position.set(cx, 0.14, cz);
        slab.receiveShadow = true;
        this.root.add(slab);
        this.shootables.push(slab);

        if (isPlaza) {
          this._buildPlaza(cx, cz);
          continue;
        }

        const count = 1 + ((r() * 2.6) | 0);
        const slots = [
          [-9, -9],
          [9, -9],
          [-9, 9],
          [9, 9],
        ];
        // shuffle slots
        for (let i = slots.length - 1; i > 0; i--) {
          const j = (r() * (i + 1)) | 0;
          [slots[i], slots[j]] = [slots[j], slots[i]];
        }
        for (let b = 0; b < count; b++) {
          const [ox, oz] = slots[b];
          const w = 12 + r() * 7;
          const d = 12 + r() * 7;
          const h = 14 + r() * 30;
          const ruin = r() < 0.22;
          const mat = r() < 0.3 ? facadesDark[(r() * facadesDark.length) | 0] : facades[(r() * facades.length) | 0];
          this._buildBuilding(cx + ox + (r() - 0.5) * 3, cz + oz + (r() - 0.5) * 3, w, h, d, mat, ruin);
        }

        // rubble + street clutter on the block edges
        if (r() < 0.75) {
          this._rubblePile(cx + (r() - 0.5) * 26, cz + (r() - 0.5) * 26, 0.8 + r() * 1.6);
        }
        this.spawnPoints.push(new THREE.Vector3(cx + (r() - 0.5) * 30, 0, cz + (r() - 0.5) * 30));
      }
    }

    this._buildPerimeter();
  }

  _buildPlaza(cx, cz) {
    const r = this.rand;
    // spawn plaza: low cover, no tall buildings
    const sandMat = new THREE.MeshStandardMaterial({ color: 0x6f6a5c, roughness: 0.95 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      const rad = 9 + r() * 2;
      const x = cx + Math.cos(a) * rad;
      const z = cz + Math.sin(a) * rad;
      const h = 0.9 + r() * 0.5;
      const bag = new THREE.Mesh(boxGeo(3.2, h, 1.1), sandMat);
      bag.position.set(x, h / 2, z);
      bag.rotation.y = -a;
      bag.castShadow = true;
      bag.receiveShadow = true;
      this.root.add(bag);
      this.shootables.push(bag);
      this.colliders.push({
        minX: x - 1.7,
        maxX: x + 1.7,
        minZ: z - 0.7,
        maxZ: z + 0.7,
        minY: 0,
        maxY: h,
      });
    }
    // burnt-out APC centrepiece
    this._buildVehicle(cx + 2, cz - 3, Math.PI * 0.25, 'apc');
  }

  _buildBuilding(x, z, w, h, d, material, ruin) {
    const r = this.rand;
    const geo = boxGeo(w, h, d);
    // scale UVs so window rows line up with height
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, h / 2 + 0.28, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.shootables.push(mesh);
    this.colliders.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      minY: 0,
      maxY: h,
    });

    // cornice / parapet
    const trim = new THREE.Mesh(
      boxGeo(w + 0.6, 0.5, d + 0.6),
      new THREE.MeshStandardMaterial({ color: 0x6e6a63, roughness: 0.92 })
    );
    trim.position.set(x, h + 0.4, z);
    trim.castShadow = true;
    this.root.add(trim);
    this.shootables.push(trim);

    if (ruin) {
      // blasted top: broken slabs, exposed floor plates
      const topY = h + 0.55;
      const breakup = 3 + ((r() * 4) | 0);
      for (let i = 0; i < breakup; i++) {
        const bw = 1.5 + r() * (w * 0.35);
        const bd = 1.5 + r() * (d * 0.35);
        const bh = 0.4 + r() * 2.2;
        const chunk = new THREE.Mesh(boxGeo(bw, bh, bd), material);
        chunk.position.set(
          x + (r() - 0.5) * (w - bw),
          topY + (r() - 0.5) * 1.4,
          z + (r() - 0.5) * (d - bd)
        );
        chunk.rotation.y = r() * Math.PI;
        chunk.rotation.z = (r() - 0.5) * 0.25;
        chunk.castShadow = true;
        chunk.receiveShadow = true;
        this.root.add(chunk);
        this.shootables.push(chunk);
      }
      // scorch marks
      const soot = new THREE.Mesh(
        new THREE.CircleGeometry(Math.min(w, d) * 0.55, 10),
        new THREE.MeshBasicMaterial({ color: 0x14120f, transparent: true, opacity: 0.4 })
      );
      soot.position.set(x, h + 0.62, z);
      soot.rotation.x = -Math.PI / 2;
      this.root.add(soot);
      // rubble skirt
      this._rubblePile(x + (r() - 0.5) * w, z + d / 2 + 1.2, 1.2 + r());
    } else if (r() < 0.55) {
      // rooftop clutter: AC units, water tank, antenna
      const acMat = new THREE.MeshStandardMaterial({ color: 0x6a6b63, roughness: 0.85, metalness: 0.3 });
      for (let i = 0; i < 2; i++) {
        const ac = new THREE.Mesh(boxGeo(1.6, 0.9, 1.3), acMat);
        ac.position.set(x + (r() - 0.5) * (w - 3), h + 1.1, z + (r() - 0.5) * (d - 3));
        ac.castShadow = true;
        this.root.add(ac);
      }
      if (r() < 0.5) {
        const tankMat = new THREE.MeshStandardMaterial({ color: 0x5b5145, roughness: 0.9, metalness: 0.25 });
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.4, 10), tankMat);
        tank.position.set(x + (r() - 0.5) * 3, h + 1.9, z + (r() - 0.5) * 3);
        tank.castShadow = true;
        this.root.add(tank);
        for (let l = 0; l < 3; l++) {
          const a = (l / 3) * Math.PI * 2;
          const leg = new THREE.Mesh(boxGeo(0.12, 1.4, 0.12), new THREE.MeshStandardMaterial({ color: 0x3b3a35, roughness: 0.8, metalness: 0.6 }));
          leg.position.set(tank.position.x + Math.cos(a) * 1, h + 0.8, tank.position.z + Math.sin(a) * 1);
          this.root.add(leg);
        }
      }
      if (r() < 0.6) {
        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.08, 4 + r() * 5, 6),
          new THREE.MeshStandardMaterial({ color: 0x4a4a45, roughness: 0.7, metalness: 0.6 })
        );
        mast.position.set(x + (r() - 0.5) * (w - 2), h + 2.6, z + (r() - 0.5) * (d - 2));
        this.root.add(mast);
      }
    }

    // entrance awning facing the street
    if (r() < 0.7) {
      const awn = new THREE.Mesh(
        boxGeo(w * 0.35, 0.25, 1.8),
        new THREE.MeshStandardMaterial({ color: 0x4d463c, roughness: 0.9 })
      );
      const side = r() < 0.5 ? 1 : -1;
      awn.position.set(x + (r() - 0.5) * w * 0.5, 3.1, z + (side * d) / 2 + side * 0.9);
      awn.castShadow = true;
      this.root.add(awn);
    }
  }

  _rubblePile(x, z, size = 1.4) {
    const r = this.rand;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6d6a63,
      roughness: 0.97,
      metalness: 0.02,
      flatShading: true,
    });
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const n = 5 + ((r() * 6) | 0);
    for (let i = 0; i < n; i++) {
      const s = (0.25 + r() * 0.8) * size;
      const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat);
      chunk.position.set((r() - 0.5) * size * 2.2, s * 0.55, (r() - 0.5) * size * 2.2);
      chunk.rotation.set(r() * 3, r() * 3, r() * 3);
      chunk.scale.y = 0.6 + r() * 0.5;
      chunk.castShadow = true;
      chunk.receiveShadow = true;
      group.add(chunk);
      this.shootables.push(chunk);
    }
    // rebar sticking out
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.7 + r() * 0.8, 5),
        new THREE.MeshStandardMaterial({ color: 0x5b3f2c, roughness: 0.8, metalness: 0.7 })
      );
      bar.position.set((r() - 0.5) * size, 0.4 * size, (r() - 0.5) * size);
      bar.rotation.set((r() - 0.5) * 1.2, r() * 3, (r() - 0.5) * 1.2);
      group.add(bar);
    }
    this.root.add(group);
  }

  /* -------------------------------------------------------------- props */
  _buildProps() {
    const r = this.rand;
    const PITCH = 48;

    // cars along the roads
    for (let i = 0; i < 34; i++) {
      const ix = ((r() * 5) | 0) - 2;
      const iz = ((r() * 5) | 0) - 2;
      const alongX = r() < 0.5;
      const road = PITCH / 2;
      let x;
      let z;
      if (alongX) {
        x = ix * PITCH + (r() - 0.5) * 26;
        z = iz * PITCH + (r() < 0.5 ? -road : road) + (r() - 0.5) * 6;
      } else {
        x = ix * PITCH + (r() < 0.5 ? -road : road) + (r() - 0.5) * 6;
        z = iz * PITCH + (r() - 0.5) * 26;
      }
      if (Math.hypot(x, z) < 16) continue;
      this._buildVehicle(x, z, (alongX ? 0 : Math.PI / 2) + (r() - 0.5) * 0.6, r() < 0.18 ? 'apc' : 'car');
    }

    // concrete barriers + barrels near the plaza
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.95 });
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2;
      const rad = 16 + r() * 10;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      if (r() < 0.5) {
        const b = new THREE.Mesh(boxGeo(2.2, 0.9, 0.6), barrierMat);
        b.position.set(x, 0.45, z);
        b.rotation.y = a;
        b.castShadow = true;
        b.receiveShadow = true;
        this.root.add(b);
        this.shootables.push(b);
        this.colliders.push({
          minX: x - 1.1,
          maxX: x + 1.1,
          minZ: z - 0.4,
          maxZ: z + 0.4,
          minY: 0,
          maxY: 0.9,
        });
      } else {
        this._buildBarrel(x, z, r() < 0.25);
      }
    }

    // street lights (bent, dark)
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x40433f, roughness: 0.7, metalness: 0.65 });
    for (let i = 0; i < 16; i++) {
      const ix = ((r() * 5) | 0) - 2;
      const iz = ((r() * 5) | 0) - 2;
      const x = ix * PITCH + (r() < 0.5 ? -24 : 24) + (r() - 0.5) * 4;
      const z = iz * PITCH + (r() < 0.5 ? -24 : 24) + (r() - 0.5) * 4;
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 7.5, 8), poleMat);
      pole.position.y = 3.75;
      pole.castShadow = true;
      g.add(pole);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), poleMat);
      arm.position.set(0.7, 7.4, 0);
      arm.rotation.z = Math.PI / 2.4;
      g.add(arm);
      const head = new THREE.Mesh(boxGeo(0.7, 0.14, 0.34), poleMat);
      head.position.set(1.35, 7.15, 0);
      head.rotation.z = -0.1;
      g.add(head);
      const lens = new THREE.Mesh(
        boxGeo(0.55, 0.04, 0.24),
        new THREE.MeshStandardMaterial({ color: 0x2b2b28, roughness: 0.4, metalness: 0.5 })
      );
      lens.position.set(1.35, 7.06, 0);
      g.add(lens);
      g.position.set(x, 0, z);
      g.rotation.y = r() * Math.PI * 2;
      g.rotation.z = (r() - 0.5) * 0.09;
      this.root.add(g);
      this.colliders.push({ minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2, minY: 0, maxY: 7.5 });
    }

    // chain-link fence segments
    const fenceMat = new THREE.MeshStandardMaterial({
      color: 0x6b6a63,
      roughness: 0.8,
      metalness: 0.5,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 8; i++) {
      const a = r() * Math.PI * 2;
      const rad = 22 + r() * 30;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.2), fenceMat);
      f.position.set(x, 1.1, z);
      f.rotation.y = a;
      this.root.add(f);
      this.shootables.push(f);
    }

    // distant skyline silhouettes for depth
    const farMat = new THREE.MeshStandardMaterial({ color: 0x5d6063, roughness: 1, metalness: 0 });
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2 + r() * 0.1;
      const rad = CITY_RADIUS + 30 + r() * 120;
      const w = 14 + r() * 26;
      const h = 20 + r() * 90;
      const b = new THREE.Mesh(boxGeo(w, h, w), farMat);
      b.position.set(Math.cos(a) * rad, h / 2, Math.sin(a) * rad);
      this.root.add(b);
    }

    // bullet hole decal pool
    this.holeTexture = bulletHoleTexture();
    this.holeMaterial = new THREE.MeshBasicMaterial({
      map: this.holeTexture,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    this.holeGeo = new THREE.PlaneGeometry(0.22, 0.22);
    this.holes = [];
    this.holeIndex = 0;
    for (let i = 0; i < 70; i++) {
      const d = new THREE.Mesh(this.holeGeo, this.holeMaterial);
      d.visible = false;
      this.root.add(d);
      this.holes.push(d);
    }
  }

  _buildVehicle(x, z, rot, type = 'car') {
    const r = this.rand;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;

    const rustColors = [0x6b5040, 0x55564e, 0x6d6a5c, 0x4a4f52, 0x74604a, 0x5c5148];
    const bodyMat = new THREE.MeshStandardMaterial({
      color: rustColors[(r() * rustColors.length) | 0],
      roughness: 0.78,
      metalness: 0.55,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1b2326,
      roughness: 0.25,
      metalness: 0.7,
      transparent: true,
      opacity: 0.75,
    });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1b1a18, roughness: 0.95 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x4c4a44, roughness: 0.6, metalness: 0.7 });
    const burntMat = new THREE.MeshStandardMaterial({ color: 0x24211d, roughness: 1, metalness: 0.2 });

    let L = 4.4;
    let W = 1.9;
    let bodyH = 0.72;
    let cabinH = 0.62;
    if (type === 'apc') {
      L = 6.4;
      W = 2.6;
      bodyH = 1.5;
      cabinH = 0.7;
    }

    const burnt = type === 'apc' || r() < 0.35;
    const useMat = burnt ? burntMat : bodyMat;

    const body = new THREE.Mesh(boxGeo(W, bodyH, L), useMat);
    body.position.y = bodyH / 2 + 0.34;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const cabin = new THREE.Mesh(boxGeo(W * 0.92, cabinH, L * (type === 'apc' ? 0.55 : 0.5)), useMat);
    cabin.position.set(0, bodyH + cabinH / 2 + 0.3, type === 'apc' ? 0.4 : -0.15);
    cabin.castShadow = true;
    g.add(cabin);

    // glass
    if (!burnt) {
      const glass = new THREE.Mesh(boxGeo(W * 0.88, cabinH * 0.72, L * 0.52), glassMat);
      glass.position.copy(cabin.position);
      g.add(glass);
    }

    // wheels
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
    const rimGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.28, 10);
    const offsets = type === 'apc' ? [-2.1, -1.1, 1.2, 2.2] : [-1.5, 1.5];
    for (const oz of offsets) {
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(wheelGeo, tireMat);
        w.rotation.z = Math.PI / 2;
        w.position.set((sx * W) / 2, 0.36, oz);
        w.castShadow = true;
        g.add(w);
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.rotation.z = Math.PI / 2;
        rim.position.set((sx * W) / 2 + sx * 0.01, 0.36, oz);
        g.add(rim);
        // some wheels missing
        if (r() < 0.22) {
          w.visible = false;
          rim.visible = false;
        }
      }
    }

    // lights + bumper details
    const tail = new THREE.Mesh(
      boxGeo(W * 0.85, 0.12, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x5a2420, roughness: 0.5, metalness: 0.4 })
    );
    tail.position.set(0, bodyH * 0.75 + 0.3, -L / 2 - 0.02);
    g.add(tail);

    if (type === 'apc') {
      // turret + hatch + slats
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1, 0.7, 8), burntMat);
      turret.position.set(0, bodyH + 0.95, -0.3);
      turret.castShadow = true;
      g.add(turret);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.2, 8), burntMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, bodyH + 0.95, -1.6);
      g.add(barrel);
      for (let i = 0; i < 4; i++) {
        const slat = new THREE.Mesh(boxGeo(0.1, 0.5, 0.8), burntMat);
        slat.position.set(-W / 2 + 0.1, 0.8, -2 + i * 1.1);
        g.add(slat);
      }
    } else {
      // door + mirror + roof rack
      const door = new THREE.Mesh(boxGeo(0.06, bodyH * 0.8, L * 0.34), useMat);
      door.position.set(W / 2 + 0.01, bodyH / 2 + 0.32, 0.1);
      g.add(door);
      if (!burnt) {
        const mirror = new THREE.Mesh(boxGeo(0.2, 0.12, 0.1), useMat);
        mirror.position.set(W / 2 + 0.12, bodyH + 0.2, 0.7);
        g.add(mirror);
      }
    }

    // tilt: some cars are flipped or on rims
    if (r() < 0.2) {
      g.rotation.z = (r() - 0.5) * 0.5;
      g.position.y = 0.06;
    }
    if (r() < 0.08) {
      g.rotation.x = Math.PI;
      g.position.y = 1.5;
    }

    this.root.add(g);
    g.traverse((o) => {
      if (o.isMesh) this.shootables.push(o);
    });
    const halfW = (Math.abs(Math.cos(rot)) * W + Math.abs(Math.sin(rot)) * L) / 2;
    const halfL = (Math.abs(Math.sin(rot)) * W + Math.abs(Math.cos(rot)) * L) / 2;
    this.colliders.push({
      minX: x - halfW,
      maxX: x + halfW,
      minZ: z - halfL,
      maxZ: z + halfL,
      minY: 0,
      maxY: bodyH + cabinH + 0.4,
    });

    if (burnt && r() < 0.5) {
      this.firePoints.push(new THREE.Vector3(x, 1.1, z));
    }
  }

  _buildBarrel(x, z, burning) {
    const r = this.rand;
    const mat = new THREE.MeshStandardMaterial({
      color: burning ? 0x3b2f28 : [0x4a5b4a, 0x5b4a3a, 0x3f4a55][(r() * 3) | 0],
      roughness: 0.85,
      metalness: 0.45,
    });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.92, 12), mat);
    b.position.set(x, 0.46, z);
    b.rotation.z = (r() - 0.5) * 0.12;
    b.castShadow = true;
    b.receiveShadow = true;
    this.root.add(b);
    this.shootables.push(b);
    this.colliders.push({ minX: x - 0.36, maxX: x + 0.36, minZ: z - 0.36, maxZ: z + 0.36, minY: 0, maxY: 0.92 });
    // rings
    for (const y of [0.24, 0.68]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.325, 0.02, 6, 14), mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, y, z);
      this.root.add(ring);
    }
    if (burning) this.firePoints.push(new THREE.Vector3(x, 1.15, z));
  }

  _buildPerimeter() {
    // fenced containment ring so the player cannot walk into the void
    const mat = new THREE.MeshStandardMaterial({
      color: 0x585a55,
      roughness: 0.9,
      metalness: 0.3,
    });
    const R = CITY_RADIUS;
    const walls = [
      { x: 0, z: -R, w: R * 2, d: 2 },
      { x: 0, z: R, w: R * 2, d: 2 },
      { x: -R, z: 0, w: 2, d: R * 2 },
      { x: R, z: 0, w: 2, d: R * 2 },
    ];
    for (const w of walls) {
      const m = new THREE.Mesh(boxGeo(w.w, 9, w.d), mat);
      m.position.set(w.x, 4.5, w.z);
      this.root.add(m);
      this.shootables.push(m);
      this.colliders.push({
        minX: w.x - w.w / 2,
        maxX: w.x + w.w / 2,
        minZ: w.z - w.d / 2,
        maxZ: w.z + w.d / 2,
        minY: 0,
        maxY: 9,
      });
    }
  }

  /* ---------------------------------------------------------------- ash */
  _buildAsh() {
    const count = 2200;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const speed = new Float32Array(count);
    const R = 62;
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * R * 2;
      pos[i * 3 + 1] = Math.random() * 34;
      pos[i * 3 + 2] = (Math.random() - 0.5) * R * 2;
      speed[i] = 0.5 + Math.random() * 1.6;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.085,
      map: softDotTexture({ color: '#d8d2c6' }),
      color: 0xcfc9bb,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.ash = new THREE.Points(geo, mat);
    this.ash.frustumCulled = false;
    this.ashSpeeds = speed;
    this.ashRange = R;
    this.scene.add(this.ash);
  }

  _buildSmoke() {
    const tex = softDotTexture({ color: '#8d8b84' });
    this.smokePuffs = [];
    const smokeMat = new THREE.SpriteMaterial({
      map: tex,
      color: 0x6e6b64,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
    for (const p of this.firePoints.slice(0, 10)) {
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Sprite(smokeMat.clone());
        s.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 2.6, (Math.random() - 0.5) * 0.6));
        s.scale.setScalar(1.4 + Math.random() * 2.2);
        s.userData.baseY = s.position.y;
        s.userData.speed = 0.35 + Math.random() * 0.5;
        s.userData.phase = Math.random() * Math.PI * 2;
        this.root.add(s);
        this.smokePuffs.push(s);
      }
    }
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight(0xb8bcc0, 0x4a463e, 1.15);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xd8cfb8, 1.5);
    sun.position.set(38, 60, 24);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 60;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    // warm glow from the fires, no shadow cost
    this.fireLight = new THREE.PointLight(0xff7a2a, 0, 26, 2);
    this.scene.add(this.fireLight);
  }

  /* -------------------------------------------------------------- update */
  update(dt, camera, t, playerPos) {
    // ash drifts down and wraps around the player
    const posAttr = this.ash.geometry.attributes.position;
    const arr = posAttr.array;
    const R = this.ashRange;
    for (let i = 0; i < this.ashSpeeds.length; i++) {
      const i3 = i * 3;
      arr[i3 + 1] -= this.ashSpeeds[i] * dt * 1.35;
      arr[i3] += Math.sin(t * 0.7 + i) * dt * 0.55 + dt * 0.35;
      arr[i3 + 2] += Math.cos(t * 0.5 + i * 0.7) * dt * 0.4;
      if (arr[i3 + 1] < 0) {
        arr[i3 + 1] = 30 + Math.random() * 8;
        arr[i3] = playerPos.x + (Math.random() - 0.5) * R * 2;
        arr[i3 + 2] = playerPos.z + (Math.random() - 0.5) * R * 2;
      }
      // recycle out-of-range horizontally
      if (Math.abs(arr[i3] - playerPos.x) > R) arr[i3] = playerPos.x + (Math.random() - 0.5) * R * 2;
      if (Math.abs(arr[i3 + 2] - playerPos.z) > R) arr[i3 + 2] = playerPos.z + (Math.random() - 0.5) * R * 2;
    }
    posAttr.needsUpdate = true;

    // smoke drift
    if (this.smokePuffs.length) {
      for (const s of this.smokePuffs) {
        s.position.y += s.userData.speed * dt;
        if (s.position.y > s.userData.baseY + 7) s.position.y = s.userData.baseY;
        s.position.x += Math.sin(t * 0.6 + s.userData.phase) * dt * 0.5;
        const life = (s.position.y - s.userData.baseY) / 7;
        s.material.opacity = 0.3 * (1 - life);
        s.scale.setScalar(1.4 + life * 3.4);
      }
    }

    // firelight flickers between nearby fires
    if (this.firePoints.length) {
      const idx = Math.floor(t * 1.5) % this.firePoints.length;
      const p = this.firePoints[idx];
      this.fireLight.position.set(p.x, p.y + 0.6, p.z);
      this.fireLight.intensity = 9 + Math.sin(t * 17) * 3 + Math.sin(t * 7.3) * 2;
    }

    // keep sun shadow frustum on the player
    this.sun.position.set(playerPos.x + 38, 60, playerPos.z + 24);
    this.sun.target.position.set(playerPos.x, 0, playerPos.z);
    this.sun.target.updateMatrixWorld();
  }

  addBulletHole(point, normal) {
    const d = this.holes[this.holeIndex];
    this.holeIndex = (this.holeIndex + 1) % this.holes.length;
    d.position.copy(point).addScaledVector(normal, 0.012);
    d.lookAt(point.clone().add(normal));
    d.rotation.z = Math.random() * Math.PI * 2;
    const s = 0.7 + Math.random() * 0.7;
    d.scale.set(s, s, s);
    d.visible = true;
  }

  /** Push a cylinder-shaped player out of building/prop boxes. */
  resolveCollision(pos, radius = 0.42, height = 1.8) {
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      if (pos.y > c.maxY - 0.05 || pos.y + height < c.minY) continue;
      const closestX = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const closestZ = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > radius * radius) continue;
      if (distSq > 1e-8) {
        const dist = Math.sqrt(distSq);
        const push = (radius - dist) / dist;
        pos.x += dx * push;
        pos.z += dz * push;
      } else {
        // inside the box: push out along the shortest axis
        const left = Math.abs(pos.x - c.minX);
        const right = Math.abs(c.maxX - pos.x);
        const back = Math.abs(pos.z - c.minZ);
        const front = Math.abs(c.maxZ - pos.z);
        const m = Math.min(left, right, back, front);
        if (m === left) pos.x = c.minX - radius;
        else if (m === right) pos.x = c.maxX + radius;
        else if (m === back) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
    return pos;
  }

  /** True when the straight line between two points is unobstructed. */
  hasLineOfSight(from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.001) return true;
    const steps = Math.min(30, Math.max(4, Math.ceil(dist / 2.2)));
    for (let i = 1; i < steps; i++) {
      const f = i / steps;
      const x = from.x + dx * f;
      const z = from.z + dz * f;
      for (let j = 0; j < this.colliders.length; j++) {
        const c = this.colliders[j];
        if (c.maxY < 1.4) continue; // low cover does not block sight
        if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return false;
      }
    }
    return true;
  }
}
