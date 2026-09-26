// MONSTER GO の API（Netlify Function）。/api/* をすべてここで受ける。
//
// ゲーム用:
//   POST /api/player              {name, team}           プレイヤー登録（同名ならログイン）
//   GET  /api/player/:id                                  プレイヤー情報
//   GET  /api/world?lat&lng&player                        周辺のポータル・ジム・モンスター
//   POST /api/hack                {playerId, portalId}   ポータルをハックしてボール獲得
//   POST /api/capture             {playerId, spawnId}    ルーレットで捕獲（結果はサーバーで決定）
//   POST /api/gym/claim           {playerId, gymId}      ジムを自チームのものにする
//   GET  /api/collection?player                          捕まえたモンスター一覧
// 管理用（ヘッダー x-admin-password が必要）:
//   GET    /api/admin/check
//   GET    /api/admin/:table        一覧（portals / gyms / monsters / spawns）
//   POST   /api/admin/:table        追加
//   PUT    /api/admin/:table/:id    更新
//   DELETE /api/admin/:table/:id    削除
//   POST   /api/admin/generate      地図の中心付近にランダム生成
//   GET    /api/admin/db/tables     全テーブル一覧（DBビューア）
//   GET    /api/admin/db/table/:name?limit&offset&order&dir   テーブルの中身
import { createHash, timingSafeEqual } from 'node:crypto';
import { query, dbKind } from '../lib/db.mjs';
import { currentSlot, rollAppearance, SLOT_MIN } from '../lib/spawn.mjs';

export const config = { path: '/api/*' };

const HACK_COOLDOWN_MIN = 5;
const WORLD_RADIUS_M = 3000;
const AUTO_CHECK_RADIUS_M = 500; // この範囲に出現ポイントがなければ自動で作る
const AUTO_AREA_RADIUS_M = 400; // 自動で作るときの範囲
const MAX_POINT_RADIUS_M = 2000; // 出現ポイントの半径の上限
const TEAMS = ['red', 'blue', 'yellow'];
const RARITIES = ['common', 'rare', 'legend'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

async function readBody(req) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'JSON の形式が正しくありません');
  }
}

const toInt = (v, name) => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new HttpError(400, `${name} が不正です`);
  return n;
};
const toNum = (v, name) => {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isFinite(n)) throw new HttpError(400, `${name} が不正です`);
  return n;
};

// 緯度経度の四角で大まかに絞り込む
function bbox(lat, lng, radiusM) {
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return [lat - dLat, lat + dLat, lng - dLng, lng + dLng];
}

// ---------------- ゲーム ----------------

async function getPlayer(id) {
  const [p] = await query('SELECT id, name, team, balls, created_at FROM players WHERE id = $1', [id]);
  if (!p) throw new HttpError(404, 'プレイヤーが見つかりません');
  return p;
}

async function createPlayer(req) {
  const { name, team } = await readBody(req);
  const n = String(name ?? '').trim();
  if (!n || n.length > 20) throw new HttpError(400, '名前は1〜20文字で入力してください');
  const t = TEAMS.includes(team) ? team : 'blue';
  const [p] = await query(
    `INSERT INTO players (name, team) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name, team, balls, created_at`,
    [n, t],
  );
  return json(p);
}

