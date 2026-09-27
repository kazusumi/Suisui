// DB 接続の窓口。@netlify/database（Netlify Database の公式部品）で接続する。
// - 本番（Netlify）: Netlify が実行時に渡す NETLIFY_DB_URL に接続。
//   この値は環境変数の画面には表示されない。
// - 旧方式の Netlify DB（Neon 拡張）: NETLIFY_DATABASE_URL しかない場合はそちらに接続。
// - ローカル開発: LOCAL_DATABASE_URL があれば普通の Postgres に接続。
// どれも query(sql, params) で「行の配列」を返す同じ形にそろえている。
import { getDatabase } from '@netlify/database';

let driverPromise;

function envGet(key) {
  return globalThis.Netlify?.env?.get(key) ?? process.env[key];
}

async function createDriver() {
  const localUrl = envGet('LOCAL_DATABASE_URL');
  const legacyUrl = envGet('NETLIFY_DB_URL') ? undefined : envGet('NETLIFY_DATABASE_URL');
  const connectionString = localUrl ?? legacyUrl;
  let db;
  try {
    db = getDatabase(connectionString ? { connectionString } : {});
  } catch (e) {
    if (e.name === 'MissingDatabaseConnectionError') {
      throw new Error(
        'Netlify Database が見つかりません。Netlify のプロジェクトで Database を作成してから再デプロイしてください',
      );
    }
    throw e;
  }
  return {
    kind: localUrl ? 'local-postgres' : legacyUrl ? 'netlify-db-legacy' : 'netlify-db',
    query: async (text, params = []) => (await db.pool.query(text, params)).rows,
  };
}

function driver() {
  driverPromise ??= createDriver().catch((e) => {
    driverPromise = undefined;
    throw e;
  });
  return driverPromise;
}

export async function dbKind() {
  return (await driver()).kind;
}

export async function query(text, params = []) {
  await ensureSchema();
  return (await driver()).query(text, params);
}

