import './admin.css';
import { api, escapeHtml, toast } from './api.js';
import { requireAdmin, adminPassword } from './auth.js';

const $ = (s) => document.querySelector(s);
const call = (path) => api(path, { admin: adminPassword() });

const DRIVER_LABEL = {
  'netlify-db': '接続先：Netlify DB（Neon Postgres）',
  'local-postgres': '接続先：ローカル Postgres（開発用）',
};

const state = { table: null, offset: 0, limit: 50, order: null, dir: 'desc', total: 0 };

async function loadTables() {
  try {
    const r = await call('admin/db/tables');
    $('#driverInfo').textContent = DRIVER_LABEL[r.driver] ?? r.driver;
    $('#tableList').innerHTML = r.tables
      .map(
        (t) => `<li><button type="button" data-table="${escapeHtml(t.name)}" class="${t.name === state.table ? 'active' : ''}">
          <span>${escapeHtml(t.name)}</span><small>${t.rows}</small></button></li>`,
      )
      .join('');
    if (!state.table && r.tables.length) {
      const saved = localStorage.getItem('mg.dbTable');
      openTable(r.tables.some((t) => t.name === saved) ? saved : r.tables[0].name);
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

function openTable(name) {
  state.table = name;
  state.offset = 0;
  state.order = null;
  state.dir = 'desc';
  localStorage.setItem('mg.dbTable', name);
  document.querySelectorAll('[data-table]').forEach((b) => b.classList.toggle('active', b.dataset.table === name));
  loadRows();
}

function fmt(v, type) {
  if (v === null || v === undefined) return '<span class="null">NULL</span>';
  if (typeof v === 'boolean') return v ? '<span class="bool-t">true</span>' : '<span class="bool-f">false</span>';
  if (type?.startsWith('timestamp')) {
    const d = new Date(v);
    return `<span title="${escapeHtml(v)}">${escapeHtml(d.toLocaleString('ja-JP'))}</span>`;
  }
  if (typeof v === 'object') return `<code>${escapeHtml(JSON.stringify(v))}</code>`;
  return escapeHtml(v);
}

async function loadRows() {
  const q = new URLSearchParams({ limit: state.limit, offset: state.offset, dir: state.dir });
  if (state.order) q.set('order', state.order);
  try {
    const r = await call(`admin/db/table/${encodeURIComponent(state.table)}?${q}`);
    state.order = r.order;
    state.dir = r.dir;
    state.total = r.total;
    const types = Object.fromEntries(r.columns.map((c) => [c.column_name, c.data_type]));
    $('#tableTitle').textContent = r.name;
    $('#tableCount').textContent = `全 ${r.total} 行`;

    $('#columnsInfo').hidden = false;
    $('#columnsTable').innerHTML = `<thead><tr><th>列名</th><th>型</th><th>NULL可</th><th>初期値</th></tr></thead><tbody>${r.columns
      .map(
        (c) => `<tr><td><b>${escapeHtml(c.column_name)}</b></td><td>${escapeHtml(c.data_type)}</td>
          <td>${c.is_nullable === 'YES' ? '○' : ''}</td><td><code>${escapeHtml(c.column_default ?? '')}</code></td></tr>`,
      )
      .join('')}</tbody>`;

    const arrow = (c) => (c === r.order ? (r.dir === 'asc' ? ' ▲' : ' ▼') : '');
    const head = `<thead><tr>${r.columns
      .map((c) => `<th class="sortable" data-col="${escapeHtml(c.column_name)}">${escapeHtml(c.column_name)}${arrow(c.column_name)}</th>`)
      .join('')}</tr></thead>`;
    const body = r.rows.length
      ? r.rows.map((row) => `<tr>${r.columns.map((c) => `<td>${fmt(row[c.column_name], types[c.column_name])}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${r.columns.length}" class="empty">データがありません</td></tr>`;
    $('#rowsTable').innerHTML = head + `<tbody>${body}</tbody>`;

    const from = r.total ? r.offset + 1 : 0;
    const to = Math.min(r.offset + r.limit, r.total);
    $('#pager').hidden = false;
    $('#pageInfo').textContent = `${from}〜${to} 行目 / ${r.total} 行`;
    $('#prevBtn').disabled = r.offset <= 0;
    $('#nextBtn').disabled = r.offset + r.limit >= r.total;
  } catch (err) {
    toast(err.message, 'error');
  }
}

$('#tableList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-table]');
  if (b) openTable(b.dataset.table);
});
$('#rowsTable').addEventListener('click', (e) => {
  const th = e.target.closest('th[data-col]');
  if (!th) return;
  const col = th.dataset.col;
  state.dir = state.order === col && state.dir === 'desc' ? 'asc' : 'desc';
  state.order = col;
  state.offset = 0;
  loadRows();
});
$('#prevBtn').addEventListener('click', () => {
  state.offset = Math.max(0, state.offset - state.limit);
  loadRows();
});
$('#nextBtn').addEventListener('click', () => {
  state.offset += state.limit;
  loadRows();
});
$('#limitSel').addEventListener('change', (e) => {
  state.limit = Number(e.target.value);
  state.offset = 0;
  loadRows();
});
$('#refreshBtn').addEventListener('click', async () => {
  await loadTables();
  if (state.table) loadRows();
});

requireAdmin(() => loadTables());