async function world(url) {
  const lat = toNum(url.searchParams.get('lat'), 'lat');
  const lng = toNum(url.searchParams.get('lng'), 'lng');
  const playerId = url.searchParams.get('player') ? toInt(url.searchParams.get('player'), 'player') : null;
  const box = bbox(lat, lng, WORLD_RADIUS_M);
  const inBox = (a) => `${a}.lat BETWEEN $1 AND $2 AND ${a}.lng BETWEEN $3 AND $4`;

  await ensureNearby(lat, lng);

  const [portals, gyms, points, monsters] = await Promise.all([
    query(
      `SELECT p.id, p.name, p.description, p.lat, p.lng,
         (SELECT max(h.created_at) FROM hacks h WHERE h.portal_id = p.id AND h.player_id = $5) AS last_hack
       FROM portals p WHERE ${inBox('p')}`,
      [...box, playerId],
    ),
    query(
      `SELECT g.id, g.name, g.lat, g.lng, g.team, g.claimed_at, pl.name AS owner_name
       FROM gyms g LEFT JOIN players pl ON pl.id = g.owner_player_id
       WHERE ${inBox('g')}`,
      box,
    ),
    // 出現ポイントは中心が範囲外でも半径で入ってくるので、少し広めに取る
    query(
      `SELECT id, monster_id, lat, lng, radius_m, chance, hour_from, hour_to, active, expires_at
       FROM spawns s WHERE s.active AND (s.expires_at IS NULL OR s.expires_at > now()) AND ${inBox('s')}`,
      bbox(lat, lng, WORLD_RADIUS_M + MAX_POINT_RADIUS_M),
    ),
    monsterList(),
  ]);
  const cooldownMs = HACK_COOLDOWN_MIN * 60 * 1000;
  for (const p of portals) {
    p.ready_at = p.last_hack ? new Date(new Date(p.last_hack).getTime() + cooldownMs).toISOString() : null;
    delete p.last_hack;
  }

  // 今のスロット（15分）に出ているモンスターを計算する
  const slot = currentSlot();
  const caught = new Set();
  if (playerId && points.length) {
    const rows = await query(
      'SELECT spawn_id FROM captures WHERE player_id = $1 AND slot = $2 AND success',
      [playerId, slot],
    );
    rows.forEach((r) => caught.add(r.spawn_id));
  }
  const [minLat, maxLat, minLng, maxLng] = box;
  const spawns = [];
  for (const point of points) {
    const a = rollAppearance(point, slot, monsters);
    if (!a || a.lat < minLat || a.lat > maxLat || a.lng < minLng || a.lng > maxLng) continue;
    const m = a.monster;
    spawns.push({
      id: `${point.id}:${slot}`,
      point_id: point.id,
      slot,
      lat: a.lat,
      lng: a.lng,
      expires_at: a.expiresAt.toISOString(),
      monster_id: m.id,
      name: m.name,
      emoji: m.emoji,
      rarity: m.rarity,
      catch_rate: m.catch_rate,
      description: m.description,
      model_url: m.model_url,
      caught: caught.has(point.id),
    });
  }
  return json({ portals, gyms, spawns, hackCooldownMin: HACK_COOLDOWN_MIN, slotMinutes: SLOT_MIN });
}

const monsterList = () =>
  query(
    `SELECT id, name, emoji, rarity, catch_rate, description, spawn_weight, hour_from, hour_to, model_url
     FROM monsters ORDER BY id`,
  );

// 周りに出現ポイントがなければ、ポケGO くらいの密度で自動生成する（ポータル・ジムも無ければ作る）
async function ensureNearby(lat, lng) {
  const near = bbox(lat, lng, AUTO_CHECK_RADIUS_M);
  const inNear = 'lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4';
  const [{ points, portals, gyms }] = await query(
    `SELECT (SELECT count(*)::int FROM spawns WHERE active AND ${inNear}) AS points,
            (SELECT count(*)::int FROM portals WHERE ${inNear}) AS portals,
            (SELECT count(*)::int FROM gyms WHERE ${inNear}) AS gyms`,
    near,
  );
  if (points && portals && gyms) return;
  // 約500m四方のマスごとに1回だけ作る（同時にアクセスがあっても二重にならない）
  const cell = `${Math.floor(lat / 0.005)}:${Math.floor(lng / 0.006)}`;
  const claimed = await query('INSERT INTO auto_cells (cell) VALUES ($1) ON CONFLICT DO NOTHING RETURNING cell', [cell]);
  if (!claimed.length) return;

  const rand = randomPointIn(lat, lng, AUTO_AREA_RADIUS_M);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const code = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  if (!points) {
    // 12か所：多くは「おまかせ」で半径広め、いくつかはピンポイント
    for (let i = 0; i < 12; i++) {
      const [a, b] = rand();
      await query(
        `INSERT INTO spawns (monster_id, lat, lng, radius_m, chance, hour_from, hour_to, auto)
         VALUES (NULL, $1, $2, $3, $4, 0, 24, true)`,
        [a, b, pick([5, 20, 30, 40, 60]), pick([35, 45, 55, 65])],
      );
    }
  }
  if (!portals) {
    for (let i = 0; i < 3; i++) {
      const [a, b] = rand();
      await query('INSERT INTO portals (name, description, lat, lng) VALUES ($1, $2, $3, $4)', [
        `ポータル ${code()}`, '自動生成', a, b,
      ]);
    }
  }
  if (!gyms) {
    const [a, b] = rand();
    await query('INSERT INTO gyms (name, lat, lng) VALUES ($1, $2, $3)', [`ジム ${code()}`, a, b]);
  }
}