// ---- スキーマ（初回アクセス時に自動作成） ----

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    team TEXT NOT NULL DEFAULT 'blue',
    balls INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS monsters (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL,
    rarity TEXT NOT NULL DEFAULT 'common',
    catch_rate INTEGER NOT NULL DEFAULT 50,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS portals (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS gyms (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    team TEXT,
    owner_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS spawns (
    id SERIAL PRIMARY KEY,
    monster_id INTEGER NOT NULL REFERENCES monsters(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS captures (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    monster_id INTEGER NOT NULL REFERENCES monsters(id) ON DELETE CASCADE,
    spawn_id INTEGER REFERENCES spawns(id) ON DELETE SET NULL,
    success BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS hacks (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    portal_id INTEGER NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
    balls_gained INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS captures_player_idx ON captures(player_id)`,
  `CREATE INDEX IF NOT EXISTS hacks_player_portal_idx ON hacks(player_id, portal_id, created_at)`,
  // --- 出現の仕組み（時間帯・確率・半径）と 3D モデル用の列 ---
  `ALTER TABLE monsters ADD COLUMN IF NOT EXISTS spawn_weight INTEGER NOT NULL DEFAULT 10`,
  `ALTER TABLE monsters ADD COLUMN IF NOT EXISTS hour_from INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE monsters ADD COLUMN IF NOT EXISTS hour_to INTEGER NOT NULL DEFAULT 24`,
  `ALTER TABLE monsters ADD COLUMN IF NOT EXISTS model_url TEXT NOT NULL DEFAULT ''`,
  // spawns は「出現ポイント」になる。既存の行は「いつも同じ場所に出る」（確率100%・半径0）のまま
  `ALTER TABLE spawns ALTER COLUMN monster_id DROP NOT NULL`,
  `ALTER TABLE spawns ADD COLUMN IF NOT EXISTS radius_m INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE spawns ADD COLUMN IF NOT EXISTS chance INTEGER NOT NULL DEFAULT 100`,
  `ALTER TABLE spawns ADD COLUMN IF NOT EXISTS hour_from INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE spawns ADD COLUMN IF NOT EXISTS hour_to INTEGER NOT NULL DEFAULT 24`,
  `ALTER TABLE spawns ADD COLUMN IF NOT EXISTS auto BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE captures ADD COLUMN IF NOT EXISTS slot BIGINT`,
  `CREATE INDEX IF NOT EXISTS captures_player_spawn_slot_idx ON captures(player_id, spawn_id, slot)`,
  // 自動生成した場所（約500m四方のマス）を記録して、同時アクセスでも二重に作らない
  `CREATE TABLE IF NOT EXISTS auto_cells (cell TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
];

// 一度だけ実行する初期値の設定（schema_migrations に記録して二度と実行しない）
const ONE_TIME = [
  [
    '2026-09-monster-spawn-defaults',
    [
      // 出現の重み：レア度が高いほど出にくい（管理画面で登録済みのモンスターにも適用）
      `UPDATE monsters SET spawn_weight = CASE rarity WHEN 'legend' THEN 1 WHEN 'rare' THEN 4 ELSE 10 END`,
      // 初期モンスターの出やすい時間帯（日本時間）
      `UPDATE monsters SET hour_from = 6, hour_to = 18 WHERE name = 'モフリン'`,
      `UPDATE monsters SET hour_from = 5, hour_to = 11 WHERE name = 'ツノウサ'`,
      `UPDATE monsters SET hour_from = 10, hour_to = 17 WHERE name = 'ヒノコドリ'`,
      `UPDATE monsters SET hour_from = 17, hour_to = 23 WHERE name = 'ウミマル'`,
      `UPDATE monsters SET hour_from = 20, hour_to = 4 WHERE name = 'ヨルギツネ'`,
      `UPDATE monsters SET hour_from = 4, hour_to = 7 WHERE name = 'ソラドラゴ'`,
    ],
  ],
];

const SEED_MONSTERS = [
  ['モフリン', '🐹', 'common', 70, '草むらでよく見かける、ふわふわの小さなモンスター。'],
  ['ピョンタ', '🐸', 'common', 65, '雨の日になると元気に跳ね回る。'],
  ['ツノウサ', '🐰', 'common', 60, '額の小さなツノで木の実を割る。'],
  ['ヒノコドリ', '🐤', 'common', 55, '羽ばたくと火の粉が舞う。'],
  ['ウミマル', '🐙', 'rare', 40, '8本の足で同時にいろんなことをする。'],
  ['ヨルギツネ', '🦊', 'rare', 35, '月夜にだけ尻尾が青く光る。'],
  ['イワゴロン', '🦔', 'rare', 30, '丸まると岩のように硬くなる。'],
  ['ソラドラゴ', '🐉', 'legend', 10, '雲の上に住むと言われる伝説のモンスター。'],
];

let schemaPromise;

export function ensureSchema() {
  schemaPromise ??= (async () => {
    const d = await driver();
    for (const stmt of SCHEMA) await d.query(stmt);
    // モンスターが1匹もいない時だけ初期データを入れる（1文なので同時起動でも二重にならない）
    const values = SEED_MONSTERS.map(
      (_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}::int, $${i * 5 + 5})`,
    ).join(', ');
    await d.query(
      `INSERT INTO monsters (name, emoji, rarity, catch_rate, description)
       SELECT * FROM (VALUES ${values}) AS v
       WHERE NOT EXISTS (SELECT 1 FROM monsters)`,
      SEED_MONSTERS.flat(),
    );
    // 途中で失敗しても次回やり直せるよう、実行してから記録する（中身は2回実行しても同じ結果になるものだけ）
    for (const [name, stmts] of ONE_TIME) {
      const done = await d.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (done.length) continue;
      for (const stmt of stmts) await d.query(stmt);
      await d.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
    }
  })().catch((e) => {
    schemaPromise = undefined;
    throw e;
  });
  return schemaPromise;
}
