import { Map as MapLibre, Marker, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// 地図の描画用 Worker を Vite に1ファイルへまとめさせ、その URL を MapLibre に渡す
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import './style.css';
import { api, TEAM_LABEL, TEAM_COLOR, RARITY_LABEL, escapeHtml, distanceM, toast } from './api.js';

const REACH_M = 80; // この距離以内ならハック・捕獲できる
const RELOAD_MOVE_M = 300; // これ以上動いたら周辺データを読み直す
const DEFAULT_POS = { lat: 35.681236, lng: 139.767125 }; // 位置情報が使えない時（東京駅）
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'; // 無料・APIキー不要
const PITCH = 60; // 地図の傾き（0 で真上から）

const $ = (s) => document.querySelector(s);
const state = {
  player: null,
  pos: null,
  loadedAt: null, // 最後に周辺データを読んだ位置
  world: { portals: [], gyms: [], spawns: [] },
  testMode: localStorage.getItem('mg.testMode') === '1',
  followMe: true,
  selected: null,
};

// ---------- 地図（MapLibre：傾けた 3D 表示） ----------
setWorkerUrl(workerUrl);
const map = new MapLibre({
  container: 'map',
  style: MAP_STYLE,
  center: [DEFAULT_POS.lng, DEFAULT_POS.lat],
  zoom: 17,
  pitch: PITCH,
  maxPitch: 70,
  attributionControl: { compact: true },
});

map.on('load', () => {
  addBuildings3d();
  // 操作できる範囲（80 m）の円
  map.addSource('reach', { type: 'geojson', data: circleGeoJson(state.pos ?? DEFAULT_POS, REACH_M) });
  map.addLayer({ id: 'reach-fill', type: 'fill', source: 'reach', paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.12 } });
  map.addLayer({ id: 'reach-line', type: 'line', source: 'reach', paint: { 'line-color': '#38bdf8', 'line-width': 1.5 } });
});

// スタイルに立体の建物がなければ、建物データから立ち上げる
function addBuildings3d() {
  const layers = map.getStyle().layers ?? [];
  if (layers.some((l) => l.type === 'fill-extrusion')) return;
  if (!map.getSource('openmaptiles')) return;
  map.addLayer({
    id: 'mg-buildings-3d',
    type: 'fill-extrusion',
    source: 'openmaptiles',
    'source-layer': 'building',
    minzoom: 14,
    paint: {
      'fill-extrusion-color': '#cbd5e1',
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.85,
    },
  });
}