function randomPointIn(lat, lng, radius) {
  return () => {
    const r = radius * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    return [lat + (r * Math.cos(a)) / 111320, lng + (r * Math.sin(a)) / (111320 * Math.cos((lat * Math.PI) / 180))];
  };
}

async function hack(req) {
  const body = await readBody(req);
  const playerId = toInt(body.playerId, 'playerId');
  const portalId = toInt(body.portalId, 'portalId');
  await getPlayer(playerId);
  const [portal] = await query('SELECT id, name FROM portals WHERE id = $1', [portalId]);
  if (!portal) throw new HttpError(404, 'ポータルが見つかりません');

  const gained = 2 + Math.floor(Math.random() * 4); // 2〜5個
  // クールダウン中でなければ記録する（判定と記録を1文で行う）
  const inserted = await query(
    `INSERT INTO hacks (player_id, portal_id, balls_gained)
     SELECT $1, $2, $3
     WHERE NOT EXISTS (
       SELECT 1 FROM hacks WHERE player_id = $1 AND portal_id = $2
         AND created_at > now() - make_interval(mins => $4)
     )
     RETURNING id`,
    [playerId, portalId, gained, HACK_COOLDOWN_MIN],
  );
  if (!inserted.length) throw new HttpError(429, `このポータルはまだ回復中です（${HACK_COOLDOWN_MIN}分に1回）`);
  const [p] = await query('UPDATE players SET balls = balls + $2 WHERE id = $1 RETURNING balls', [playerId, gained]);
  return json({ gained, balls: p.balls, portal: portal.name });
}

async function capture(req) {
  const body = await readBody(req);
  const playerId = toInt(body.playerId, 'playerId');
  const pointId = toInt(body.pointId, 'pointId');
  const slot = toInt(body.slot, 'slot');
  await getPlayer(playerId);
  if (slot !== currentSlot()) throw new HttpError(404, 'モンスターはどこかへ行ってしまった…');
  const [point] = await query(
    `SELECT id, monster_id, lat, lng, radius_m, chance, hour_from, hour_to, active, expires_at
     FROM spawns WHERE id = $1`,
    [pointId],
  );
  const appearance = point && rollAppearance(point, slot, await monsterList());
  if (!appearance) throw new HttpError(404, 'モンスターはもういないようです');
  const monster = appearance.monster;
  const [already] = await query(
    'SELECT 1 FROM captures WHERE player_id = $1 AND spawn_id = $2 AND slot = $3 AND success',
    [playerId, pointId, slot],
  );
  if (already) throw new HttpError(409, 'このモンスターはもう捕まえています');

  // ボールを1個使う（0個なら失敗）
  const [p] = await query(
    'UPDATE players SET balls = balls - 1 WHERE id = $1 AND balls > 0 RETURNING balls',
    [playerId],
  );
  if (!p) throw new HttpError(400, 'ボールがありません。ポータルをハックして補充しよう');

  // 捕獲の判定はサーバーで行う。今はルーレット（0〜99 が catch_rate 未満なら成功）。
  // クイズなど別の捕まえ方を足すときは、ここを方式ごとに切り替える
  const roll = Math.floor(Math.random() * 100);
  const success = roll < monster.catch_rate;
  await query(
    'INSERT INTO captures (player_id, monster_id, spawn_id, slot, success) VALUES ($1, $2, $3, $4, $5)',
    [playerId, monster.id, pointId, slot, success],
  );
  return json({
    success,
    roll,
    catchRate: monster.catch_rate,
    balls: p.balls,
    monster: { id: monster.id, name: monster.name, emoji: monster.emoji, catch_rate: monster.catch_rate },
  });
}

