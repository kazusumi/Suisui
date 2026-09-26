import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './admin.css';
import { api, TEAM_LABEL, RARITY_LABEL, escapeHtml, toast } from './api.js';
import { requireAdmin, adminPassword } from './auth.js';

const $ = (s) => document.querySelector(s);
const call = (path, opts = {}) => api(path, { ...opts, admin: adminPassword() });

// 各タブのフォーム項目と一覧の列
const TABS = {
  portals: {
    label: 'ポータル',
    fields: [
      { name: 'name', label: '名前', type: 'text', required: true },
      { name: 'description', label: '説明', type: 'textarea' },
      { name: 'lat', label: '緯度', type: 'coord', required: true },
      { name: 'lng', label: '経度', type: 'coord', required: true },
    ],
    columns: ['id', 'name', 'description', 'lat', 'lng'],
    marker: () => '💠',
  },
  gyms: {
    label: 'ジム',
    fields: [
      { name: 'name', label: '名前', type: 'text', required: true },
      { name: 'lat', label: '緯度', type: 'coord', required: true },
      { name: 'lng', label: '経度', type: 'coord', required: true },
      {
        name: 'team', label: '支配チーム', type: 'select',
        options: [['', 'なし'], ...Object.entries(TEAM_LABEL)],
      },
    ],
    columns: ['id', 'name', 'team', 'owner_name', 'lat', 'lng'],
    marker: () => '🏟️',
  },
  monsters: {
    label: 'モンスター',
    fields: [
      { name: 'name', label: '名前', type: 'text', required: true },
      { name: 'emoji', label: '絵文字（見た目）', type: 'text', required: true, placeholder: '🐲' },
      { name: 'rarity', label: 'レア度', type: 'select', options: Object.entries(RARITY_LABEL) },
      { name: 'catch_rate', label: '捕獲率（%・ルーレットの当たりの大きさ）', type: 'number', min: 1, max: 100, required: true, value: 50 },
      { name: 'description', label: '説明', type: 'textarea' },
    ],
    columns: ['id', 'emoji', 'name', 'rarity', 'catch_rate', 'description'],
  },
  spawns: {
    label: '出現地点',
    fields: [
      { name: 'monster_id', label: 'モンスター', type: 'select', options: [], required: true },
      { name: 'lat', label: '緯度', type: 'coord', required: true },
      { name: 'lng', label: '経度', type: 'coord', required: true },
      { name: 'active', label: '出現中', type: 'checkbox', value: true },
      { name: 'expires_at', label: '消える日時（空なら消えない）', type: 'datetime' },
    ],
    columns: ['id', 'emoji', 'monster_name', 'active', 'expires_at', 'lat', 'lng'],
    marker: (r) => escapeHtml(r.emoji),
  },
};

const COL_LABEL = {
  id: 'ID', name: '名前', description: '説明', lat: '緯度', lng: '経度', team: 'チーム', owner_name: '占領者',
  emoji: '見た目', rarity: 'レア度', catch_rate: '捕獲率', monster_name: 'モンスター', active: '出現中', expires_at: '消える日時',
};

const state = { tab: 'portals', rows: [], editing: null, monsters: [] };

// ---------- 地図 ----------
let map;
let markerLayer;
let pickMarker;

