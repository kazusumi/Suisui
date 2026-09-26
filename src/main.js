import * as THREE from 'three';
import { U } from './globals.js';
import { PRESETS, autoQuality, pixelRatioFor, isMobile } from './quality.js';
import { waveHeight } from './waves.js';
import { createSky } from './world/sky.js';
import { createTerrain, bakeWaterData } from './world/terrain.js';
import { createCity } from './world/city.js';
import { Water } from './world/water.js';
import { createGlows, glowScale } from './fx/glows.js';
import { createSnow, Bubbles, createShafts } from './fx/particles.js';
import { Fish, createSeaweed, Birds, Floaters, fishGeometry } from './fx/life.js';
import { Rides } from './fx/rides.js';
import { WhaleShark, Rays, Dolphins, Splashes, SurfaceBirds, SwanBoats, JumpingFish, FloatingBooks } from './fx/sealife.js';
import { Post } from './post.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Tour, VIEWS } from './tour.js';
import { Minimap } from './minimap.js';

const $ = (id) => document.getElementById(id);
const showError = (msg) => {
  const el = $('err');
  el.textContent = msg;
  el.classList.remove('hidden');
};
addEventListener('error', (e) => showError(`Error: ${e.message}`));

if (isMobile) document.body.classList.add('touch');

// ---------------- renderer ----------------
const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
} catch (e) {
  showError('WebGL2 が利用できません。対応ブラウザでお試しください。');
  throw e;
}
renderer.toneMapping = THREE.NoToneMapping;
const ext = renderer.extensions;
const hdrOK = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');

let mode = 'AUTO';
let qName = autoQuality();
let preset = PRESETS[qName];

// ---------------- scene ----------------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.08, 2600);
scene.add(camera);

const sky = createSky();
scene.add(sky);

const hemi = new THREE.HemisphereLight(0xffc7a0, 0x1d4a55, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffa56b, 2.6);
sun.position.copy(U.uSunDir.value).multiplyScalar(100);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x6f7fc4, 0.45);
fill.position.set(0.6, 0.5, 0.7);
scene.add(fill);

const terrain = createTerrain();
scene.add(terrain);
const city = createCity(preset);
scene.add(city.group);
const waterData = bakeWaterData(city.surfaceObstacles);
const water = new Water(waterData, preset);
if (!hdrOK) water.rt.texture.type = THREE.UnsignedByteType;
scene.add(water.mesh);

const glows = createGlows(city.glows);
const blinks = createGlows(city.blinkers);
scene.add(glows, blinks);

const snow = createSnow(1800);
const bubbles = new Bubbles(500, city.spots.vents);
const shafts = createShafts(16);
const fish = new Fish(city.spots.schools, preset.fish);
const seaweed = createSeaweed(1);
const seaweedMax = seaweed.count;
const birds = new Birds(14);
const floaters = new Floaters(city.colliders);
scene.add(snow, bubbles.points, shafts, fish.mesh, seaweed, birds.mesh, floaters.group);

const rides = new Rides();
const whaleShark = new WhaleShark();
const rays = new Rays();
const splashes = new Splashes();
// a leap or a jumping fish close by is also heard
const splashNear = (x, z, gain) => {
  const d = Math.hypot(x - camera.position.x, z - camera.position.z);
  if (d < 40) audio.splash(gain * Math.max(0.15, 1 - d / 40));
};
const dolphins = new Dolphins(splashes, (x, z) => splashNear(x, z, 0.8));
const surfaceBirds = new SurfaceBirds(city.colliders);
const swans = new SwanBoats();
const jumpers = new JumpingFish(fishGeometry(), splashes, (x, z) => splashNear(x, z, 0.35));
const books = new FloatingBooks(city.bookSpot);
scene.add(rides.group, whaleShark.mesh, rays.mesh, splashes.points, dolphins.mesh, surfaceBirds.group, swans.mesh, jumpers.mesh, books.mesh);

const post = new Post(renderer, hdrOK);

// ---------------- player / input / audio ----------------
const input = new Input(canvas, { stick: $('stick'), knob: $('knob'), up: $('btnUp'), down: $('btnDown') });
const player = new Player(camera, city.colliders);
const audio = new Audio();
const tour = new Tour(city.colliders);
const minimap = new Minimap($('minimap'), city, tour);

