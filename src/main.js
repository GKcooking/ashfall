/**
 * ASHFALL — abandoned-city team deathmatch.
 * Single game loop shared by desktop (pointer lock + WASD) and touch
 * (virtual stick + drag-to-look + on-screen buttons).
 */
import * as THREE from 'three';
import { City } from './world.js';
import { Fx } from './fx.js';
import { GameAudio } from './audio.js';
import { WEAPONS, WeaponView } from './weapons.js';
import { Bot } from './bot.js';

const PLAYER_RESPAWN = 3;
const BOT_RESPAWN = 5;
const TEAM_SIZE = 6;

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------ device */
const params = new URLSearchParams(location.search);

// ?time=<seconds> shortens the match for testing; default is a full 8-minute round.
const TIME_PARAM = Number(params.get('time'));
const MATCH_TIME = Number.isFinite(TIME_PARAM) && TIME_PARAM > 0 ? Math.min(TIME_PARAM, 3600) : 8 * 60;
const coarse =
  window.matchMedia?.('(pointer: coarse)').matches ||
  'ontouchstart' in window ||
  (navigator.maxTouchPoints || 0) > 0;
const forced = params.get('touch');
let touchMode = forced === '1' ? true : forced === '0' ? false : coarse;

/* ----------------------------------------------------------- renderer */
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !coarse,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touchMode ? 1.6 : 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = !coarse;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.04, 420);
camera.rotation.order = 'YXZ';
scene.add(camera);

/* --------------------------------------------------------------- world */
const city = new City(scene);
const fx = new Fx(scene, city);
const audio = new GameAudio();
const weaponView = new WeaponView(camera);

/* ------------------------------------------------------------- helpers */
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _end = new THREE.Vector3();

const formatter = new Intl.NumberFormat('en-US');

function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* -------------------------------------------------------------- player */
class Player {
  constructor() {
    this.name = 'YOU';
    this.team = 'alpha';
    this.maxHealth = 100;
    this.health = 100;
    this.alive = true;
    this.position = new THREE.Vector3(0, 0, 0);
    this.eyePos = new THREE.Vector3();
    this.radius = 0.42;
    this.kills = 0;
    this.deaths = 0;
    this.hurtT = 0;
    this.lastHurt = -99;
    this.crouch = false;
    this.eyeHeight = 1.62;
    this.aimHeight = 1.34;
    this.currentEye = 1.62;
    this.bob = 0;
    this.onDeath = null;
  }

  syncEye() {
    this.eyePos.set(this.position.x, this.position.y + this.currentEye, this.position.z);
    return this.eyePos;
  }

  takeDamage(amount, { from = null, fx: fxo = null, point = null } = {}) {
    if (!this.alive) return;
    this.health -= amount;
    this.hurtT = 0.42;
    this.lastHurt = performance.now() / 1000;
    audio.hurt();
    shake(0.6);
    if (fxo && point) {
      _end.copy(this.position).sub(point).normalize();
      fxo.blood(point, _end);
    }
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.deaths++;
      if (this.onDeath) this.onDeath(from);
    }
  }

  respawn(pos) {
    this.position.copy(pos);
    this.health = this.maxHealth;
    this.alive = true;
    this.hurtT = 0;
    this.lastHurt = performance.now() / 1000;
  }
}

const player = new Player();

/* ---------------------------------------------------------- kill feed */
function feed(killer, victim, weaponName, headshot) {
  const box = $('killfeed');
  if (!box) return;
  const row = document.createElement('div');
  row.className = 'kf-row';
  const k = killer ? `<span class="kf-name t-${killer.team}">${killer.name}</span>` : '';
  const v = `<span class="kf-name t-${victim.team}">${victim.name}</span>`;
  row.innerHTML = `${k}<span class="kf-weapon">${weaponName}${headshot ? ' ✦' : ''}</span>${v}`;
  box.appendChild(row);
  while (box.children.length > 5) box.removeChild(box.firstChild);
  setTimeout(() => row.classList.add('fade'), 4600);
  setTimeout(() => row.remove(), 5400);
}

/* ---------------------------------------------------------- screen fx */
let shakeAmt = 0;
function shake(v) {
  shakeAmt = Math.min(1.4, shakeAmt + v);
}