function initMap() {
  map = L.map('adminMap').setView(savedCenter() ?? [35.681236, 139.767125], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  map.on('click', (e) => setFormCoord(e.latlng.lat, e.latlng.lng));
  map.on('moveend', () => {
    const c = map.getCenter();
    localStorage.setItem('mg.adminCenter', JSON.stringify([c.lat, c.lng]));
  });
}

function savedCenter() {
  try {
    const c = JSON.parse(localStorage.getItem('mg.adminCenter'));
    return Array.isArray(c) && c.every(Number.isFinite) ? c : null;
  } catch {
    return null;
  }
}

function setFormCoord(lat, lng) {
  const form = $('#editForm');
  if (!form.elements.lat) return;
  form.elements.lat.value = lat.toFixed(6);
  form.elements.lng.value = lng.toFixed(6);
  showPick(lat, lng);
}

function showPick(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const icon = L.divIcon({ className: '', html: '<div class="pick">＋</div>', iconSize: [28, 28], iconAnchor: [14, 14] });
  if (!pickMarker) pickMarker = L.marker([lat, lng], { icon, interactive: false });
  pickMarker.setLatLng([lat, lng]).addTo(map);
}

function renderMarkers() {
  markerLayer.clearLayers();
  const tab = TABS[state.tab];
  if (!tab.marker) return;
  for (const r of state.rows) {
    const cls = state.tab === 'gyms' ? ` team-${r.team || 'none'}` : '';
    const icon = L.divIcon({
      className: '',
      html: `<div class="amk${cls}${r.active === false ? ' off' : ''}">${tab.marker(r)}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    L.marker([r.lat, r.lng], { icon, title: r.name ?? r.monster_name })
      .on('click', () => startEdit(r))
      .addTo(markerLayer);
  }
}

// ---------- フォーム ----------
function fieldHtml(f, row) {
  const v = row ? row[f.name] : f.value;
  const req = f.required ? 'required' : '';
  switch (f.type) {
    case 'textarea':
      return `<label class="field">${f.label}<textarea name="${f.name}" rows="2">${escapeHtml(v ?? '')}</textarea></label>`;
    case 'select': {
      const opts = f.options
        .map(([val, label]) => `<option value="${escapeHtml(val)}" ${String(v ?? '') === String(val) ? 'selected' : ''}>${escapeHtml(label)}</option>`)
        .join('');
      return `<label class="field">${f.label}<select name="${f.name}" ${req}>${opts}</select></label>`;
    }
    case 'checkbox':
      return `<label class="field check"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''} /> ${f.label}</label>`;
    case 'datetime':
      return `<label class="field">${f.label}<input type="datetime-local" name="${f.name}" value="${v ? toLocalInput(v) : ''}" /></label>`;
    case 'coord':
      return `<label class="field half">${f.label}<input type="number" step="any" name="${f.name}" value="${v ?? ''}" ${req} /></label>`;
    case 'number':
      return `<label class="field">${f.label}<input type="number" name="${f.name}" min="${f.min}" max="${f.max}" value="${v ?? ''}" ${req} /></label>`;
    default:
      return `<label class="field">${f.label}<input type="text" name="${f.name}" value="${escapeHtml(v ?? '')}" placeholder="${f.placeholder ?? ''}" ${req} /></label>`;
  }
}

function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderForm() {
  const tab = TABS[state.tab];
  const row = state.editing;
  if (state.tab === 'spawns') {
    tab.fields[0].options = state.monsters.map((m) => [m.id, `${m.emoji} ${m.name}`]);
  }
  $('#formTitle').textContent = row ? `${tab.label}を編集（ID ${row.id}）` : `${tab.label}を新規登録`;
  $('#editForm').innerHTML = `
    ${tab.fields.map((f) => fieldHtml(f, row)).join('')}
    <div class="form-actions">
      <button class="btn primary" type="submit">${row ? '更新する' : '登録する'}</button>
      ${row ? '<button class="btn" type="button" data-act="cancel">キャンセル</button>' : ''}
      ${row ? '<button class="btn danger" type="button" data-act="delete">削除</button>' : ''}
    </div>`;
  if (row && Number.isFinite(row.lat)) showPick(row.lat, row.lng);
  else pickMarker?.remove();
}

function formData() {
  const form = $('#editForm');
  const data = {};
  for (const f of TABS[state.tab].fields) {
    const el = form.elements[f.name];
    if (f.type === 'checkbox') data[f.name] = el.checked;
    else if (f.type === 'datetime') data[f.name] = el.value ? new Date(el.value).toISOString() : '';
    else data[f.name] = el.value;
  }
  return data;
}

$('#editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  try {
    if (state.editing) {
      await call(`admin/${state.tab}/${state.editing.id}`, { method: 'PUT', body: formData() });
      toast('更新しました');
    } else {
      await call(`admin/${state.tab}`, { method: 'POST', body: formData() });
      toast('登録しました');
    }
    state.editing = null;
    await loadTab();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('#editForm').addEventListener('click', async (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'cancel') {
    state.editing = null;
    renderForm();
  } else if (act === 'delete') {
    await deleteRow(state.editing);
  }
});

function startEdit(row) {
  state.editing = row;
  renderForm();
  $('#editForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function deleteRow(row) {
  const extra = state.tab === 'monsters' ? '\n※このモンスターの出現地点と捕獲記録も消えます' : '';
  if (!confirm(`ID ${row.id} を削除しますか？${extra}`)) return;
  try {
    await call(`admin/${state.tab}/${row.id}`, { method: 'DELETE' });
    toast('削除しました');
    if (state.editing?.id === row.id) state.editing = null;
    await loadTab();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------- 一覧 ----------
function cell(col, v) {
  if (v === null || v === undefined || v === '') return '<span class="null">—</span>';
  if (col === 'team') return `<span class="team ${escapeHtml(v)}">${TEAM_LABEL[v] ?? escapeHtml(v)}</span>`;
  if (col === 'rarity') return RARITY_LABEL[v] ?? escapeHtml(v);
  if (col === 'active') return v ? '✅' : '⛔';
  if (col === 'catch_rate') return `${v}%`;
  if (col === 'lat' || col === 'lng') return Number(v).toFixed(5);
  if (col === 'expires_at') return new Date(v).toLocaleString('ja-JP');
  if (col === 'emoji') return `<span class="emoji-cell">${escapeHtml(v)}</span>`;
  return escapeHtml(v);
}

function renderList() {
  const tab = TABS[state.tab];
  $('#listTitle').textContent = `${tab.label}一覧`;
  $('#listCount').textContent = `${state.rows.length} 件`;
  const head = `<thead><tr>${tab.columns.map((c) => `<th>${COL_LABEL[c] ?? c}</th>`).join('')}<th></th></tr></thead>`;
  const body = state.rows.length
    ? state.rows
        .map(
          (r) => `<tr data-id="${r.id}" class="${state.editing?.id === r.id ? 'editing' : ''}">
            ${tab.columns.map((c) => `<td>${cell(c, r[c])}</td>`).join('')}
            <td class="row-actions">
              <button class="btn small" data-act="edit">編集</button>
              <button class="btn small danger" data-act="delete">削除</button>
            </td></tr>`,
        )
        .join('')
    : `<tr><td colspan="${tab.columns.length + 1}" class="empty">まだ登録がありません</td></tr>`;
  $('#listTable').innerHTML = head + `<tbody>${body}</tbody>`;
}

$('#listTable').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const row = state.rows.find((r) => r.id === Number(btn.closest('tr').dataset.id));
  if (!row) return;
  if (btn.dataset.act === 'edit') {
    startEdit(row);
    if (Number.isFinite(row.lat)) map.panTo([row.lat, row.lng]);
  } else deleteRow(row);
});

// ---------- タブ ----------
async function loadTab() {
  try {
    if (state.tab === 'monsters' || state.tab === 'spawns') state.monsters = await call('admin/monsters');
    state.rows = state.tab === 'monsters' ? state.monsters : await call(`admin/${state.tab}`);
  } catch (err) {
    toast(err.message, 'error');
    state.rows = [];
  }
  const hasMap = Boolean(TABS[state.tab].marker);
  $('#mapPanel').classList.toggle('no-map', !hasMap);
  if (hasMap) setTimeout(() => map.invalidateSize(), 0);
  renderForm();
  renderList();
  renderMarkers();
}

function selectTab(name) {
  state.tab = name;
  state.editing = null;
  localStorage.setItem('mg.adminTab', name);
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  loadTab();
}

document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));

// ---------- ランダム生成 ----------
$('#genForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const c = map.getCenter();
  try {
    const r = await call('admin/generate', { method: 'POST', body: { ...fd, lat: c.lat, lng: c.lng } });
    toast(`ポータル ${r.portals}・ジム ${r.gyms}・モンスター ${r.spawns} を生成しました`);
    await loadTab();
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ---------- 起動 ----------
requireAdmin(() => {
  initMap();
  const saved = localStorage.getItem('mg.adminTab');
  selectTab(saved in TABS ? saved : 'portals');
});