// ---------------- quality ----------------
function resize() {
  const dpr = pixelRatioFor(preset) * (preset.scale || 1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  post.setSize(size.x, size.y);
  glowScale.value = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
}

function applyQuality(name) {
  qName = name;
  preset = { ...PRESETS[name] };
  water.setQuality(preset);
  snow.setCount(preset.snow);
  shafts.setCount(preset.shafts);
  bubbles.setLimit(preset.bubbles);
  fish.setFactor(preset.fish);
  seaweed.count = Math.floor(seaweedMax * preset.seaweed);
  U.uCausticIter.value = preset.causticIter;
  post.uniforms.uDistort.value = name === 'LOW' ? 0.5 : 1;
  camera.far = name === 'LOW' ? 1400 : 2600;
  resize();
  $('btnQuality').textContent = mode === 'AUTO' ? `AUTO·${name[0]}` : name;
}
applyQuality(qName);
addEventListener('resize', resize);

// ---------------- UI ----------------
let started = false;
let paused = false;
const startEl = $('start');
const goBtn = $('go');
const qButtons = [...document.querySelectorAll('#quality button')];
qButtons.forEach((b) =>
  b.addEventListener('click', () => {
    qButtons.forEach((x) => x.classList.toggle('sel', x === b));
    mode = b.dataset.q;
    applyQuality(mode === 'AUTO' ? autoQuality() : mode);
  })
);

const touchUI = () => isMobile || input.isTouch;
function begin(withTour = false) {
  startEl.classList.add('fade');
  $('hud').classList.remove('hidden');
  if (touchUI()) {
    $('touchui').classList.remove('hidden');
    $('hint').textContent = '左スティックで泳ぐ · 右スワイプで見回す · ▼で潜る';
  } else if (!withTour && camMode === 'swim') {
    canvas.requestPointerLock?.();
  }
  if (withTour === true && camMode !== 'tour') setMode('tour');
  else if (camMode === 'tour') showTourHint();
  input.enabled = true;
  started = true;
  paused = false;
  audio.start();
  perf.reset();
  setTimeout(() => $('hint').classList.add('gone'), 7000);
}
goBtn.addEventListener('click', () => begin(false));
$('goTour').addEventListener('click', () => begin(true));

$('btnMenu').addEventListener('click', () => {
  paused = true;
  input.enabled = false;
  input.release();
  document.exitPointerLock?.();
  goBtn.textContent = 'RESUME';
  startEl.classList.remove('fade');
});
$('btnSound').addEventListener('click', (e) => {
  audio.setMuted(!audio.muted);
  e.currentTarget.classList.toggle('off', audio.muted);
});
$('btnQuality').addEventListener('click', () => {
  const order = ['HIGH', 'MEDIUM', 'LOW'];
  mode = order[(order.indexOf(qName) + 1) % order.length];
  qButtons.forEach((x) => x.classList.toggle('sel', x.dataset.q === mode));
  applyQuality(mode);
});
document.addEventListener('pointerlockchange', () => {
  if (!started || paused || isMobile) return;
  const locked = document.pointerLockElement === canvas;
  const hint = $('hint');
  if (!locked) {
    hint.textContent = 'クリックで操作再開';
    hint.classList.remove('gone');
  } else hint.classList.add('gone');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) input.release();
});

