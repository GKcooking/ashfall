import * as THREE from 'three';

/** Deterministic pseudo-random generator so the city rebuilds consistently. */
export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, repeatX = 1, repeatY = 1, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Grubby, weathered concrete with a grid of broken windows. */
export function facadeTexture({ seed = 3, tint = '#8b8880' } = {}) {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const r = rng(seed);

  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, S, S);

  // concrete mottling
  for (let i = 0; i < 5200; i++) {
    const x = r() * S;
    const y = r() * S;
    const v = r();
    ctx.fillStyle = v < 0.5 ? 'rgba(30,28,26,0.055)' : 'rgba(235,232,224,0.05)';
    ctx.fillRect(x, y, 1 + r() * 4, 1 + r() * 4);
  }

  // panel seams
  ctx.strokeStyle = 'rgba(24,22,20,0.30)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (S / 4) * i);
    ctx.lineTo(S, (S / 4) * i);
    ctx.stroke();
  }

  // windows: 4 x 4 grid, each cell a storey bay
  const cols = 4;
  const rows = 4;
  const cellW = S / cols;
  const cellH = S / rows;
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      const w = cellW * 0.54;
      const h = cellH * 0.46;
      const x = cx * cellW + (cellW - w) / 2;
      const y = cy * cellH + (cellH - h) / 2;

      // recessed frame
      ctx.fillStyle = 'rgba(38,35,32,0.85)';
      ctx.fillRect(x - 4, y - 4, w + 8, h + 8);

      const broken = r();
      if (broken < 0.14) {
        // boarded up
        ctx.fillStyle = '#5b4a34';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(20,16,12,0.7)';
        ctx.lineWidth = 5;
        for (let b = -1; b < 3; b++) {
          ctx.beginPath();
          ctx.moveTo(x, y + (h / 3) * b + 6);
          ctx.lineTo(x + w, y + (h / 3) * b + 22);
          ctx.stroke();
        }
      } else {
        // dark interior with a hint of sky reflection at the top
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, '#2f3a40');
        g.addColorStop(0.45, '#14181b');
        g.addColorStop(1, '#0a0c0d');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);

        // shattered glass shards
        if (broken > 0.72) {
          ctx.fillStyle = 'rgba(180,205,214,0.20)';
          for (let s = 0; s < 7; s++) {
            ctx.beginPath();
            const px = x + r() * w;
            const py = y + r() * h;
            ctx.moveTo(px, py);
            ctx.lineTo(px + 6 + r() * 16, py + r() * 8);
            ctx.lineTo(px + r() * 10, py + 10 + r() * 18);
            ctx.closePath();
            ctx.fill();
          }
        }
        // mullion
        ctx.strokeStyle = 'rgba(52,48,44,0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w / 2, y + h);
        ctx.stroke();
      }

      // sill shadow
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x - 6, y + h + 4, w + 12, 5);
    }
  }

  // rain / soot streaks
  for (let i = 0; i < 90; i++) {
    const x = r() * S;
    const len = 40 + r() * 200;
    const g = ctx.createLinearGradient(x, 0, x, len);
    g.addColorStop(0, 'rgba(18,16,14,0.20)');
    g.addColorStop(1, 'rgba(18,16,14,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 1 + r() * 5, len);
  }

  // ground-level grime
  const g2 = ctx.createLinearGradient(0, S * 0.72, 0, S);
  g2.addColorStop(0, 'rgba(20,18,15,0)');
  g2.addColorStop(1, 'rgba(18,16,13,0.55)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, S * 0.72, S, S * 0.28);

  return toTexture(c);
}

/** Cracked asphalt with oil stains. */
export function asphaltTexture({ seed = 7 } = {}) {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const r = rng(seed);

  ctx.fillStyle = '#3b3a38';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 16000; i++) {
    const v = r();
    ctx.fillStyle = v < 0.5 ? 'rgba(15,15,14,0.16)' : 'rgba(140,138,130,0.10)';
    ctx.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 3);
  }

  // patches
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = `rgba(28,28,27,${0.10 + r() * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(r() * S, r() * S, 20 + r() * 70, 14 + r() * 50, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // cracks
  ctx.strokeStyle = 'rgba(12,12,12,0.75)';
  for (let i = 0; i < 26; i++) {
    ctx.lineWidth = 1 + r() * 2.2;
    let x = r() * S;
    let y = r() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 7; s++) {
      x += (r() - 0.5) * 60;
      y += (r() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  return toTexture(c);
}

/** Dusty paving slabs for sidewalks. */
export function concreteTexture({ seed = 11 } = {}) {
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const r = rng(seed);
  ctx.fillStyle = '#7e7b73';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(30,28,25,0.10)' : 'rgba(210,206,196,0.10)';
    ctx.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 3);
  }
  ctx.strokeStyle = 'rgba(35,33,30,0.6)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const p = (S / 4) * i;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(S, p);
    ctx.stroke();
  }
  return toTexture(c);
}

/** Dirt / rubble ground blend. */
export function dirtTexture({ seed = 13 } = {}) {
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const r = rng(seed);
  ctx.fillStyle = '#6a6157';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 7000; i++) {
    const v = r();
    ctx.fillStyle = v < 0.5 ? 'rgba(35,30,24,0.14)' : 'rgba(180,168,150,0.12)';
    const s = 1 + r() * 5;
    ctx.fillRect(r() * S, r() * S, s, s);
  }
  return toTexture(c);
}

/** Multi-cam style camouflage used by the soldiers. */
export function camoTexture({ seed = 21, base = '#5a5b48' } = {}) {
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  const palette = ['#3f4436', '#6f6f56', '#2c2e26', '#86856a', '#4b4535'];
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = palette[(r() * palette.length) | 0];
    ctx.globalAlpha = 0.55 + r() * 0.4;
    const cx = r() * S;
    const cy = r() * S;
    ctx.beginPath();
    // irregular blob
    const pts = 6 + ((r() * 4) | 0);
    for (let p = 0; p <= pts; p++) {
      const a = (p / pts) * Math.PI * 2;
      const rad = 8 + r() * 22;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad * 0.7;
      p === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return toTexture(c);
}

/** Soft round sprite used for ash, dust and blood motes. */
export function softDotTexture({ color = '#ffffff' } = {}) {
  const S = 64;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.4, color);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return toTexture(c);
}

/** Star-shaped muzzle flash sprite. */
export function flashTexture() {
  const S = 128;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.translate(S / 2, S / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  g.addColorStop(0, 'rgba(255,255,240,1)');
  g.addColorStop(0.25, 'rgba(255,214,140,0.9)');
  g.addColorStop(0.6, 'rgba(255,150,60,0.28)');
  g.addColorStop(1, 'rgba(255,120,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, S / 2, 0, Math.PI * 2);
  ctx.fill();
  // spikes
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    ctx.rotate((Math.PI * 2) / 7);
    const grd = ctx.createLinearGradient(0, 0, 0, -S / 2);
    grd.addColorStop(0, 'rgba(255,235,190,0.85)');
    grd.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(0, -S / 2.1);
    ctx.lineTo(4, 0);
    ctx.closePath();
    ctx.fill();
  }
  return toTexture(c);
}

/** Bullet hole decal. */
export function bulletHoleTexture() {
  const S = 64;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(10,10,10,0.95)');
  g.addColorStop(0.35, 'rgba(25,22,20,0.85)');
  g.addColorStop(0.7, 'rgba(80,74,66,0.35)');
  g.addColorStop(1, 'rgba(120,112,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return toTexture(c, 1, 1, true);
}
