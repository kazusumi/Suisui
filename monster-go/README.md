# MONSTER GO

位置情報を使うモンスター捕獲ゲーム（Ingress / ポケGO 風）です。
**Netlify Database（Netlify の Postgres データベース）を Netlify 上で使えるかどうかを試す**ために作りました。

- 🎮 ゲーム画面 `/` … 地図の上のポータル・ジム・モンスターをタップして遊ぶ
- ✏️ 管理画面 `/admin/` … ポータル・ジム・モンスター・出現地点の登録／編集／削除
- 🗄 DBビューア `/admin/db.html` … DB の全テーブルを表でそのまま見る

リポジトリ直下にある既存のコンテンツ（SUBMERGED CITY）とは完全に別のフォルダで、ビルドもデプロイも独立しています。

## 遊び方

| もの | できること |
|---|---|
| 💠 ポータル | 近くでハックするとボールが 2〜5 個もらえる（同じポータルは 5 分に 1 回） |
| 🏟️ ジム | 近くで「占領」すると自分のチームの色になる |
| 🐸 モンスター | 地図の上に 3D で現れる。近くでボールを 1 個投げるとルーレットが回り、緑（GET!）で止まれば捕獲 |

- 操作できるのは自分から 80 m 以内のものだけです。
- ルーレットの緑の大きさ ＝ モンスターの「捕獲率」です。当たり外れはサーバー側で決めて、DB に記録します。
- 右上の 🧪（テストモード）を ON にすると、地図をタップした場所へ移動でき、距離の制限もなくなります。家の中で試すときに使ってください。
- 同じ名前を入れると、前回のデータの続きから遊べます（テスト用なのでパスワードはありません）。

## モンスターの出現の仕組み（ポケGO 風）

- モンスターは**出現ポイント**から出てきます。出現ポイントごとに **15 分おき**に抽選し、当たるとその 15 分間だけ現れます。
- 現れる場所は、出現ポイントの**半径の中のランダムな場所**です。半径を小さくすると、ほぼピンポイントになります。
- 同じ時間なら、誰が見ても同じ場所に同じモンスターが見えます。
- 周り 500 m に出現ポイントがない場所でゲームを開くと、**自動で**出現ポイント 12 か所（と、なければポータル 3・ジム 1）が作られます。

| 設定する場所 | 項目 | 意味 |
|---|---|---|
| 出現ポイント | 半径（m） | この範囲のどこかに出る |
| 出現ポイント | 出現確率（%） | 15 分ごとの抽選で出る確率 |
| 出現ポイント | 出る時間帯 | この時間帯以外は出ない（日本時間。18〜6 のような日またぎも可） |
| 出現ポイント | モンスター | 指定するか「おまかせ」 |
| モンスター | 出現の重み | 「おまかせ」の抽選で選ばれやすさ（目安：ふつう 10・レア 4・でんせつ 1） |
| モンスター | 出やすい時間帯 | この時間帯の外では出にくくなる（約 0.15 倍） |
| モンスター | 3D モデルの URL | 下の「3D モデルの差し替え」を参照 |

### 3D モデルの差し替え

- モデルが未登録のモンスターは、仮のモデル（色つきの丸いキャラ）で表示されます。
- 管理画面 → モンスター →「3D モデルの URL」に **.glb ファイル**の URL を入れると差し替わります。
  - 自分で用意したファイルは `monster-go/public/models/` に置くと `/models/ファイル名.glb` で使えます。
  - 他のサイトの URL を使う場合は、そのサイトが読み込みを許可（CORS）している必要があります。
- 大きさと向きは自動でそろえます（高さ約 32 m、足元を地面に合わせる）。上下にはねる・回る動きはプログラム側で付けます。

## 今後の方向性（メモ）

- 捕まえ方を、ルーレット以外（クイズなど）にも広げていく予定です。捕獲の判定はサーバーの `capture`（`netlify/functions/api.mjs`）にまとめてあるので、そこを方式ごとに切り替えられるようにします。

