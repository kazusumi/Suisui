# MONSTER GO

位置情報を使うモンスター捕獲ゲーム（Ingress / ポケGO 風）です。
**Netlify DB（Neon Postgres）を Netlify 上で使えるかどうかを試す**ために作りました。

- 🎮 ゲーム画面 `/` … 地図の上のポータル・ジム・モンスターをタップして遊ぶ
- ✏️ 管理画面 `/admin/` … ポータル・ジム・モンスター・出現地点の登録／編集／削除
- 🗄 DBビューア `/admin/db.html` … DB の全テーブルを表でそのまま見る

リポジトリ直下にある既存のコンテンツ（SUBMERGED CITY）とは完全に別のフォルダで、ビルドもデプロイも独立しています。

## 遊び方

| もの | できること |
|---|---|
| 💠 ポータル | 近くでハックするとボールが 2〜5 個もらえる（同じポータルは 5 分に 1 回） |
| 🏟️ ジム | 近くで「占領」すると自分のチームの色になる |
| 🐸 モンスター | 近くでボールを 1 個投げるとルーレットが回る。緑（GET!）で止まれば捕獲 |

- 操作できるのは自分から 80 m 以内のものだけです。
- ルーレットの緑の大きさ ＝ モンスターの「捕獲率」です。当たり外れはサーバー側で決めて、DB に記録します。
- 右上の 🧪（テストモード）を ON にすると、地図をタップした場所へ移動でき、距離の制限もなくなります。家の中で試すときに使ってください。
- 同じ名前を入れると、前回のデータの続きから遊べます（テスト用なのでパスワードはありません）。

## 仕組み

```
ブラウザ ──fetch──▶ /api/*（Netlify Functions: netlify/functions/api.mjs）──▶ Netlify DB（Neon Postgres）
```

- 画面：Vite + Leaflet（地図は OpenStreetMap）
- API：Netlify Functions 1 本で `/api/*` をすべて受けます
- DB：`@netlify/neon` で接続します。接続先は Netlify が自動で設定する環境変数 `NETLIFY_DATABASE_URL` です
- テーブルは初回アクセス時に自動で作成し、モンスター 8 種類の初期データも入れます（SQL を手で実行する必要はありません）

### テーブル

| テーブル | 中身 |
|---|---|
| `players` | プレイヤー（名前・チーム・所持ボール数） |
| `portals` | ポータル（名前・説明・緯度経度） |
| `gyms` | ジム（名前・緯度経度・支配チーム・占領者） |
| `monsters` | モンスターの種類（名前・絵文字・レア度・捕獲率） |
| `spawns` | 出現地点（どのモンスターがどこに出るか・出現中か・消える日時） |
| `captures` | 捕獲の記録（成功・失敗の両方） |
| `hacks` | ポータルをハックした記録 |

## Netlify に公開する手順

### 1. サイトを作る（既存サイトとは別に作ります）

1. Netlify の管理画面（app.netlify.com）で **Add new project（Add new site）→ Import an existing project** を選ぶ
2. GitHub の `kazusumi/Suisui` を選ぶ
3. 設定画面で次のように入力する
   - **Branch to deploy**：公開したいブランチ
   - **Base directory**：`monster-go` ← **ここが重要です**
   - Build command / Publish directory は `monster-go/netlify.toml` の内容が使われるので空欄のままで大丈夫です
4. デプロイする

### 2. Netlify DB を用意する

`package.json` に `@netlify/neon` が入っているので、多くの場合は **最初のデプロイで Netlify がデータベースを自動で作成**します。

確認のしかた：

- サイトの **Project configuration（Site configuration）→ Environment variables** に `NETLIFY_DATABASE_URL` があれば準備完了です
- 見当たらない場合は、サイトの **Extensions** から Neon を有効にするか、Netlify CLI で `netlify db init` を実行してください

> ⚠️ 自動で作られた DB は、そのままにしておくと一定期間（目安は 7 日）で削除される仕組みになっています。
> 残したい場合は、Netlify の画面の案内に従って Neon のアカウントと接続（claim）してください。
> 画面の表記は Netlify の更新で変わることがあります。

### 3. 管理画面のパスワードを設定する

1. **Environment variables** に `ADMIN_PASSWORD` を追加する（値は好きなパスワード）
2. 設定を反映するために **Deploys → Trigger deploy** で再デプロイする

### 4. 動作確認

1. `https://（サイト名）.netlify.app/admin/` を開いて、`ADMIN_PASSWORD` でログインする
2. 地図を好きな場所へ動かし、「🎲 地図の中心付近にランダム生成」でポータル・ジム・モンスターを作る
   （もちろん 1 つずつ手で登録することもできます。地図をクリックすると緯度・経度が入ります）
3. `https://（サイト名）.netlify.app/` を開いてゲームを遊ぶ
4. `/admin/db.html` で、遊んだ結果が `players` / `captures` / `hacks` などに入っていることを確認する
   左上に「接続先：Netlify DB（Neon Postgres）」と表示されていれば、Netlify DB を使えています

## 手元で動かす（開発用）

Postgres が必要です。

```bash
cd monster-go
npm install
cp .env.example .env   # LOCAL_DATABASE_URL と ADMIN_PASSWORD を自分の環境に合わせる
npm run dev
```

`npm run dev` だけで画面と API の両方が動きます（開発サーバーが `/api/*` を関数に渡します）。
`LOCAL_DATABASE_URL` があるときはローカルの Postgres を、ないときは Netlify DB を使います。

Netlify CLI を使う場合は、`netlify link` でサイトとつないでから `netlify dev` を実行すると、Netlify DB に直接つながります（このときは `.env` の `LOCAL_DATABASE_URL` を消してください）。

## ファイル構成

```
monster-go/
├─ index.html              ゲーム画面
├─ admin/index.html        管理画面
├─ admin/db.html           DBビューア
├─ src/
│  ├─ game.js              ゲーム（地図・ルーレット・図鑑）
│  ├─ admin.js             管理画面
│  ├─ db.js                DBビューア
│  ├─ auth.js              管理画面のログイン
│  ├─ api.js               API 呼び出しの共通処理
│  └─ *.css
├─ netlify/functions/api.mjs   API（Netlify Function）
├─ netlify/lib/db.mjs          DB 接続とテーブル作成
├─ netlify.toml
└─ vite.config.js
```