/* --------------------------------------------------------------- input */
const input = {
  move: { x: 0, y: 0 }, // x = strafe, y = forward
  look: { x: 0, y: 0 }, // consumed each frame (radians)
  firing: false,
  aiming: false,
  sprint: false,
  crouch: false,
  jump: false,
  reloadReq: false,
  swapReq: null,
  prevTrigger: false,
};

const keys = new Set();

function resetInput() {
  input.move.x = 0;
  input.move.y = 0;
  input.firing = false;
  input.aiming = false;
  input.sprint = false;
  input.crouch = false;
  keys.clear();
  stick.active = false;
  stick.x = 0;
  stick.y = 0;
  if (joyKnob) joyKnob.style.transform = 'translate(-50%, -50%)';
  if (joyBase) joyBase.style.opacity = '0';
}

/* pointer lock + mouse -------------------------------------------------- */
let locked = false;
let sensitivity = 0.0022;

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) input.firing = true;
  if (e.button === 2) input.aiming = true;
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.firing = false;
  if (e.button === 2) input.aiming = false;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('mousemove', (e) => {
  if (!locked || touchMode) return;
  const scale = game.adsFactor > 0.5 ? 1 - game.currentWeapon.zoomSens : 1;
  input.look.x -= e.movementX * sensitivity * scale;
  input.look.y -= e.movementY * sensitivity * scale;
});

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && game.state === 'playing' && !touchMode) {
    game.state = 'paused';
    $('pauseHint').classList.remove('hidden');
    resetInput();
  }
});

$('pauseHint').addEventListener('click', () => {
  if (game.state === 'paused') game.resume();
});

/* keyboard ------------------------------------------------------------- */
window.addEventListener('keydown', (e) => {
  if (e.repeat) {
    if (e.code === 'Space') e.preventDefault();
    return;
  }
  keys.add(e.code);
  switch (e.code) {
    case 'KeyR':
      input.reloadReq = true;
      break;
    case 'Digit1':
      input.swapReq = 'carbine';
      break;
    case 'Digit2':
      input.swapReq = 'dmr';
      break;
    case 'KeyC':
      input.crouch = !input.crouch;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      input.sprint = true;
      break;
    case 'Escape':
      if (game.state === 'playing' && !touchMode) document.exitPointerLock();
      break;
    case 'Space':
      e.preventDefault();
      break;
    default:
      break;
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = false;
});

function readKeyboardMove() {
  let x = 0;
  let y = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  return { x, y };
}

/* touch ---------------------------------------------------------------- */
const stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, max: 58 };
let joyBase = null;
let joyKnob = null;
let lookId = null;
let lastLook = { x: 0, y: 0 };

function showTouchUI(on) {
  touchMode = on;
  document.body.classList.toggle('touch', on);
  $('touch').classList.toggle('hidden', !on);
  $('aimBtn').classList.toggle('hidden', on);
  if (on && locked) document.exitPointerLock();
}

