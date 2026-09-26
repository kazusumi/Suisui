// API 呼び出しの共通処理
export async function api(path, { method = 'GET', body, admin } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (admin) headers['x-admin-password'] = admin;
  const res = await fetch(`/api/${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = { error: `通信エラー (${res.status})` };
  }
  if (!res.ok) {
    const err = new Error(data.error || `エラー (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const TEAM_LABEL = { red: 'レッド', blue: 'ブルー', yellow: 'イエロー' };
export const TEAM_COLOR = { red: '#ef4444', blue: '#3b82f6', yellow: '#eab308' };
export const RARITY_LABEL = { common: 'ふつう', rare: 'レア', legend: 'でんせつ' };

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// 2点間の距離（メートル）
export function distanceM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

let toastTimer;
export function toast(msg, kind = '') {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.append(el);
  }
  el.textContent = msg;
  el.dataset.kind = kind;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
