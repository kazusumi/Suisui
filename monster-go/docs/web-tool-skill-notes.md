# Webツール作成スキルセット（メモ・下書き）

MONSTER GO を作ったときに分かったことを、「DB を使う Web ツールを Netlify で作る」ときのスキルとしてあとで追加するために残したメモです。
あとで正式なスキルにするときの材料にします。

記録日：2026-09-26

---

## 1. 基本構成（そのまま使い回せる形）

| 役割 | 使ったもの | メモ |
|---|---|---|
| 画面 | Vite（複数ページ） | `index.html`（利用者向け）、`admin/index.html`（管理画面）、`admin/db.html`（DBビューア） |
| 地図（必要なとき） | Leaflet + OpenStreetMap | 無料・APIキー不要 |
| サーバー処理 | Netlify Functions 1本 | `netlify/functions/api.mjs` に `export const config = { path: '/api/*' }` を書いて、`/api/*` を全部受ける |
| DB | Netlify Database（Postgres） | 公式部品 `@netlify/database` の `getDatabase()` を使う |
| 管理画面の鍵 | 環境変数 `ADMIN_PASSWORD` | 管理用 API はヘッダー `x-admin-password` で確認する |

- **既存のコンテンツがあるリポジトリでは、フォルダを分ける**（例：`monster-go/`）。そのフォルダに `package.json` と `netlify.toml` を持たせて完結させ、Netlify 側は Base directory でそのフォルダを指定する。
- **テーブルは初回アクセス時に自動で作る**（`CREATE TABLE IF NOT EXISTS`）。初期データも「空のときだけ入れる」を1文の SQL で書く。こうすると、利用者が SQL を手で実行しなくて済む。
- **管理画面には「DBを表で直接見る画面（DBビューア）」を付ける**。`information_schema` からテーブル・列の一覧を取り、並べ替えとページ送りを付ける。テーブル名・列名は、一覧にあるものだけ受け付ける（SQL インジェクション対策）。
- DBビューアに「接続先（本番DBかローカルか）」を表示すると、本当に本番DBを使えているかがひと目で分かる。

## 2. Netlify Database の注意点（ここで一番つまずいた）

- Netlify の DB には**新旧2つの方式**がある。
  - **新方式：Netlify Database**（2026年時点の画面は Project navigation → Database）
    - 接続先は **`NETLIFY_DB_URL`**。**環境変数の画面には表示されない**（実行時に Netlify から渡される）。
    - 公式部品は **`@netlify/database`**。`getDatabase()` が `NETLIFY_DB_URL` を自動で読む。`db.pool.query(sql, params)` で `{ rows }` が返る。
    - 作るときは、AI エージェントの入力欄は使わずに「Or create a database manually instead」を押す（AI はコードを書き換えるうえ、クレジットも消費するため）。
    - 5分使わないと眠る。放置後の最初のアクセスは数秒遅い。
  - **旧方式：Netlify DB（Neon 拡張）**：接続先は `NETLIFY_DATABASE_URL`、部品は `@netlify/neon`。
  - → **新方式に合わせて書き、旧方式の変数しかないときはそちらにつなぐ**ようにしておくと安全。
- ローカル開発では `getDatabase({ connectionString: LOCAL_DATABASE_URL })` とすれば、本番と同じ部品のままローカルの Postgres につなげる。
- Netlify の本番環境では、環境変数は `Netlify.env.get()` で読む（`process.env` にない場合がある）。両方を見る関数を1つ作っておく。

## 3. Netlify の設定でつまずいた点

- **本番ブランチ**：新しいサイトを作ると、GitHub の「デフォルトブランチ」が本番ブランチになる。デフォルトブランチが `main` でないリポジトリでは、作業フォルダがないブランチが選ばれて「設定ファイルの読み込みと解析」の段階でデプロイが失敗する。
  - 直し方：Project configuration → Build & deploy → Branches and deploy contexts → Configure → Production branch を `main` に変える。