function setupTouch() {
  const root = $('touch');
  joyBase = $('joyBase');
  joyKnob = $('joyKnob');

  const joyZone = $('joyZone');
  const lookZone = $('lookZone');

  // Synthetic/edge-case pointer ids can be rejected by the browser; a failed
  // capture must never break the touch handlers.
  const capture = (el, id) => {
    try {
      if (el.hasPointerCapture && el.hasPointerCapture(id)) return;
      el.setPointerCapture(id);
    } catch {
      /* capture unsupported or pointer already released */
    }
  };

  joyZone.addEventListener('pointerdown', (e) => {
    if (!touchMode) return;
    e.preventDefault();
    stick.active = true;
    stick.id = e.pointerId;
    const rect = root.getBoundingClientRect();
    stick.ox = e.clientX - rect.left;
    stick.oy = e.clientY - rect.top;
    joyBase.style.left = `${stick.ox}px`;
    joyBase.style.top = `${stick.oy}px`;
    joyBase.style.opacity = '1';
    capture(joyZone, e.pointerId);
  });

  joyZone.addEventListener('pointermove', (e) => {
    if (!stick.active || e.pointerId !== stick.id) return;
    e.preventDefault();
    const rect = root.getBoundingClientRect();
    let dx = e.clientX - rect.left - stick.ox;
    let dy = e.clientY - rect.top - stick.oy;
    const len = Math.hypot(dx, dy);
    if (len > stick.max) {
      dx = (dx / len) * stick.max;
      dy = (dy / len) * stick.max;
    }
    stick.x = dx / stick.max;
    stick.y = dy / stick.max;
    joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });

  const endJoy = (e) => {
    if (e.pointerId !== stick.id) return;
    stick.active = false;
    stick.id = null;
    stick.x = 0;
    stick.y = 0;
    joyKnob.style.transform = 'translate(-50%, -50%)';
    joyBase.style.opacity = '0';
  };
  joyZone.addEventListener('pointerup', endJoy);
  joyZone.addEventListener('pointercancel', endJoy);

  lookZone.addEventListener('pointerdown', (e) => {
    if (!touchMode) return;
    e.preventDefault();
    lookId = e.pointerId;
    lastLook.x = e.clientX;
    lastLook.y = e.clientY;
    capture(lookZone, e.pointerId);
  });

  lookZone.addEventListener('pointermove', (e) => {
    if (!touchMode || e.pointerId !== lookId) return;
    e.preventDefault();
    const dx = e.clientX - lastLook.x;
    const dy = e.clientY - lastLook.y;
    lastLook.x = e.clientX;
    lastLook.y = e.clientY;
    const sens = 0.0042 * (game.adsFactor > 0.5 ? 1 - game.currentWeapon.zoomSens : 1);
    input.look.x -= dx * sens;
    input.look.y -= dy * sens;
  });

  const endLook = (e) => {
    if (e.pointerId === lookId) lookId = null;
  };
  lookZone.addEventListener('pointerup', endLook);
  lookZone.addEventListener('pointercancel', endLook);

  // hold-to-fire / hold-to-aim buttons
  const hold = (el, on, off) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.classList.add('pressed');
      on();
    });
    const stop = (e) => {
      e.preventDefault();
      el.classList.remove('pressed');
      off();
    };
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    el.addEventListener('pointerleave', stop);
  };

  hold($('tFire'), () => (input.firing = true), () => (input.firing = false));
  hold($('tAim'), () => (input.aiming = true), () => (input.aiming = false));

  $('tReload').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.reloadReq = true;
  });
  $('tSwap').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.swapReq = game.weaponId === 'carbine' ? 'dmr' : 'carbine';
  });
  $('tCrouch').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.crouch = !input.crouch;
    $('tCrouch').classList.toggle('active', input.crouch);
  });

  $('aimBtn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.aiming = true;
  });
  const releaseAim = () => (input.aiming = false);
  $('aimBtn').addEventListener('pointerup', releaseAim);
  $('aimBtn').addEventListener('pointercancel', releaseAim);
  $('aimBtn').addEventListener('pointerleave', releaseAim);
}

/* ================================================================ game */
const game = {
  state: 'menu', // menu | playing | paused | ended | dead
  weaponId: 'carbine',
  currentWeapon: WEAPONS.carbine,
  ammo: { carbine: { mag: WEAPONS.carbine.magSize, reserve: WEAPONS.carbine.reserve }, dmr: { mag: WEAPONS.dmr.magSize, reserve: WEAPONS.dmr.reserve } },
  cooldown: 0,
  reloadT: 0,
  reloading: false,
  adsFactor: 0,
  yaw: 0,
  pitch: 0,
  recoilPitch: 0,
  recoilYaw: 0,
  scores: { alpha: 0, bravo: 0 },
  timeLeft: MATCH_TIME,
  bots: [],
  combatants: [],
  respawnIn: 0,
  hitT: 0,
  damageFlash: 0,
  lastKiller: null,
  matchOver: false,
  ray: new THREE.Raycaster(),
  rayList: [],
};
game.currentWeapon = WEAPONS[game.weaponId];