## 仕組み

```
ブラウザ ──fetch──▶ /api/*（Netlify Functions: netlify/functions/api.mjs）──▶ Netlify Database（Postgres）
```

- 画面：Vite + Leaflet（地図は OpenStreetMap）
- API：Netlify Functions 1 本で `/api/*` をすべて受けます
- DB：公式部品 `@netlify/database` で接続します。接続先は、Netlify が実行時に渡す `NETLIFY_DB_URL` です（環境変数の画面には表示されません）
  - 旧方式の Netlify DB（Neon 拡張）の `NETLIFY_DATABASE_URL` しかない場合は、そちらにつなぎます
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
   - **Branch to deploy**：`main`
     ⚠️ このリポジトリは GitHub の「デフォルトブランチ」が `main` ではないため、何もしないと別のブランチ（`monster-go` フォルダがない）が選ばれてデプロイが失敗します。
     あとから直す場合は Project configuration → Build & deploy → Branches and deploy contexts → Configure → **Production branch** を `main` にして保存します
     （Chrome の自動翻訳では「生産部門」と表示されます）
   - **Base directory**：`monster-go` ← **ここが重要です**
   - Build command / Publish directory は `monster-go/netlify.toml` の内容が使われるので空欄のままで大丈夫です
4. デプロイする

### 2. Netlify Database を作る

1. プロジェクトのトップ画面で「Project navigation ▼」から **Database** を開く
2. 入力欄（AI エージェントに頼む欄）には何も書かず、その下の **「Or create a database manually instead」** をタップ
   → 空のデータベースが作られます。表（テーブル）とモンスターの初期データは、ゲームへの最初のアクセスで自動的に作られます
3. 「Your database is ready!」と出れば完了です

> 💡 環境変数の一覧には、DB の接続先は**表示されません**。これは正常です。
> 新しい方式では、接続先 `NETLIFY_DB_URL` はサイトが動くときに Netlify から直接渡されます。
>
> 💡 DB は 5 分間使われないと眠ります（節約のため）。しばらく放置したあとの最初のアクセスは数秒遅くなることがあります。

### 3. 管理画面のパスワードを設定する

1. Project configuration → **Environment variables** → **Add a variable** → **Add a single variable**
2. Key に `ADMIN_PASSWORD`、Values に好きなパスワードを入れる
   - 「Contains secret values」にチェックを入れると、パスワードが画面に表示されなくなります（おすすめ）。あとから見返せなくなるので、パスワードは控えておいてください
   - チェックを入れると Scopes が自動で「Specific scopes（Builds / Functions / Runtime）」に切り替わりますが、そのままで大丈夫です
3. **Create variable** で保存し、設定を反映するために再デプロイする（Deploys → Trigger deploy）

### 4. 動作確認

1. `https://（サイト名）.netlify.app/admin/` を開いて、`ADMIN_PASSWORD` でログインする
2. 地図を好きな場所へ動かし、「🎲 地図の中心付近にランダム生成」でポータル・ジム・モンスターを作る
   （もちろん 1 つずつ手で登録することもできます。地図をクリックすると緯度・経度が入ります）
3. `https://（サイト名）.netlify.app/` を開いてゲームを遊ぶ
4. `/admin/db.html` で、遊んだ結果が `players` / `captures` / `hacks` などに入っていることを確認する
   左上に「接続先：Netlify Database」と表示されていれば、Netlify Database を使えています

## 手元で動かす（開発用）

Postgres が必要です。

```bash
cd monster-go
npm install
cp .env.example .env   # LOCAL_DATABASE_URL と ADMIN_PASSWORD を自分の環境に合わせる
npm run dev
```

`npm run dev` だけで画面と API の両方が動きます（開発サーバーが `/api/*` を関数に渡します）。
`LOCAL_DATABASE_URL` があるときはローカルの Postgres を、ないときは Netlify Database（`NETLIFY_DB_URL`）を使います。

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
