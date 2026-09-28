// 譜面（＝振り付け）。
// 位置は「体の単位」：原点は両肩の中心、1 = 胴の長さ（肩〜腰）。x は右が＋（画面は鏡なので、
// プレイヤーの右手側が画面の右）、y は上が＋。これでカメラとの距離や体格が変わっても同じ振り付けになる。
// 時刻は拍（beat）で書き、song.bpm と song.offset（1拍目の秒）で秒に直す。

// ---- 曲の設定 ----
// url を空にすると、動作確認用の仮の曲（src/tempSong.js）を使う
export const song = {
  url: '',
  title: '仮の曲（動作確認用・プログラムで生成）',
  bpm: 112,
  offset: 0, // 1拍目が始まる秒
  lengthBeats: 152, // 曲の長さ（拍）
};

// ---- よく使う位置（体の単位） ----
const P = {
  // 右手が届く場所（左手は x を反転）
  hiOut: [1.15, 0.95], // 斜め上・外
  hiIn: [0.45, 1.3], // 頭の上寄り
  midOut: [1.4, 0.15], // 真横
  loOut: [1.1, -0.75], // 斜め下・外
  loIn: [0.45, -0.7], // 腰の前
  cross: [-0.75, 0.25], // 体の反対側（右手で取る）
  crossHi: [-0.6, 0.95],
  crossLo: [-0.6, -0.45],
};
const mirror = ([x, y]) => [-x, y];
const at = (hand, key) => (hand === 'R' ? P[key] : mirror(P[key]));

// ---- ノーツを作る小さな関数 ----
const notes = [];
const hand = (b, h, key, sfx = 'clap') => notes.push({ b, type: 'hand', hand: h, pos: at(h, key), sfx });
const cross = (b, h, key = 'cross', sfx = 'perc') => notes.push({ b, type: 'cross', hand: h, pos: at(h, key), sfx });
const both = (b, pos, sfx = 'crash') => notes.push({ b, type: 'both', pos, sfx });
const step = (b, foot, sfx = 'kick') => notes.push({ b, type: 'step', foot, sfx });
const pose = (b, name, sfx = 'bell') => notes.push({ b, type: 'pose', pose: name, sfx });
// TRACE：dur 拍かけて path をなぞる
const trace = (b, h, dur, path, sfx = 'synth') =>
  notes.push({ b, type: 'trace', hand: h, dur, path: h === 'R' ? path : path.map(mirror), sfx });
const bar = (n) => n * 4; // n 小節目（0 始まり）の 1 拍目

// ================= 振り付け =================
// イントロ（0〜3小節）：最初の2小節は準備。後半は左右にゆっくり揺れる
for (const [i, h] of ['L', 'R', 'L', 'R'].entries()) hand(bar(2) + i * 2, h, 'midOut');

// A1（4〜7小節）：左右交互に横へ。体が左右に揺れる
for (let i = 0; i < 8; i++) hand(bar(4) + i * 2, i % 2 ? 'R' : 'L', i % 4 < 2 ? 'midOut' : 'hiOut');

// A2（8〜11小節）：斜めに大きく。右上→左下→左上→右下
const diag = [['R', 'hiOut'], ['L', 'loOut'], ['L', 'hiOut'], ['R', 'loOut']];
for (let i = 0; i < 7; i++) hand(bar(8) + i * 2, ...diag[i % 4]);
both(bar(11) + 2, [0, -0.1], 'clap'); // 胸の前でクラップ

// ビルドアップ（12〜15小節）：サイドステップ＋同じ側の手（ステップタッチ）
for (let i = 0; i < 6; i++) {
  const side = i % 2 ? 'R' : 'L';
  step(bar(12) + i * 2, side);
  hand(bar(12) + i * 2 + 1, side, 'midOut', 'snare');
}
both(bar(15), [0, 1.45]); // 頭の上でクラップ
pose(bar(15) + 2, 'up'); // 両手を上げる

// メロディー（16〜19小節）：TRACE で手を滑らせる
trace(bar(16), 'R', 3, [[0.5, -0.8], [1.3, 0.2], [0.8, 1.15], [-0.2, 1.3]]);
hand(bar(16) + 3.5, 'L', 'hiOut', 'bell');
trace(bar(17) + 2, 'L', 3, [[0.5, -0.8], [1.3, 0.2], [0.8, 1.15], [-0.2, 1.3]]);
hand(bar(18) + 1.5, 'R', 'hiOut', 'bell');
hand(bar(18) + 3, 'R', 'loIn');
hand(bar(19), 'L', 'loIn');
both(bar(19) + 2, [0, -0.1], 'clap');

// サビ（20〜27小節）：HAND・CROSS・STEP を組み合わせて大きく動く
for (let k = 0; k < 4; k++) {
  const b0 = bar(20 + k * 2);
  const h = k % 2 ? 'L' : 'R';
  const o = h === 'R' ? 'L' : 'R';
  hand(b0, h, 'hiOut'); // 外へ伸ばす
  cross(b0 + 1, o, 'cross'); // 反対の手で体を横切る → ひねる
  step(b0 + 2, h); // 同じ側へステップ
  hand(b0 + 3, h, 'loOut', 'snare');
  hand(b0 + 4, o, 'hiOut');
  cross(b0 + 5, h, k % 2 ? 'crossLo' : 'crossHi');
  step(b0 + 6, o);
  if (k === 1) both(b0 + 7, [0, 1.45]);
  else hand(b0 + 7, o, 'loOut', 'snare');
}
pose(bar(27) + 3, 'spread'); // 両手を広げる

// 間奏（28〜29小節）：左右に大きく体を傾ける
hand(bar(28), 'L', 'midOut');
pose(bar(28) + 2, 'leanL');
hand(bar(29), 'R', 'midOut');
pose(bar(29) + 2, 'leanR');

// ラスト（30〜35小節）：大きな TRACE → BOTH → 決めポーズ
trace(bar(30), 'R', 6, [[0.4, -0.9], [1.35, -0.3], [1.35, 0.7], [0.6, 1.35], [-0.5, 1.2], [-1.1, 0.4]]);
trace(bar(31) + 2, 'L', 6, [[0.4, -0.9], [1.35, -0.3], [1.35, 0.7], [0.6, 1.35], [-0.5, 1.2], [-1.1, 0.4]]);
both(bar(33) + 2, [0, 1.45]);
both(bar(34), [0, -0.1], 'clap');
pose(bar(34) + 2, 'up', 'finale'); // 決めポーズ

notes.sort((a, b) => a.b - b.b);
export const chart = notes;

// 拍 → 秒
export const beatToSec = (b) => song.offset + (b * 60) / song.bpm;
