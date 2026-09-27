// モンスターの出現を決める仕組み（ポケGO 風）。
// 出現ポイントごとに 15 分おき（スロット）に抽選し、当たればそのスロットの間だけ出現する。
// 抽選は「ポイントID＋スロット番号」から作った乱数で行うので、DB に書き込まなくても
// 同じ時間なら誰が見ても同じ場所に同じモンスターが出る。

export const SLOT_MIN = 15;
export const GAME_TZ = 'Asia/Tokyo'; // 「何時から何時」は日本時間で判定する
const OFF_HOURS_FACTOR = 0.15; // 出やすい時間帯の外では、出る確率をこの倍率に下げる

export const currentSlot = (now = Date.now()) => Math.floor(now / (SLOT_MIN * 60000));
export const slotStart = (slot) => new Date(slot * SLOT_MIN * 60000);
export const slotEnd = (slot) => new Date((slot + 1) * SLOT_MIN * 60000);

const hourFormat = new Intl.DateTimeFormat('en-US', { timeZone: GAME_TZ, hour: 'numeric', hourCycle: 'h23' });
export const hourOf = (date) => Number(hourFormat.format(date));

// from〜to 時の間か（to は含まない）。18〜6 のように日をまたぐ指定もできる。0〜24 は終日
export function inHours(hour, from, to) {
  if (from === to || (from <= 0 && to >= 24)) return true;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

// 文字列から再現できる乱数（FNV-1a → mulberry32）
function seededRandom(seedText) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 出現ポイント1つ・スロット1つ分の抽選。出なければ null
export function rollAppearance(point, slot, monsters) {
  const start = slotStart(slot);
  if (!point.active) return null;
  if (point.expires_at && new Date(point.expires_at) <= start) return null;
  const hour = hourOf(start);
  if (!inHours(hour, point.hour_from, point.hour_to)) return null;

  const rand = seededRandom(`${point.id}:${slot}`);
  if (rand() * 100 >= point.chance) return null;

  let monster;
  if (point.monster_id) {
    monster = monsters.find((m) => m.id === point.monster_id);
    // 指定モンスターでも、そのモンスターの出やすい時間帯の外なら出にくくする
    if (monster && !inHours(hour, monster.hour_from, monster.hour_to) && rand() > OFF_HOURS_FACTOR) return null;
  } else {
    // おまかせ：出現の重み × 時間帯で抽選
    const weights = monsters.map(
      (m) => Math.max(0, m.spawn_weight) * (inHours(hour, m.hour_from, m.hour_to) ? 1 : OFF_HOURS_FACTOR),
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let pick = rand() * total;
    for (let i = 0; i < monsters.length && total > 0; i++) {
      pick -= weights[i];
      if (pick < 0) {
        monster = monsters[i];
        break;
      }
    }
  }
  if (!monster) return null;

  // 半径の中のランダムな場所（面積が均等になるよう sqrt を使う）
  const dist = point.radius_m * Math.sqrt(rand());
  const angle = rand() * Math.PI * 2;
  const lat = point.lat + (dist * Math.cos(angle)) / 111320;
  const lng = point.lng + (dist * Math.sin(angle)) / (111320 * Math.cos((point.lat * Math.PI) / 180));
  return { monster, lat, lng, expiresAt: slotEnd(slot) };
}