function pickSpawn(team) {
  const enemies = game.combatants.filter((c) => c.alive && c.team !== team);
  let best = city.spawnPoints[0];
  let bestScore = -Infinity;
  for (let i = 0; i < 12; i++) {
    const p = city.spawnPoints[(Math.random() * city.spawnPoints.length) | 0];
    let score = 0;
    for (const e of enemies) score += Math.min(70, e.position.distanceTo(p));
    score = score / Math.max(1, enemies.length) + Math.random() * 8;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best.clone();
}

const BOT_NAMES = {
  alpha: ['HOLLOW', 'RIVET', 'KESTREL', 'BRAMBLE', 'DUSTER'],
  bravo: ['VULTURE', 'SABLE', 'CRAG', 'MAGPIE', 'TALLOW', 'GRIT'],
};

function createBots() {
  for (const team of ['alpha', 'bravo']) {
    const wanted = team === 'alpha' ? TEAM_SIZE - 1 : TEAM_SIZE;
    for (let i = 0; i < wanted; i++) {
      const bot = new Bot({
        scene,
        city,
        team,
        name: BOT_NAMES[team][i % BOT_NAMES[team].length],
        position: pickSpawn(team),
        skill: 0.42 + Math.random() * 0.34,
        onDeath: (victim, killer) => onBotDeath(victim, killer),
      });
      game.bots.push(bot);
    }
  }
}

function rebuildCombatants() {
  game.combatants = [player, ...game.bots];
}

/* ------------------------------------------------------------- scoring */
function scoreKill(killerTeam) {
  if (!killerTeam || game.matchOver) return;
  game.scores[killerTeam]++;
  updateScoreHud();
}

function onBotDeath(bot, killer) {
  feed(killer, bot, killer === player ? game.currentWeapon.short : 'M4A1', false);
  if (killer && killer.team && killer !== bot) {
    scoreKill(killer.team);
    if (killer === player) {
      player.kills++;
      audio.kill();
      flashKill();
    }
  }
  bot.respawnAt = 0;
  checkScoreLimit();
}

function onPlayerDeath(killer) {
  game.lastKiller = killer;
  feed(killer, player, 'M4A1', false);
  if (killer && killer.team) scoreKill(killer.team);
  game.state = 'dead';
  game.respawnIn = PLAYER_RESPAWN;
  $('deathBy').textContent = killer ? `BY ${killer.name} · ${killer.team.toUpperCase()}` : 'BY THE CITY';
  $('respawnTimer').textContent = Math.ceil(PLAYER_RESPAWN);
  $('deathOverlay').classList.remove('hidden');
  $('scope').classList.add('hidden');
  resetInput();
  game.aimingOff();
  checkScoreLimit();
}
player.onDeath = onPlayerDeath;

function checkScoreLimit() {
  if (game.timeLeft <= 0) endMatch();
}

/* --------------------------------------------------------------- match */
function startMatch() {
  for (const b of game.bots) b.stats && 0;
  game.scores.alpha = 0;
  game.scores.bravo = 0;
  game.timeLeft = MATCH_TIME;
  game.matchOver = false;
  player.kills = 0;
  player.deaths = 0;
  player.alive = true;
  player.health = player.maxHealth;
  player.position.copy(pickSpawn('alpha'));
  player.crouch = false;
  game.weaponId = lobbyWeapon;
  for (const id of ['carbine', 'dmr']) {
    game.ammo[id].mag = WEAPONS[id].magSize;
    game.ammo[id].reserve = WEAPONS[id].reserve;
  }
  weaponView.applyWeapon(game.weaponId);
  game.currentWeapon = WEAPONS[game.weaponId];
  game.reloading = false;
  game.reloadT = 0;
  game.cooldown = 0;
  game.yaw = 0;
  game.pitch = 0;
  game.state = 'playing';
  $('startScreen').classList.add('hidden');
  $('endScreen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('deathOverlay').classList.add('hidden');
  $('pauseHint').classList.add('hidden');
  for (const b of game.bots) b.respawn(pickSpawn(b.team));
  rebuildCombatants();
  updateScoreHud();
  updateHud();
  if (!touchMode) lockPointer();
}

function endMatch() {
  if (game.matchOver) return;
  game.matchOver = true;
  game.state = 'ended';
  const a = game.scores.alpha;
  const b = game.scores.bravo;
  const win = a > b ? 'alpha' : b > a ? 'bravo' : 'draw';
  const el = $('endResult');
  el.className = 'end-result';
  if (win === 'draw') {
    el.textContent = 'DRAW';
    el.classList.add('draw');
  } else if (win === 'alpha') {
    el.textContent = 'VICTORY';
    el.classList.add('win');
  } else {
    el.textContent = 'DEFEAT';
    el.classList.add('loss');
  }
  $('endScore').textContent = `${a} — ${b}`;
  $('endDetail').textContent =
    win === 'draw' ? 'THE CITY REMAINS CONTESTED' : `${win.toUpperCase()} TAKES THE CITY`;
  $('endScreen').classList.remove('hidden');
  $('deathOverlay').classList.add('hidden');
  $('scope').classList.add('hidden');
  resetInput();
  if (document.pointerLockElement) document.exitPointerLock();
}

function lockPointer() {
  if (touchMode) return;
  const req = canvas.requestPointerLock?.({ unadjustedMovement: true });
  if (req?.catch) req.catch(() => canvas.requestPointerLock?.());
}

game.resume = () => {
  $('pauseHint').classList.add('hidden');
  game.state = 'playing';
  if (!touchMode) lockPointer();
};
game.aimingOff = () => {
  input.aiming = false;
  game.adsFactor = 0;
};

/* ---------------------------------------------------------- HUD writes */
let hudCache = {};
function setText(id, value) {
  if (hudCache[id] === value) return;
  hudCache[id] = value;
  const el = $(id);
  if (el) el.textContent = value;
}

function updateScoreHud() {
  setText('scoreA', String(game.scores.alpha));
  setText('scoreB', String(game.scores.bravo));
}

function flashKill() {
  const el = $('endScreen');
  if (el) return;
}

let hitFlashTimer = null;
function showHitmarker() {
  const el = $('hitmarker');
  if (!el) return;
  el.classList.add('on');
  clearTimeout(hitFlashTimer);
  hitFlashTimer = setTimeout(() => el.classList.remove('on'), 130);
}

function updateHud() {
  setText('timer', fmtTime(game.timeLeft));
  setText('healthText', String(Math.max(0, Math.round(player.health))));
  const fill = $('healthFill');
  if (fill) fill.style.width = `${clamp(player.health, 0, 100)}%`;

  const w = game.currentWeapon;
  const ammo = game.ammo[game.weaponId];
  setText('weaponName', w.name);
  setText('mag', String(ammo.mag));
  setText('reserve', String(ammo.reserve));
  $('reloadHint').classList.toggle('hidden', !game.reloading);
  $('mag').classList.toggle('low', ammo.mag <= Math.ceil(w.magSize * 0.25));

  const aliveA = 1 + (player.alive ? 0 : 0) + game.bots.filter((b) => b.team === 'alpha' && b.alive).length;
  const aliveB = game.bots.filter((b) => b.team === 'bravo' && b.alive).length;
  setText('aliveA', String(aliveA));
  setText('aliveB', String(aliveB));

  $('slot1').classList.toggle('active', game.weaponId === 'carbine');
  $('slot2').classList.toggle('active', game.weaponId === 'dmr');

  $('scope').classList.toggle('hidden', !weaponView.scoped);
  $('crosshair').style.opacity = weaponView.scoped ? '0' : String(1 - game.adsFactor * 0.85);
  $('crosshair').style.transform = `scale(${1 + (1 - game.adsFactor) * 0.55})`;

  const df = $('damageFlash');
  if (df) df.style.opacity = String(clamp(game.damageFlash, 0, 1) * 0.85);
}

/* --------------------------------------------------------------- firing */
function currentSpread() {
  const w = game.currentWeapon;
  const a = game.adsFactor;
  let base = lerp(w.spread, w.adsSpread, a);
  if (input.move.y !== 0 || input.move.x !== 0) base *= 1.5;
  if (!player.crouch && input.move.y === 0) base *= 1.0;
  return base;
}

function tryReload() {
  const w = game.currentWeapon;
  const ammo = game.ammo[game.weaponId];
  if (game.reloading || ammo.mag >= w.magSize || ammo.reserve <= 0) return;
  game.reloading = true;
  game.reloadT = w.reloadTime;
  weaponView.startReload(w.reloadTime);
  audio.reload();
}

function finishReload() {
  const w = game.currentWeapon;
  const ammo = game.ammo[game.weaponId];
  const need = w.magSize - ammo.mag;
  const take = Math.min(need, ammo.reserve);
  ammo.mag += take;
  ammo.reserve -= take;
  game.reloading = false;
}

function swapWeapon(id) {
  if (!WEAPONS[id] || id === game.weaponId) return;
  game.weaponId = id;
  game.currentWeapon = WEAPONS[id];
  weaponView.applyWeapon(id);
  game.reloading = false;
  game.reloadT = 0;
  game.cooldown = Math.max(game.cooldown, 0.35);
  input.swapReq = null;
  updateHud();
}

function botAncestor(obj) {
  let o = obj;
  while (o) {
    if (o.userData && o.userData.bot) return o.userData.bot;
    o = o.parent;
  }
  return null;
}

function playerShoot() {
  const w = game.currentWeapon;
  const ammo = game.ammo[game.weaponId];
  if (game.reloading || ammo.mag <= 0) {
    if (ammo.mag <= 0 && !game.reloading) {
      audio.dryFire();
      game.cooldown = 0.35;
      tryReload();
    }
    return;
  }

  ammo.mag--;
  game.cooldown = 60 / w.rpm;
  weaponView.fire(1);
  audio.shot(w.id === 'dmr' ? 'dmr' : 'carbine');
  shake(0.28);
  game.recoilPitch += w.recoil * (1 - game.adsFactor * 0.45);
  game.recoilYaw += (Math.random() - 0.5) * w.recoilYaw * 2;

  const spread = currentSpread();
  camera.getWorldDirection(_dir);
  _right.setFromMatrixColumn(camera.matrixWorld, 0);
  _up.setFromMatrixColumn(camera.matrixWorld, 1);
  _dir
    .addScaledVector(_right, (Math.random() - 0.5) * 2 * spread)
    .addScaledVector(_up, (Math.random() - 0.5) * 2 * spread)
    .normalize();

  const origin = camera.getWorldPosition(new THREE.Vector3());

  game.rayList.length = 0;
  for (const obj of city.shootables) game.rayList.push(obj);
  for (const b of game.bots) if (b.alive) game.rayList.push(b.root);

  game.ray.set(origin, _dir);
  game.ray.far = w.range;
  const hits = game.ray.intersectObjects(game.rayList, true);

  const muzzle = weaponView.muzzleWorld(new THREE.Vector3());

  let done = false;
  for (const hit of hits) {
    const bot = botAncestor(hit.object);
    if (bot && bot.alive) {
      if (bot.team === player.team) {
        // no friendly fire — round sparks off the gear
        fx.impact(hit.point, hit.face ? hit.face.normal : _up);
        fx.tracer(muzzle, hit.point, 0xffe6b0, 0.05);
        done = true;
        break;
      }
      const headshot = hit.object.userData.zone === 'head';
      const dmg = w.damage * (headshot ? w.headshot : 1);
      bot.takeDamage(dmg, {
        headshot,
        from: player,
        fx,
        point: hit.point.clone(),
      });
      fx.tracer(muzzle, hit.point, 0xffe6b0, 0.06);
      audio.hitmarker();
      showHitmarker();
      done = true;
      break;
    }
    // world geometry blocks the shot
    const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    fx.impact(hit.point, normal);
    fx.tracer(muzzle, hit.point, 0xffd9a0, 0.05);
    done = true;
    break;
  }

  if (!done) {
    // fired into the smoke
    _end.copy(origin).addScaledVector(_dir, Math.min(w.range, 140));
    fx.tracer(muzzle, _end, 0xffd9a0, 0.05);
  }

  // shell + smoke at the muzzle
  fx.muzzleSmoke(muzzle, _dir);
  updateHud();
}

/* --------------------------------------------------------- player tick */
let stepTimer = 0;

function updatePlayer(dt) {
  const w = game.currentWeapon;
  const ammo = game.ammo[game.weaponId];

  /* --- look --- */
  game.yaw += input.look.x;
  game.pitch += input.look.y;
  game.pitch = clamp(game.pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
  input.look.x = 0;
  input.look.y = 0;

  // recoil recovery
  game.recoilPitch *= Math.pow(0.0025, dt);
  game.recoilYaw *= Math.pow(0.0025, dt);

  /* --- aim state --- */
  const wantAim = input.aiming && ammo.mag > 0 && !game.reloading;
  weaponView.update(dt, {
    aiming: wantAim,
    moving: Math.abs(input.move.x) + Math.abs(input.move.y) > 0.05,
    lookDelta: { x: 0, y: 0 },
    ads: wantAim ? 1 : 0,
  });
  game.adsFactor = weaponView.ads;

  /* --- movement --- */
  const kb = touchMode ? { x: stick.x, y: -stick.y } : readKeyboardMove();
  let mx = kb.x;
  let my = kb.y;
  const mag = Math.hypot(mx, my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
  }
  input.move.x = mx;
  input.move.y = my;

  const moving = mag > 0.08;
  player.crouch = input.crouch;
  let speed = 4.4;
  if (input.sprint && !player.crouch && !wantAim && my > 0.2) speed = 6.6;
  if (wantAim) speed *= 0.52;
  else if (game.adsFactor > 0.4) speed *= 0.6;
  if (player.crouch) speed *= 0.55;

  if (moving) {
    const fxDir = -Math.sin(game.yaw);
    const fzDir = -Math.cos(game.yaw);
    const rx = Math.cos(game.yaw);
    const rz = -Math.sin(game.yaw);
    player.position.x += (fxDir * my + rx * mx) * speed * dt;
    player.position.z += (fzDir * my + rz * mx) * speed * dt;
    stepTimer -= dt * (speed / 4.4);
    if (stepTimer <= 0) {
      stepTimer = 0.42;
      audio.step();
    }
  }

  player.position.x = clamp(player.position.x, -128, 128);
  player.position.z = clamp(player.position.z, -128, 128);
  city.resolveCollision(player.position, player.radius, 1.8);
  player.position.y = 0;

  /* --- eye height + bob --- */
  const crouchEye = player.crouch ? 1.06 : 1.62;
  const target = lerp(crouchEye, Math.min(crouchEye, player.aimHeight), game.adsFactor);
  player.currentEye += (target - player.currentEye) * Math.min(1, dt * 12);

  player.bob += dt * (moving ? speed * 2.4 : 2);
  const bobAmt = (moving ? 0.022 : 0.004) * (1 - game.adsFactor * 0.85);
  const bobY = Math.sin(player.bob * 2) * bobAmt;
  const bobX = Math.cos(player.bob) * bobAmt * 0.6;

  player.syncEye();

  /* --- camera --- */
  const sh = shakeAmt * shakeAmt;
  camera.position.set(
    player.position.x + bobX + (Math.random() - 0.5) * sh * 0.09,
    player.position.y + player.currentEye + bobY + (Math.random() - 0.5) * sh * 0.09,
    player.position.z + (Math.random() - 0.5) * sh * 0.09
  );

  // lean while strafing for weight
  const lean = -mx * 0.012 * (1 - game.adsFactor * 0.6);
  camera.rotation.set(
    game.pitch + game.recoilPitch,
    game.yaw + game.recoilYaw,
    lean
  );

  shakeAmt *= Math.pow(0.0009, dt);

  /* --- fov --- */
  const fov = lerp(w.hipFov, w.adsFov, game.adsFactor);
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  /* --- shooting --- */
  game.cooldown -= dt;
  if (input.reloadReq) {
    input.reloadReq = false;
    tryReload();
  }
  if (input.swapReq) swapWeapon(input.swapReq);

  if (game.reloading) {
    game.reloadT -= dt;
    if (game.reloadT <= 0) finishReload();
  }

  const trigger = input.firing;
  const fresh = trigger && !input.prevTrigger;
  input.prevTrigger = trigger;

  if (trigger && game.cooldown <= 0) {
    if (w.auto || fresh) playerShoot();
  }

  /* --- health regen --- */
  const now = performance.now() / 1000;
  if (now - player.lastHurt > 4.5 && player.health < player.maxHealth) {
    player.health = Math.min(player.maxHealth, player.health + 16 * dt);
  }
  player.hurtT = Math.max(0, player.hurtT - dt);
  game.damageFlash = Math.max(player.hurtT / 0.42 + (1 - player.health / 100) * 0.35, game.damageFlash - dt * 1.6);
  game.damageFlash = clamp(game.damageFlash, 0, 1);
}

/* ------------------------------------------------------------ bot tick */
function updateBots(dt) {
  const ctx = { targets: game.combatants, fx, audio };
  for (const bot of game.bots) {
    if (bot.alive) {
      bot.update(dt, ctx);
    } else {
      bot.update(dt, ctx);
      if (!bot.alive && bot.deadT > BOT_RESPAWN) {
        bot.respawn(pickSpawn(bot.team));
      }
    }
  }
}

/* ------------------------------------------------------------ main loop */
const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  // Simulation uses a clamped step so physics stays stable at low frame rates,
  // but the match clock must follow real time or a slow device would never end.
  const matchDt = Math.min(rawDt, 1);
  let dt = rawDt;
  if (dt > 0.06) dt = 0.06;
  elapsed += dt;

  const active = game.state === 'playing';

  if (active) {
    updatePlayer(dt);
    updateBots(dt);
    game.timeLeft -= matchDt;
    if (game.timeLeft <= 0) {
      game.timeLeft = 0;
      endMatch();
    }
  } else if (game.state === 'dead') {
    // keep the world alive while waiting to respawn
    updateBots(dt);
    game.respawnIn -= dt;
    setText('respawnTimer', String(Math.max(0, Math.ceil(game.respawnIn))));
    game.damageFlash = Math.max(0, game.damageFlash - dt);
    const w = game.currentWeapon;
    weaponView.update(dt, { aiming: false, moving: false, lookDelta: { x: 0, y: 0 }, ads: 0 });
    game.adsFactor = weaponView.ads;
    camera.fov = w.hipFov;
    camera.updateProjectionMatrix();
    camera.position.set(player.position.x, player.position.y + 0.42, player.position.z);
    camera.rotation.set(game.pitch, game.yaw, 0.5);
    if (game.respawnIn <= 0) {
      player.respawn(pickSpawn('alpha'));
      rebuildCombatants();
      game.state = 'playing';
      game.damageFlash = 0;
      $('deathOverlay').classList.add('hidden');
      if (!touchMode) lockPointer();
    }
  } else {
    // menu / paused / ended: slow idle camera orbit for presentation
    if (game.state === 'menu') {
      game.yaw += dt * 0.045;
      camera.position.set(Math.sin(game.yaw) * 26, 6.4, Math.cos(game.yaw) * 26);
      camera.lookAt(0, 3, 0);
      game.pitch = 0;
    }
  }

  if (active) {
    player.syncEye();
    updateHud();
  } else if (game.state === 'dead') {
    updateHud();
  }

  city.update(dt, camera, elapsed, player.position);
  fx.update(dt);
  renderer.render(scene, camera);
}

/* --------------------------------------------------------------- wiring */
function init() {
  setupTouch();

  if (touchMode) showTouchUI(true);
  document.body.classList.toggle('touch', touchMode);

  $('deployBtn').addEventListener('click', () => {
    audio.unlock();
    startMatch();
  });

  $('rematchBtn').addEventListener('click', () => {
    startMatch();
  });

  $('slot1').addEventListener('click', () => swapWeapon('carbine'));
  $('slot2').addEventListener('click', () => swapWeapon('dmr'));

  canvas.addEventListener('click', () => {
    if (game.state === 'playing' && !touchMode && !locked) lockPointer();
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') {
      game.state = 'paused';
      $('pauseHint').classList.remove('hidden');
      resetInput();
    }
  });

  // a touch anywhere on the start screen switches to touch layout
  window.addEventListener('touchstart', () => {
    if (!touchMode) showTouchUI(true);
  }, { once: true, passive: true });

  createBots();
  rebuildCombatants();
  weaponView.applyWeapon(game.weaponId);
  camera.position.set(0, 6.4, 26);
  camera.lookAt(0, 3, 0);

  updateHud();
  frame();
}

init();