async function claimGym(req) {
  const body = await readBody(req);
  const playerId = toInt(body.playerId, 'playerId');
  const gymId = toInt(body.gymId, 'gymId');
  const player = await getPlayer(playerId);
  const [gym] = await query(
    `UPDATE gyms SET team = $2, owner_player_id = $3, claimed_at = now()
     WHERE id = $1 RETURNING id, name, team, claimed_at`,
    [gymId, player.team, playerId],
  );
  if (!gym) throw new HttpError(404, 'ジムが見つかりません');
  return json({ ...gym, owner_name: player.name });
}

async function collection(url) {
  const playerId = toInt(url.searchParams.get('player'), 'player');
  const rows = await query(
    `SELECT m.id, m.name, m.emoji, m.rarity,
       count(*) FILTER (WHERE c.success)::int AS caught,
       count(*)::int AS tries,
       max(c.created_at) FILTER (WHERE c.success) AS last_caught
     FROM captures c JOIN monsters m ON m.id = c.monster_id
     WHERE c.player_id = $1
     GROUP BY m.id ORDER BY m.id`,
    [playerId],
  );
  const [{ total }] = await query('SELECT count(*)::int AS total FROM monsters');
  return json({ monsters: rows, totalKinds: total });
}

// ---------------- 管理 ----------------

function checkAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new HttpError(503, '環境変数 ADMIN_PASSWORD が設定されていません');
  const given = req.headers.get('x-admin-password') ?? '';
  const h = (s) => createHash('sha256').update(s).digest();
  if (!timingSafeEqual(h(given), h(expected))) throw new HttpError(401, 'パスワードが違います');
}

// 管理画面から編集できるテーブルと列（列名はここに書いたものだけ使う）
const ADMIN_TABLES = {
  portals: { cols: { name: 'text', description: 'text', lat: 'num', lng: 'num' }, required: ['name', 'lat', 'lng'] },
  gyms: { cols: { name: 'text', lat: 'num', lng: 'num', team: 'team' }, required: ['name', 'lat', 'lng'] },
  monsters: {
    cols: {
      name: 'text', emoji: 'text', rarity: 'rarity', catch_rate: 'rate', description: 'text',
      spawn_weight: 'weight', hour_from: 'hour', hour_to: 'hour', model_url: 'url',
    },
    required: ['name', 'emoji', 'catch_rate'],
  },
  // 出現ポイント（monster_id が空なら「おまかせ」）
  spawns: {
    cols: {
      monster_id: 'intOrNull', lat: 'num', lng: 'num', radius_m: 'radius', chance: 'pct',
      hour_from: 'hour', hour_to: 'hour', active: 'bool', expires_at: 'ts',
    },
    required: ['lat', 'lng'],
  },
};

