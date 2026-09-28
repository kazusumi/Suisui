// 動作確認用の仮の曲（ファンク調・112 BPM）。chart.js の構成と同じ小節割りで作る。
// 本物の曲（chart.js の song.url）が用意されたら使われない。
import * as I from './instruments.js';
import { song } from './chart.js';

const CHORDS = [
  { root: 38, notes: [62, 65, 69, 72] }, // Dm7
  { root: 43, notes: [67, 71, 74, 77] }, // G7
  { root: 40, notes: [64, 67, 71, 74] }, // Em7
  { root: 45, notes: [69, 73, 76, 79] }, // A7
];
const BASS_16 = [[0, 0], [3, 12], [6, 0], [8, 7], [10, 12], [14, 10]]; // 16分の位置と音程
const MELODY = [ // [拍, 半音(D=62 基準), 長さ(拍)]
  [0, 0, 0.75], [1, 3, 0.5], [1.5, 5, 0.5], [2, 7, 1.5], [4, 10, 0.75], [5, 7, 0.5], [5.5, 5, 0.5], [6, 3, 1.5],
  [8, 0, 0.75], [9, 3, 0.5], [9.5, 7, 0.5], [10, 12, 1.5], [12, 10, 0.5], [12.5, 7, 0.5], [13, 5, 1], [14, 3, 2],
];

export async function buildTempSong(sampleRate = 22050) {
  const spb = 60 / song.bpm;
  const seconds = song.offset + (song.lengthBeats + 4) * spb;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const out = ctx.createGain();
  out.gain.value = 0.7;
  const comp = ctx.createDynamicsCompressor();
  out.connect(comp).connect(ctx.destination);
  const T = (beat) => song.offset + beat * spb;

  const bars = Math.floor(song.lengthBeats / 4);
  for (let bar = 0; bar < bars; bar++) {
    const b0 = bar * 4;
    const chord = CHORDS[bar % 4];
    const section =
      bar < 4 ? 'intro' : bar < 12 ? 'A' : bar < 16 ? 'build' : bar < 20 ? 'melody' : bar < 28 ? 'chorus' : bar < 30 ? 'break' : bar < 35 ? 'outro' : 'end';
    if (section === 'end') {
      if (bar === 35) { I.crash(ctx, out, T(b0)); I.stab(ctx, out, T(b0), CHORDS[0].notes, 1.2, 1.2); }
      continue;
    }

    // ハイハット
    for (let e = 0; e < 8; e++) {
      if (section === 'break' && e % 2 === 0) continue;
      const open = (section === 'chorus' || section === 'outro') && e % 2 === 1;
      I.hat(ctx, out, T(b0 + e / 2), section === 'intro' ? 0.6 : 1, open);
    }
    // キック・スネア
    if (section === 'chorus' || section === 'outro') {
      for (let q = 0; q < 4; q++) I.kick(ctx, out, T(b0 + q));
    } else if (section === 'build') {
      const n = bar < 14 ? 4 : 8;
      for (let k = 0; k < n; k++) I.kick(ctx, out, T(b0 + (k * 4) / n), 0.8);
    } else if (section !== 'break') {
      I.kick(ctx, out, T(b0));
      I.kick(ctx, out, T(b0 + 2.5), 0.8);
      if (section !== 'intro') I.kick(ctx, out, T(b0 + 2));
    }
    if (section !== 'intro' || bar >= 2) {
      const clapIt = section === 'chorus' || section === 'break';
      for (const q of [1, 3]) (clapIt ? I.clap : I.snare)(ctx, out, T(b0 + q));
    }
    if (section === 'build' && bar === 15) for (let s = 0; s < 8; s++) I.snare(ctx, out, T(b0 + 2 + s / 4), 0.4 + s * 0.08);
    if (section === 'build' && bar === 12) I.riser(ctx, out, T(b0), 16 * spb);

    // ベース
    if (section !== 'intro' || bar >= 2) {
      for (const [pos, semi] of BASS_16) {
        if (section === 'break' && pos > 0) continue;
        I.bass(ctx, out, T(b0 + pos / 4), I.noteHz(chord.root + semi), spb * 0.45);
      }
    }
    // コードのカッティング（裏拍）
    if (section === 'A' || section === 'chorus' || section === 'outro' || section === 'break') {
      for (const q of [0.5, 1.5, 2.75, 3.5]) I.stab(ctx, out, T(b0 + q), chord.notes, section === 'chorus' ? 1.2 : 0.9);
    }
    // メロディー
    if (section === 'melody' || section === 'outro') {
      const phraseBar = section === 'melody' ? bar - 16 : bar - 30;
      for (const [beat, semi, len] of MELODY) {
        if (Math.floor(beat / 4) !== phraseBar % 4) continue;
        I.lead(ctx, out, T(b0 + (beat % 4)), I.noteHz(62 + semi + 12), len * spb);
      }
    }
  }
  return ctx.startRendering();
}
