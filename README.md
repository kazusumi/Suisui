# SUBMERGED CITY

夕暮れの水没した小さな街を、自由に泳いで探索するブラウザ3D作品。
目的・スコア・戦闘はなく、水・光・空気感と「泳いでいて気持ちいいこと」だけに集中しています。

## 開発

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ に出力
npm run preview  # ビルド結果の確認
```

## Netlify へのデプロイ

`netlify.toml` 設定済みです。GitHub リポジトリを Netlify に接続すれば、そのまま自動デプロイされます。

- Build command: `npm run build`
- Publish directory: `dist`
- Node: 22

## 操作

| | PC | スマートフォン |
|---|---|---|
| 泳ぐ | WASD / 矢印キー | 左側の仮想スティック |
| 視点 | マウス（クリックでポインタロック） | 右側をスワイプ |
| 浮上 | Space / E | ▲ ボタン |
| 潜水 | Shift / Q / C（下を向いて前進しても潜る） | ▼ ボタン |
| メニュー | ESC → ☰ | ☰ |

## 構成

```
src/
  main.js               起動・ループ・UI・品質の自動調整
  globals.js            全マテリアル共通のuniform
  waves.js              Gerstner波（CPU側。GPUと同じ式）
  quality.js            HIGH / MEDIUM / LOW
  post.js               HDRシーンRT → 水中判定・フォグ・歪み・トーンマップ
  player.js / input.js  泳ぎの物理・キーボード/マウス/タッチ
  audio.js              Web Audio による合成サウンド（音声ファイルなし）
  shaders/common.js     波・空・ノイズ・コースティクスのGLSL
  world/                空・水面・地形・街・看板・マテリアル拡張
  fx/                   魚群・海藻・鳥・浮遊物・泡・粒子・光の筋・グロー
```

使用技術: Vite / Three.js (r186) / GLSL / Web Audio API。追加ライブラリなし。
