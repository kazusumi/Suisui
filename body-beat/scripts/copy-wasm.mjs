// MediaPipe の実行ファイル（wasm）を public/ にコピーする。
// npm run dev / build の前に自動で実行される（CDN に頼らず同じサイトから配信するため）。
import { cpSync, mkdirSync } from 'node:fs';
const from = new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url);
const to = new URL('../public/mediapipe/', import.meta.url);
mkdirSync(to, { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) {
  cpSync(new URL(f, from), new URL(f, to));
}
console.log('copied MediaPipe wasm to public/mediapipe/');
