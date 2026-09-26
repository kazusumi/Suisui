// Photos, movies and a local gallery (IndexedDB in this browser).
const DB = 'suisui-gallery';
const STORE = 'media';

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
    t.onerror = () => rej(t.error);
  });
}
export const gallery = {
  put: (item) => tx('readwrite', (s) => s.put(item)),
  del: (id) => tx('readwrite', (s) => s.delete(id)),
  all: () => tx('readonly', (s) => s.getAll()),
};

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  // H.264 MP4 where available (Safari), otherwise WebM (Chrome, Firefox)
  const list = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

export class Capture {
  constructor(canvas, audio) {
    this.canvas = canvas;
    this.audio = audio;
    this.pendingPhoto = null;
    this.rec = null;
    this.thumbCanvas = document.createElement('canvas');
    this.mime = pickMime();
    this.canRecord = this.mime !== null && !!canvas.captureStream;
  }

  thumb() {
    const c = this.canvas;
    const w = 360;
    const h = Math.round((w * c.height) / c.width);
    this.thumbCanvas.width = w;
    this.thumbCanvas.height = h;
    this.thumbCanvas.getContext('2d').drawImage(c, 0, 0, w, h);
    return this.thumbCanvas.toDataURL('image/jpeg', 0.8);
  }

  // Ask for a photo; it is grabbed right after the next render (WebGL buffers are cleared afterwards).
  photo(meta = {}) {
    return new Promise((res) => (this.pendingPhoto = { res, meta }));
  }

  // called by the main loop right after rendering to the screen
  afterRender() {
    // the recording's thumbnail is taken from the first rendered frame
    if (this.rec && !this.rec.thumb) this.rec.thumb = this.thumb();
    if (!this.pendingPhoto) return;
    const { res, meta } = this.pendingPhoto;
    this.pendingPhoto = null;
    const thumb = this.thumb();
    this.canvas.toBlob(
      async (blob) => {
        if (!blob) return res(null);
        const item = { id: `p${Date.now()}`, type: 'photo', blob, thumb, created: Date.now(), ...meta };
        await gallery.put(item).catch(() => {});
        res(item);
      },
      'image/jpeg',
      0.93
    );
  }

  get recording() {
    return !!this.rec;
  }

  startRecording(maxSec = 60) {
    if (!this.canRecord || this.rec) return false;
    const stream = this.canvas.captureStream(30);
    const as = this.audio.stream && this.audio.stream();
    if (as) as.getAudioTracks().forEach((t) => stream.addTrack(t));
    let mr;
    try {
      mr = new MediaRecorder(stream, this.mime ? { mimeType: this.mime, videoBitsPerSecond: 8_000_000 } : undefined);
    } catch (e) {
      return false;
    }
    const chunks = [];
    const t0 = performance.now();
    this.rec = { mr, t0, done: null, thumb: null };
    const rec = this.rec;
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((res) => {
      mr.onstop = async () => {
        stream.getVideoTracks().forEach((t) => t.stop());
        const type = mr.mimeType || this.mime || 'video/webm';
        const blob = new Blob(chunks, { type });
        const item = { id: `v${Date.now()}`, type: 'video', blob, thumb: rec.thumb, created: Date.now(), duration: (performance.now() - t0) / 1000, mime: type };
        await gallery.put(item).catch(() => {});
        res(item);
      };
    });
    this.rec.done = done;
    this.rec.timer = setTimeout(() => this.stopRecording(), maxSec * 1000);
    mr.start(1000);
    return true;
  }

  elapsed() {
    return this.rec ? (performance.now() - this.rec.t0) / 1000 : 0;
  }

  stopRecording() {
    if (!this.rec) return Promise.resolve(null);
    const { mr, done, timer } = this.rec;
    clearTimeout(timer);
    this.rec = null;
    if (mr.state !== 'inactive') mr.stop();
    return done;
  }
}

export function fileNameFor(item) {
  const d = new Date(item.created);
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const ext = item.type === 'photo' ? 'jpg' : (item.mime || item.blob.type).includes('mp4') ? 'mp4' : 'webm';
  return `submerged-city-${stamp}.${ext}`;
}

export function download(item) {
  const url = URL.createObjectURL(item.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileNameFor(item);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function share(item) {
  const file = new File([item.blob], fileNameFor(item), { type: item.blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'SUBMERGED CITY' });
      return true;
    } catch (e) {
      return e && e.name === 'AbortError';
    }
  }
  return false;
}