// ---------------- modes: free swim <-> auto tour ----------------
let camMode = 'swim';
const blend = { t: 1, fromPos: new THREE.Vector3(), fromQuat: new THREE.Quaternion() };
const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);
function startBlend() {
  blend.t = 0;
  blend.fromPos.copy(camera.position);
  blend.fromQuat.copy(camera.quaternion);
}
function showTourHint() {
  const hint = $('hint');
  hint.textContent = touchUI() ? 'スワイプで見回す · 下のボタンで視点と速度' : 'ドラッグで見回す · 1/2/3で視点 · Pで一時停止';
  hint.classList.remove('gone');
  clearTimeout(showTourHint.t);
  showTourHint.t = setTimeout(() => hint.classList.add('gone'), 6000);
}
function setMode(m) {
  if (m === camMode) return;
  startBlend();
  camMode = m;
  const touring = m === 'tour';
  input.tourMode = touring;
  input.release();
  document.body.classList.toggle('touring', touring);
  $('tourbar').classList.toggle('hidden', !touring);
  $('btnMode').textContent = touring ? '🏊 自由に泳ぐ' : '🧭 ツアー';
  if (touring) {
    document.exitPointerLock?.();
    tour.enterFrom(camera);
    syncTourUI();
    showTourHint();
  } else {
    // drop into the water right where the camera is
    const p = camera.position;
    const surf = waveHeight(p.x, p.z, time);
    player.pos.set(p.x, Math.min(p.y, surf + 0.2), p.z);
    player.vel.set(0, 0, 0);
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    player.yaw = e.y;
    player.pitch = THREE.MathUtils.clamp(e.x, -1.2, 1.2);
    const hint = $('hint');
    hint.textContent = touchUI() ? '左スティックで泳ぐ · ▼で潜る' : 'クリックして WASD で泳ぐ · SHIFTで潜る';
    hint.classList.remove('gone');
    clearTimeout(showTourHint.t);
    showTourHint.t = setTimeout(() => hint.classList.add('gone'), 5000);
  }
}
function syncTourUI() {
  document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('sel', b.dataset.v === tour.view));
  document.querySelectorAll('#speeds button').forEach((b) => b.classList.toggle('sel', Number(b.dataset.s) === tour.speedIdx));
}
$('btnMode').addEventListener('click', () => setMode(camMode === 'tour' ? 'swim' : 'tour'));
document.querySelectorAll('#views button').forEach((b) =>
  b.addEventListener('click', () => {
    tour.setView(b.dataset.v);
    syncTourUI();
  })
);
document.querySelectorAll('#speeds button').forEach((b) =>
  b.addEventListener('click', () => {
    tour.setSpeed(Number(b.dataset.s));
    syncTourUI();
  })
);
addEventListener('keydown', (e) => {
  if (!started || paused) return;
  if (e.code === 'KeyT') setMode(camMode === 'tour' ? 'swim' : 'tour');
  if (camMode !== 'tour') return;
  const views = ['sub', 'boat', 'air'];
  if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) tour.setView(views[Number(e.code.slice(5)) - 1]);
  if (e.code === 'KeyP') tour.setSpeed(tour.speedIdx === 0 ? 2 : 0);
  if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.code === 'BracketRight') tour.setSpeed(Math.max(1, tour.speedIdx + 1));
  if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.code === 'BracketLeft') tour.setSpeed(tour.speedIdx - 1);
  syncTourUI();
});

// ---------------- adaptive performance ----------------
const perf = {
  frames: 0,
  time: 0,
  checks: 0,
  reset() {
    this.frames = 0;
    this.time = 0;
  },
  tick(dt) {
    this.frames++;
    this.time += dt;
    if (this.time < 3) return;
    const fps = this.frames / this.time;
    $('fps').textContent = `${fps.toFixed(0)} fps · ${qName}`;
    this.reset();
    if (mode !== 'AUTO' || !started || paused) return;
    const target = isMobile ? 28 : 48;
    if (fps < target) {
      if (qName === 'HIGH') applyQuality('MEDIUM');
      else if (qName === 'MEDIUM') applyQuality('LOW');
      else if ((preset.scale || 1) > 0.7) {
        preset.scale = (preset.scale || 1) - 0.15;
        resize();
      }
    }
  },
};

// ---------------- loop ----------------
const timer = new THREE.Timer();
timer.connect(document);
let time = 0;
let wasUnder = false;
let sinceToggle = 10;
let breath = 2;
let underFade = 0;
const depthEl = $('depthVal');