function coerce(type, v, name) {
  switch (type) {
    case 'text':
      return String(v ?? '').trim();
    case 'num':
      return toNum(v, name);
    case 'int':
      return toInt(v, name);
    case 'rate': {
      const n = toInt(v, name);
      if (n < 1 || n > 100) throw new HttpError(400, '捕獲率は 1〜100 で入力してください');
      return n;
    }
    case 'intOrNull':
      return v === '' || v === null || v === undefined ? null : toInt(v, name);
    case 'weight':
      return rangeInt(v, name, 0, 1000, '出現の重みは 0〜1000 で入力してください');
    case 'hour':
      return rangeInt(v, name, 0, 24, '時刻は 0〜24 で入力してください');
    case 'pct':
      return rangeInt(v, name, 0, 100, '出現確率は 0〜100 で入力してください');
    case 'radius':
      return rangeInt(v, name, 0, MAX_POINT_RADIUS_M, `半径は 0〜${MAX_POINT_RADIUS_M} m で入力してください`);
    case 'url': {
      const u = String(v ?? '').trim();
      if (u && !/^(https?:\/\/|\/)/.test(u)) throw new HttpError(400, 'モデルの URL は http(s):// か / で始めてください');
      return u;
    }
    case 'bool':
      return v === true || v === 'true' || v === 1 || v === '1' || v === 'on';
    case 'team':
      if (v === '' || v === null || v === undefined) return null;
      if (!TEAMS.includes(v)) throw new HttpError(400, 'チームは red / blue / yellow のどれかです');
      return v;
    case 'rarity':
      if (!RARITIES.includes(v)) throw new HttpError(400, 'レア度は common / rare / legend のどれかです');
      return v;
    case 'ts':
      if (v === '' || v === null || v === undefined) return null;
      if (Number.isNaN(new Date(v).getTime())) throw new HttpError(400, `${name} の日時が不正です`);
      return new Date(v).toISOString();
  }
}

function rangeInt(v, name, min, max, message) {
  const n = toInt(v, name);
  if (n < min || n > max) throw new HttpError(400, message);
  return n;
}

function pickCols(def, body, isCreate) {
  const out = {};
  for (const [col, type] of Object.entries(def.cols)) {
    if (!(col in body)) continue;
    out[col] = coerce(type, body[col], col);
  }
  if (isCreate) {
    for (const r of def.required) {
      if (out[r] === undefined || out[r] === '') throw new HttpError(400, `${r} は必須です`);
    }
  }
  if ('name' in out && out.name === '') throw new HttpError(400, 'name は必須です');
  return out;
}

async function adminList(table) {
  if (table === 'spawns') {
    return query(
      `SELECT s.*, m.name AS monster_name, m.emoji FROM spawns s
       LEFT JOIN monsters m ON m.id = s.monster_id ORDER BY s.id DESC`,
    );
  }
  if (table === 'gyms') {
    return query(
      `SELECT g.*, p.name AS owner_name FROM gyms g
       LEFT JOIN players p ON p.id = g.owner_player_id ORDER BY g.id DESC`,
    );
  }
  return query(`SELECT * FROM ${table} ORDER BY id DESC`);
}

async function adminCreate(table, body) {
  const data = pickCols(ADMIN_TABLES[table], body, true);
  const cols = Object.keys(data);
  const [row] = await query(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    Object.values(data),
  );
  return row;
}

async function adminUpdate(table, id, body) {
  const data = pickCols(ADMIN_TABLES[table], body, false);
  const cols = Object.keys(data);
  if (!cols.length) throw new HttpError(400, '更新する項目がありません');
  const [row] = await query(
    `UPDATE ${table} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
    [id, ...Object.values(data)],
  );
  if (!row) throw new HttpError(404, 'データが見つかりません');
  return row;
}

async function adminGenerate(body) {
  const lat = toNum(body.lat, 'lat');
  const lng = toNum(body.lng, 'lng');
  const radius = Math.min(3000, Math.max(50, Number(body.radius) || 500));
  const counts = {
    portals: Math.min(50, Math.max(0, Number(body.portals) || 0)),
    gyms: Math.min(20, Math.max(0, Number(body.gyms) || 0)),
    spawns: Math.min(100, Math.max(0, Number(body.spawns) || 0)),
  };
  const rand = () => {
    const r = radius * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    return [
      lat + (r * Math.cos(a)) / 111320,
      lng + (r * Math.sin(a)) / (111320 * Math.cos((lat * Math.PI) / 180)),
    ];
  };
  for (let i = 0; i < counts.portals; i++) {
    const [a, b] = rand();
    await query('INSERT INTO portals (name, description, lat, lng) VALUES ($1, $2, $3, $4)', [
      `ポータル ${Math.random().toString(36).slice(2, 6).toUpperCase()}`, '自動生成', a, b,
    ]);
  }
  for (let i = 0; i < counts.gyms; i++) {
    const [a, b] = rand();
    await query('INSERT INTO gyms (name, lat, lng) VALUES ($1, $2, $3)', [
      `ジム ${Math.random().toString(36).slice(2, 6).toUpperCase()}`, a, b,
    ]);
  }
  for (let i = 0; i < counts.spawns; i++) {
    const [a, b] = rand();
    // 出現ポイント：モンスターは「おまかせ」、半径と確率はポケGO 風の値からランダム
    await query(
      'INSERT INTO spawns (monster_id, lat, lng, radius_m, chance) VALUES (NULL, $1, $2, $3, $4)',
      [a, b, [5, 20, 30, 40, 60][Math.floor(Math.random() * 5)], [35, 45, 55, 65][Math.floor(Math.random() * 4)]],
    );
  }
  return counts;
}

async function dbTables() {
  const rows = await query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  const tables = [];
  for (const { table_name } of rows) {
    const [{ n }] = await query(`SELECT count(*)::int AS n FROM "${table_name.replaceAll('"', '""')}"`);
    tables.push({ name: table_name, rows: n });
  }
  return { tables, driver: await dbKind() };
}