function circleGeoJson(center, radiusM, steps = 64) {
  const coords = [];
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    coords.push([center.lng + dLng * Math.cos(a), center.lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
}

map.on('dragstart', () => (state.followMe = false));
map.on('click', (e) => {
  if (state.testMode) setPos({ lat: e.lngLat.lat, lng: e.lngLat.lng });
  closeSheet();
});

// MapLibre はマーカー要素そのものの transform を使うので、見た目は内側の要素に付ける
function makeMarker(obj, html, cls, onClick) {
  const el = document.createElement('div');
  el.innerHTML = `<div class="mk ${cls}">${html}</div>`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return new Marker({ element: el }).setLngLat([obj.lng, obj.lat]).addTo(map);
}

const meEl = document.createElement('div');
meEl.innerHTML = '<div class="me"></div>';
const meMarker = new Marker({ element: meEl });
let worldMarkers = [];

function renderWorld() {
  worldMarkers.forEach((m) => m.remove());
  worldMarkers = [];
  for (const p of state.world.portals) {
    const cooling = p.ready_at && new Date(p.ready_at) > new Date();
    worldMarkers.push(makeMarker(p, '💠', `mk-portal${cooling ? ' cooling' : ''}`, () => openSheet('portal', p)));
  }
  for (const g of state.world.gyms) {
    worldMarkers.push(makeMarker(g, '🏟️', `mk-gym team-${g.team || 'none'}`, () => openSheet('gym', g)));
  }
  for (const s of state.world.spawns) {
    const cls = `mk-spawn rarity-${s.rarity}${s.caught ? ' caught' : ''}`;
    worldMarkers.push(makeMarker(s, escapeHtml(s.emoji), cls, () => openSheet('spawn', s)));
  }
}

async function loadWorld() {
  if (!state.pos) return;
  try {
    const q = new URLSearchParams({ lat: state.pos.lat, lng: state.pos.lng });
    if (state.player) q.set('player', state.player.id);
    state.world = await api(`world?${q}`);
    state.loadedAt = { ...state.pos };
    renderWorld();
    if (state.selected) {
      // 開いている詳細を最新データで描き直す
      const list = { portal: 'portals', gym: 'gyms', spawn: 'spawns' }[state.selected.kind];
      const fresh = state.world[list].find((o) => o.id === state.selected.obj.id);
      if (fresh) openSheet(state.selected.kind, fresh);
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

function setPos(pos) {
  state.pos = pos;
  localStorage.setItem('mg.lastPos', JSON.stringify(pos));
  meMarker.setLngLat([pos.lng, pos.lat]).addTo(map);
  map.getSource('reach')?.setData(circleGeoJson(pos, REACH_M));
  if (state.followMe) map.easeTo({ center: [pos.lng, pos.lat] });
  if (!state.loadedAt || distanceM(state.loadedAt, pos) > RELOAD_MOVE_M) loadWorld();
  if (state.selected) openSheet(state.selected.kind, state.selected.obj);
}

// ---------- 位置情報 ----------
function lastPos() {
  try {
    const p = JSON.parse(localStorage.getItem('mg.lastPos'));
    return Number.isFinite(p?.lat) && Number.isFinite(p?.lng) ? p : null;
  } catch {
    return null;
  }
}

function startGeolocation() {
  if (!navigator.geolocation) {
    fallbackPos('この端末では位置情報が使えません');
    return;
  }
  navigator.geolocation.watchPosition(
    (p) => {
      if (!state.testMode) setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
    },
    (err) => fallbackPos(`位置情報が取得できません（${err.message}）`),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
  );
}

function fallbackPos(msg) {
  if (state.pos) return;
  toast(`${msg}。テストモードで開始します`, 'error');
  setTestMode(true);
  setPos(lastPos() ?? DEFAULT_POS);
}

function setTestMode(on) {
  state.testMode = on;
  localStorage.setItem('mg.testMode', on ? '1' : '0');
  $('#testBanner').hidden = !on;
  $('#testBtn').classList.toggle('active', on);
  if (state.selected) openSheet(state.selected.kind, state.selected.obj);
}

$('#testBtn').addEventListener('click', () => {
  setTestMode(!state.testMode);
  toast(state.testMode ? 'テストモード ON：地図をタップして移動' : 'テストモード OFF：GPSの位置を使います');
});
$('#locateBtn').addEventListener('click', () => {
  state.followMe = true;
  if (state.pos) map.easeTo({ center: [state.pos.lng, state.pos.lat], zoom: Math.max(map.getZoom(), 17), pitch: PITCH });
});

// ---------- プレイヤー ----------
function renderHud() {
  const p = state.player;
  $('.player-name').textContent = p ? p.name : '---';
  $('.team-dot').style.background = p ? TEAM_COLOR[p.team] : '#94a3b8';
  $('#ballCount').textContent = p ? p.balls : 0;
}

async function restorePlayer() {
  const id = localStorage.getItem('mg.playerId');
  if (!id) return showLogin();
  try {
    state.player = await api(`player/${id}`);
    renderHud();
    loadWorld();
  } catch (e) {
    if (e.status === 404) localStorage.removeItem('mg.playerId');
    else toast(e.message, 'error');
    showLogin();
  }
}

function showLogin() {
  $('#loginModal').hidden = false;
  $('#loginForm [name=name]').focus();
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    state.player = await api('player', { method: 'POST', body: { name: fd.get('name'), team: fd.get('team') } });
    localStorage.setItem('mg.playerId', state.player.id);
    $('#loginModal').hidden = true;
    renderHud();
    toast(`ようこそ ${state.player.name} さん（${TEAM_LABEL[state.player.team]}チーム）`);
    loadWorld();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('#playerChip').addEventListener('click', () => {
  if (!state.player) return showLogin();
  if (confirm(`${state.player.name} さんからログアウトしますか？`)) {
    localStorage.removeItem('mg.playerId');
    state.player = null;
    renderHud();
    showLogin();
  }
});

// ---------- 詳細シート ----------
function distanceText(obj) {
  if (!state.pos) return { d: Infinity, text: '現在地不明' };
  const d = distanceM(state.pos, obj);
  return { d, text: d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km` };
}

function reachable(obj) {
  return state.testMode || distanceText(obj).d <= REACH_M;
}

function openSheet(kind, obj) {
  state.selected = { kind, obj };
  const { text } = distanceText(obj);
  const near = reachable(obj);
  const far = near ? '' : `<p class="warn">あと ${Math.round(distanceText(obj).d - REACH_M)} m 近づこう（${REACH_M} m 以内）</p>`;
  let html = '';
  if (kind === 'portal') {
    const cooling = obj.ready_at && new Date(obj.ready_at) > new Date();
    const wait = cooling ? Math.ceil((new Date(obj.ready_at) - new Date()) / 60000) : 0;
    html = `
      <div class="sheet-head"><span class="sheet-icon">💠</span><div><h2>${escapeHtml(obj.name)}</h2><p class="muted">ポータル ・ ${text}</p></div></div>
      ${obj.description ? `<p>${escapeHtml(obj.description)}</p>` : ''}
      ${far}
      <button class="btn primary wide" data-act="hack" ${!near || cooling ? 'disabled' : ''}>
        ${cooling ? `回復中（あと約${wait}分）` : 'ハックしてボールを手に入れる'}
      </button>`;
  } else if (kind === 'gym') {
    const mine = state.player && obj.team === state.player.team;
    html = `
      <div class="sheet-head"><span class="sheet-icon">🏟️</span><div><h2>${escapeHtml(obj.name)}</h2><p class="muted">ジム ・ ${text}</p></div></div>
      <p>支配チーム：${obj.team ? `<span class="team ${obj.team}">${TEAM_LABEL[obj.team]}</span>` : 'なし'}
        ${obj.owner_name ? `（${escapeHtml(obj.owner_name)}）` : ''}</p>
      ${far}
      <button class="btn primary wide" data-act="claim" ${!near || mine ? 'disabled' : ''}>
        ${mine ? '自分のチームのジムです' : 'ジムを占領する'}
      </button>`;
  } else {
    html = `
      <div class="sheet-head"><span class="sheet-icon">${escapeHtml(obj.emoji)}</span><div><h2>${escapeHtml(obj.name)}</h2>
        <p class="muted">${RARITY_LABEL[obj.rarity] ?? obj.rarity} ・ 捕獲率 ${obj.catch_rate}% ・ ${text}</p></div></div>
      ${obj.description ? `<p>${escapeHtml(obj.description)}</p>` : ''}
      ${far}
      <button class="btn primary wide" data-act="catch" ${!near || obj.caught ? 'disabled' : ''}>
        ${obj.caught ? '捕獲済み' : '捕まえる！'}
      </button>`;
  }
  $('#sheet .sheet-body').innerHTML = html;
  $('#sheet').hidden = false;
}

function closeSheet() {
  state.selected = null;
  $('#sheet').hidden = true;
}
$('#sheet .sheet-close').addEventListener('click', closeSheet);

$('#sheet').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || !state.selected) return;
  if (!state.player) return showLogin();
  const { obj } = state.selected;
  if (btn.dataset.act === 'catch') return openRoulette(obj);
  btn.disabled = true;
  try {
    if (btn.dataset.act === 'hack') {
      const r = await api('hack', { method: 'POST', body: { playerId: state.player.id, portalId: obj.id } });
      state.player.balls = r.balls;
      toast(`ハック成功！ ボールを ${r.gained} 個手に入れた`);
    } else if (btn.dataset.act === 'claim') {
      const r = await api('gym/claim', { method: 'POST', body: { playerId: state.player.id, gymId: obj.id } });
      toast(`${r.name} を ${TEAM_LABEL[r.team]}チームのものにした！`);
    }
    renderHud();
    await loadWorld();
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
  }
});

// ---------- 捕獲ルーレット ----------
const wheel = $('.wheel');
let wheelDeg = 0;
let rouletteTarget = null;
let spinning = false;

function openRoulette(spawn) {
  rouletteTarget = spawn;
  const rate = spawn.catch_rate;
  // 時計回りに 0〜rate% が「GET」、残りが「にげた」
  wheel.style.background = `conic-gradient(#22c55e 0 ${rate}%, #ef4444 ${rate}% 100%)`;
  wheel.querySelector('.win').style.transform = labelTransform((rate / 100) * 180);
  wheel.querySelector('.lose').style.transform = labelTransform(((rate + 100) / 100) * 180);
  wheel.querySelector('.lose').hidden = rate >= 100;
  $('.roulette-monster .big-emoji').textContent = spawn.emoji;
  $('.roulette-name').textContent = `${spawn.name}（捕獲率 ${rate}%）`;
  $('.roulette-msg').textContent = 'ボールを投げてルーレットを回そう！';
  $('.roulette-msg').className = 'roulette-msg';
  $('#spinBtn').disabled = false;
  $('#spinBtn').hidden = false;
  $('#rouletteModal').hidden = false;
}

function labelTransform(deg) {
  return `translate(-50%, -50%) rotate(${deg}deg) translateY(-62px)`;
}

$('#spinBtn').addEventListener('click', async () => {
  if (spinning || !rouletteTarget) return;
  spinning = true;
  $('#spinBtn').disabled = true;
  $('.roulette-msg').textContent = 'くるくる……';
  $('.roulette-msg').className = 'roulette-msg';
  let result;
  try {
    result = await api('capture', { method: 'POST', body: { playerId: state.player.id, spawnId: rouletteTarget.id } });
  } catch (err) {
    spinning = false;
    $('#spinBtn').disabled = false;
    $('.roulette-msg').textContent = err.message;
    $('.roulette-msg').className = 'roulette-msg lose';
    return;
  }
  // サーバーが決めた結果の範囲に針が止まるよう回転角を決める
  const rate = result.catchRate;
  const [from, to] = result.success ? [0, rate * 3.6] : [rate * 3.6, 360];
  const margin = Math.min(6, (to - from) / 4);
  const target = from + margin + Math.random() * (to - from - margin * 2);
  const current = ((wheelDeg % 360) + 360) % 360;
  wheelDeg += 360 * 5 + ((360 - target - current + 720) % 360);
  wheel.style.transform = `rotate(${wheelDeg}deg)`;
  setTimeout(() => {
    spinning = false;
    state.player.balls = result.balls;
    renderHud();
    const msg = $('.roulette-msg');
    if (result.success) {
      msg.textContent = `やった！ ${result.monster.name} をつかまえた！`;
      msg.className = 'roulette-msg win';
      $('#spinBtn').hidden = true;
      rouletteTarget.caught = true;
      loadWorld();
    } else {
      msg.textContent = `にげられた……（のこりボール ${result.balls} 個）`;
      msg.className = 'roulette-msg lose';
      $('#spinBtn').disabled = false;
    }
  }, 3200);
});

$('#rouletteClose').addEventListener('click', () => {
  if (spinning) return;
  $('#rouletteModal').hidden = true;
  if (state.selected) openSheet(state.selected.kind, state.selected.obj);
});

// ---------- 図鑑 ----------
$('#dexBtn').addEventListener('click', async () => {
  if (!state.player) return showLogin();
  try {
    const r = await api(`collection?player=${state.player.id}`);
    const caught = r.monsters.filter((m) => m.caught > 0);
    $('#dexCount').textContent = `${caught.length} / ${r.totalKinds} 種類`;
    $('#dexList').innerHTML = r.monsters.length
      ? r.monsters
          .map(
            (m) => `<li class="${m.caught ? '' : 'missed'}">
              <span class="dex-emoji">${escapeHtml(m.emoji)}</span>
              <span class="dex-name">${escapeHtml(m.name)}<small>${RARITY_LABEL[m.rarity] ?? ''}</small></span>
              <span class="dex-num">${m.caught} 匹 <small>/ ${m.tries} 回</small></span>
            </li>`,
          )
          .join('')
      : '<li class="empty">まだ何も捕まえていません</li>';
    $('#dexModal').hidden = false;
  } catch (err) {
    toast(err.message, 'error');
  }
});
document.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', () => (b.closest('.modal').hidden = true)),
);

// ---------- 起動 ----------
setTestMode(state.testMode);
renderHud();
restorePlayer();
if (state.testMode) setPos(lastPos() ?? DEFAULT_POS);
startGeolocation();
setInterval(loadWorld, 30000);