- **スマホ版の画面**：右上の ≡ は「チーム全体のメニュー」。プロジェクトのメニューは、画面内の「Project navigation ▼」のほう。
- **環境変数を秘密扱いにすると**（Contains secret values）、Scopes が自動で「Specific scopes（Builds / Functions / Runtime）」に変わる。Functions にチェックがあれば問題ない。値はあとから見返せないので控えておく。
- 環境変数を追加・変更したら、**再デプロイしないと反映されない**。
- Netlify の画面は英語のみ。Chrome の自動翻訳を使うと「Production branch」が「生産部門」になるなど、変な訳になる。
- 設定画面へは URL で直接行ける：`https://app.netlify.com/projects/<プロジェクト名>/configuration/env` など。

## 4. 作り方・確かめ方の手順

1. 方針（構成・DB・画面・利用者にやってもらう作業）を先に説明し、許可を得てから作る。
2. API を先に作り、ローカルの Postgres で全機能を呼び出して確かめる（エラー時の動きも含む）。
3. Vite の開発サーバーに、`/api/*` を関数に流す小さなプラグインを入れる。これで `npm run dev` だけで画面と API を動かせる（netlify-cli は不要）。
4. Playwright で画面の通しテストをする（登録 → 利用 → DBビューアで記録を確認）。位置情報は `geolocation` を指定して再現する。
5. Netlify と同じ仕組み（zip-it-and-ship-it）で関数をパッケージし、そのパッケージのまま本番と同じ環境変数の条件で動かしてみる。
6. テストで DB を作り直したら、開発サーバーも再起動する（「テーブル作成済み」を覚えているため）。

## 5. 利用者への説明のしかた（大事）

- **最初に全体像を示す**：目的、登場するもの（GitHub・Netlify・DB・環境変数を身近なものにたとえる）、チェックリスト形式の進み具合と「いまここ」。
- **手順の1つずつに「それで何が起きるか・なぜやるか」を書く**。解説を別の場所にまとめて書くのはダメ。
- 画面の場所は推測で言わない。**スクリーンショットをもらってから**、「上から何番目の、何色の、何というボタン」まで具体的に言う。
- 1回のメッセージで頼む操作は少なくし、区切りごとにスクリーンショットをもらう。
- 英語の画面では、英語の表記を基準に案内し、必要なら自動翻訳での見え方も添える。
- 警告や注意書き（例：茶色い文字）が出たら、何を言われているかを訳して、どうすべきかを答える。

## 6. 地図の 3D 表示と 3D オブジェクト（追記）

- 傾いた 3D 地図は **MapLibre GL v6 ＋ OpenFreeMap**（無料・API キー不要）。v5 は重大な脆弱性の警告があるので使わない。
- v6 の描画用 Worker は別ファイルを読み込む作りなので、Vite では `import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'` と `setWorkerUrl(workerUrl)`、設定に `worker: { format: 'es' }` が必要。
- 地図の上に 3D モデルを置くのは **MapLibre のカスタムレイヤー＋three.js**。
  - 地図の中心を原点に、メートル単位・Y が上の座標で描く（そのまま緯度経度を使うと精度が落ちてガタつく）。
  - 独自のカメラ行列なので `frustumCulled = false` にする。
  - `material.transparent` を途中で切り替えたら `material.needsUpdate = true` が必要（不透明の設定のままだと透明度が無視される）。
  - タップ判定は、透明な HTML マーカーを足元に置くのが簡単。
- モデルは .glb の URL を DB に持たせ、読み込み時に高さ 1・足元 0 にそろえる → 後から差し替えやすい。

## 7. ポケGO 風の出現（追記）

- 出現ポイント × 15 分スロットごとに「ポイントID＋スロット番号」から作った乱数で抽選すると、DB に書き込まずに全員へ同じ出現を見せられる。捕獲の記録にはスロット番号も残す。
- 周りに何もない場所では自動生成すると、どこでもすぐデバッグできる。二重生成は「マス」単位の主キー（`INSERT … ON CONFLICT DO NOTHING RETURNING`）で防ぐ。
- DB の初期値の一括設定は、実行済みを記録するテーブルを作って一度だけ実行する。

## 8. 今後の方向性（利用者の希望）

- MONSTER GO の捕まえ方は、ルーレット以外（クイズなど）にも広げていく予定。捕獲の判定を方式ごとに差し替えられる作りにしておく。