async function dbTable(name, url) {
  const cols = await query(
    `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [name],
  );
  if (!cols.length) throw new HttpError(404, 'テーブルが見つかりません');
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const colNames = cols.map((c) => c.column_name);
  const orderParam = url.searchParams.get('order');
  const order = colNames.includes(orderParam) ? orderParam : colNames.includes('id') ? 'id' : colNames[0];
  const dir = url.searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC';
  const q = (s) => `"${s.replaceAll('"', '""')}"`;
  const [rows, [{ total }]] = await Promise.all([
    query(`SELECT * FROM ${q(name)} ORDER BY ${q(order)} ${dir} LIMIT ${limit} OFFSET ${offset}`),
    query(`SELECT count(*)::int AS total FROM ${q(name)}`),
  ]);
  return { name, columns: cols, rows, total, limit, offset, order, dir: dir.toLowerCase() };
}

async function admin(req, url, parts) {
  checkAdmin(req);
  const [, a, b, c] = parts; // parts[0] === 'admin'
  const m = req.method;
  if (a === 'check' && m === 'GET') return json({ ok: true, driver: await dbKind() });
  if (a === 'generate' && m === 'POST') return json(await adminGenerate(await readBody(req)));
  if (a === 'db' && b === 'tables' && m === 'GET') return json(await dbTables());
  if (a === 'db' && b === 'table' && c && m === 'GET') return json(await dbTable(decodeURIComponent(c), url));
  if (a in ADMIN_TABLES) {
    if (!b && m === 'GET') return json(await adminList(a));
    if (!b && m === 'POST') return json(await adminCreate(a, await readBody(req)), 201);
    if (b && m === 'PUT') return json(await adminUpdate(a, toInt(b, 'id'), await readBody(req)));
    if (b && m === 'DELETE') {
      const rows = await query(`DELETE FROM ${a} WHERE id = $1 RETURNING id`, [toInt(b, 'id')]);
      if (!rows.length) throw new HttpError(404, 'データが見つかりません');
      return json({ deleted: rows[0].id });
    }
  }
  throw new HttpError(404, 'Not Found');
}

// ---------------- ルーティング ----------------

export default async (req) => {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const m = req.method;
  try {
    if (parts[0] === 'admin') return await admin(req, url, parts);
    const route = parts.join('/');
    if (route === 'player' && m === 'POST') return await createPlayer(req);
    if (parts[0] === 'player' && parts[1] && m === 'GET') return json(await getPlayer(toInt(parts[1], 'id')));
    if (route === 'world' && m === 'GET') return await world(url);
    if (route === 'hack' && m === 'POST') return await hack(req);
    if (route === 'capture' && m === 'POST') return await capture(req);
    if (route === 'gym/claim' && m === 'POST') return await claimGym(req);
    if (route === 'collection' && m === 'GET') return await collection(url);
    throw new HttpError(404, 'Not Found');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: `サーバーエラー: ${e.message}` }, 500);
  }
};
