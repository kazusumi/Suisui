// BODY BEAT：全体の流れ（カメラ → 全身の確認 → 3・2・1 → プレイ → 結果）
import './style.css';
import { View, Body } from './body.js';
import { createPoseDetector, startCamera } from './pose.js';
import { chart, song } from './chart.js';
import { GameAudio, preloadSong } from './audio.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { createBot } from './bot.js';

const params = new URLSearchParams(location.search);
const BOT = params.has('bot') || params.has('mouse'); // カメラなしで自動プレイ（?mouse は右手をマウスで操作）
const DEBUG = params.has('debug') || BOT; // 骨格を表示

const $ = (s) => document.querySelector(s);
const canvas = $('#stage');
const video = $('#camera');
const view = new View(canvas);
const body = new Body(view);
let audio;
let game;
let renderer;
let detector;
let bot;

let phase = 'title'; // title → loading → calibrate → countdown → play → result
let okSince = 0;
let upperSince = 0;
let countdownAt = 0;
let lastFrame = performance.now();
let lastVideoTime = -1;
let fps = 0;

window.addEventListener('resize', () => view.resize());

function show(id) {
  for (const el of document.querySelectorAll('.overlay')) el.hidden = el.id !== id;
}

function setGuide(text, ok = false) {
  const g = $('#guide');
  g.textContent = text;
  g.classList.toggle('ok', ok);
}

$('#startBtn').addEventListener('click', start);
$('#retryBtn').addEventListener('click', () => {
  game.reset();
  renderer.reset();
  show('none');
  beginCountdown();
});

async function start() {
  show('loading');
  phase = 'loading';
  try {
    audio = new GameAudio();
    await audio.unlock();
    $('#loadingText').textContent = BOT ? '準備中…' : 'カメラを準備しています…';
    if (BOT) {
      bot = createBot(view, chart, { mouse: params.has('mouse') });
    } else {
      await startCamera(video);
      $('#loadingText').textContent = '体の動きを読み取る準備をしています…';
      detector = await createPoseDetector();
    }
    $('#loadingText').textContent = '曲を準備しています…';
    await audio.loadSong();
    game = new Game(chart, audio, body);
    renderer = new Renderer(view, body, game);
    if (DEBUG) window.__bb = { game, body, audio };
    show('calibrate');
    phase = 'calibrate';
    okSince = 0;
    upperSince = 0;
  } catch (e) {
    console.error(e);
    $('#errorText').textContent =
      e?.name === 'NotAllowedError'
        ? 'カメラの使用が許可されませんでした。ブラウザの設定でカメラを許可してから、もう一度お試しください。'
        : `準備に失敗しました：${e?.message ?? e}`;
    show('error');
    phase = 'title';
  }
}

function beginCountdown() {
  phase = 'countdown';
  countdownAt = performance.now();
  for (let i = 0; i < 3; i++) setTimeout(() => audio.sfx('count'), i * 800);
  setTimeout(() => audio.sfx('go'), 2400);
}

function showResult() {
  phase = 'result';
  audio.stop();
  const s = game.stats;
  $('#rScore').textContent = s.score.toLocaleString();
  $('#rPerfect').textContent = s.perfect;
  $('#rGood').textContent = s.good;
  $('#rMiss').textContent = s.miss;
  $('#rCombo').textContent = s.maxCombo;
  const rate = Math.round(((s.perfect + s.good) / game.total) * 100);
  $('#rRate').textContent = `${rate}%`;
  show('result');
}

// ---- 毎フレームの処理 ----
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  fps = fps * 0.9 + (dt ? 1 / dt : 0) * 0.1;
  const c = view.ctx;

  // 背景：カメラ映像（鏡）か、ボットのときは暗いステージ
  if (!BOT && video.readyState >= 2) {
    view.setSource(video.videoWidth, video.videoHeight);
    view.drawVideo(video);
  } else {
    c.fillStyle = '#0b1020';
    c.fillRect(0, 0, view.W, view.H);
  }
  if (phase === 'title' || phase === 'loading' || !game) return;

  const t = phase === 'play' ? audio.time : phase === 'countdown' ? (now - countdownAt) / 1000 - 3 : -3;

  // 骨格
  let landmarks = null;
  let fresh = false;
  if (BOT) {
    landmarks = bot.landmarks(t);
    fresh = true;
  } else if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    landmarks = detector.detect(video, now);
    fresh = true;
  }
  if (fresh) body.update(landmarks, dt, phase === 'play' ? 1.2 : 0.3);

  if (phase === 'calibrate') calibrate(now);
  if (phase === 'countdown') {
    const left = 3 - Math.floor((now - countdownAt) / 800);
    $('#count').textContent = left > 0 ? left : 'START!';
    $('#countWrap').hidden = false;
    if (now - countdownAt > 2400 + 450) {
      $('#countWrap').hidden = true;
      body.calibrate();
      phase = 'play';
      audio.play(() => phase === 'play' && showResult());
    }
  }
  if (phase === 'play') {
    game.update(t);
    if (t > audio.duration + 0.5) showResult();
  }
  if (body.frame) {
    if (BOT) drawDancer();
    renderer.draw(t, dt, { debug: DEBUG && !BOT });
    if (phase === 'play') renderer.drawHud(t, audio.duration);
  }
  if (DEBUG) {
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(view.W - 150, view.H - 56, 150, 56);
    c.fillStyle = '#fff';
    c.font = '12px monospace';
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText(`fps ${fps.toFixed(0)}  t ${t.toFixed(2)}`, view.W - 144, view.H - 50);
    c.fillText(`${phase} full:${body.visibleFull ? 'Y' : 'n'}`, view.W - 144, view.H - 32);
  }
}
requestAnimationFrame(loop);

// 全身が 1 秒映ったら開始。上半身しか映らないまま 5 秒たったら、そのまま開始する
function calibrate(now) {
  if (body.visibleFull) {
    upperSince = 0;
    if (!okSince) okSince = now;
    setGuide('OK！ そのまま…', true);
    if (now - okSince > 1000) {
      body.calibrate();
      show('none');
      beginCountdown();
    }
  } else if (body.visibleUpper) {
    okSince = 0;
    if (!upperSince) upperSince = now;
    setGuide('もう少し下がって、足まで映るようにしてね');
    if (now - upperSince > 5000) {
      show('none');
      beginCountdown();
    }
  } else {
    okSince = 0;
    upperSince = 0;
    setGuide('カメラの前に立ってね');
  }
}

// ボットのときは体を棒人間で描く
function drawDancer() {
  const j = body.joints;
  if (!j) return;
  const c = view.ctx;
  const u = body.frame.u;
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(226,232,240,0.9)';
  c.lineWidth = u * 0.16;
  const line = (a, b, d) => { c.beginPath(); c.moveTo(j[a].x, j[a].y); c.lineTo(j[b].x, j[b].y); if (d) c.lineTo(j[d].x, j[d].y); c.stroke(); };
  line('lShoulder', 'rShoulder');
  line('lShoulder', 'lElbow', 'lWrist');
  line('rShoulder', 'rElbow', 'rWrist');
  line('shoulderMid', 'hipMid');
  line('lHip', 'rHip');
  line('lHip', 'lKnee', 'lAnkle');
  line('rHip', 'rKnee', 'rAnkle');
  c.fillStyle = 'rgba(226,232,240,0.9)';
  c.beginPath();
  c.arc(j.nose.x, j.nose.y - u * 0.1, u * 0.28, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

show('title');
preloadSong().catch((e) => console.error('曲の先読みに失敗', e));
$('#songInfo').textContent = song.title;