function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  time += dt;
  U.uTime.value = time;

  if (started && !paused) {
    input.update();
  } else {
    input.move.x = input.move.y = input.vert = 0;
    input.look.x = input.look.y = 0;
    if (!started) player.yaw = Math.sin(time * 0.06) * 0.22 + 0.08;
  }
  if (camMode === 'tour') {
    if (!paused) tour.update(dt, time, input, camera);
  } else {
    player.update(dt, time, input);
  }
  // every mode switch glides from the old camera pose to the new one
  if (blend.t < 1) {
    blend.t = Math.min(1, blend.t + dt / 3);
    const e = smoother(blend.t);
    camera.position.lerpVectors(blend.fromPos, camera.position, e);
    camera.quaternion.slerpQuaternions(blend.fromQuat, camera.quaternion.clone(), e);
  }
  camera.updateMatrixWorld();
  const touring = camMode === 'tour';
  const fxPos = touring ? camera.position : player.pos;
  const fxSpeed = touring ? tour.speed : player.speed;

  const surf = waveHeight(camera.position.x, camera.position.z, time);
  const rel = camera.position.y - surf;
  // hysteresis so bobbing right at the waterline doesn't flicker the global state
  const under = wasUnder ? rel < 0.03 : rel < -0.03;
  const depth = Math.max(0, -rel);
  sinceToggle += dt;
  if (under !== wasUnder) {
    // splash / droplets only for real dives and resurfacings, not for waves lapping the lens
    if (sinceToggle > 0.9) {
      audio.splash(under ? 1 : 0.7);
      if (under) bubbles.emit(camera.position.x, camera.position.y - 0.3, camera.position.z, 26, 0.9, 1.4);
      else post.uniforms.uDrops.value = 1;
    }
    sinceToggle = 0;
    wasUnder = under;
  }
  post.uniforms.uDrops.value = Math.max(0, post.uniforms.uDrops.value - dt * 0.6);
  underFade += ((under ? 1 : 0) - underFade) * Math.min(dt * 5, 1);
  U.uUnderFade.value = underFade;

  if (under && started) {
    breath -= dt;
    if (breath < 0) {
      breath = 2.5 + Math.random() * 2;
      const f = camera.getWorldDirection(new THREE.Vector3());
      bubbles.emit(camera.position.x + f.x * 0.4, camera.position.y + 0.1, camera.position.z + f.z * 0.4, 6 + ((Math.random() * 6) | 0), 0.15, 0.9);
    }
  }

  sky.position.copy(camera.position);
  water.update(camera);
  fish.update(dt, time, fxPos, fxSpeed);
  bubbles.update(dt, time, fxPos);
  birds.update(time);
  floaters.update(dt, time, fxPos);
  rides.update(time);
  whaleShark.update(dt, time);
  rays.update(dt, time);
  dolphins.update(dt, time);
  surfaceBirds.update(dt, time, fxPos);
  swans.update(dt, time);
  jumpers.update(dt, time, camera);
  books.update(dt, time);
  splashes.update(dt);
  audio.update(dt, under, depth, started && !touring ? player.speed : 0, Math.max(0, rel));

  // reflection pass (above water only)
  U.uCamUnder.value = 0;
  water.renderReflection(renderer, scene, camera, [water.mesh, snow, bubbles.points, shafts, fish.mesh, seaweed, terrain, rides.group, whaleShark.mesh, rays.mesh]);
  U.uCamUnder.value = under ? 1 : 0;

  post.uniforms.uUnder.value = under ? 1 : 0;
  post.render(scene, camera);

  depthEl.textContent = under ? `DEPTH ${depth.toFixed(1)} m` : rel > 4 ? `ALT ${rel.toFixed(0)} m` : 'SURFACE';
  if (started) minimap.draw(camera, touring);
  perf.tick(dt);
  requestAnimationFrame(frame);
}

// warm up shaders, then let the user in
requestAnimationFrame(() => {
  try {
    renderer.compile(scene, camera);
  } catch (e) {
    showError(String(e));
  }
  frame();
  goBtn.disabled = false;
  goBtn.textContent = 'DIVE IN';
  $('goTour').disabled = false;
});

// debug hook for automated checks (only with ?debug in the URL)
if (location.search.includes('debug')) window.__sc = { player, camera, applyQuality, begin, renderer, scene, post, tour, setMode, VIEWS, blend, whaleShark, dolphins, city, rays, swans };
if (location.search.includes('debug')) import('./tour.js').then((m) => (window.__lm = m.LANDMARKS));
