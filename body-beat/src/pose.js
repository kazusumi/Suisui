// 骨格認識（MediaPipe Pose Landmarker）。モデルと実行ファイルは同じサイトから配信する。
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

const BASE = import.meta.env.BASE_URL;

export async function createPoseDetector() {
  const vision = await FilesetResolver.forVisionTasks(`${BASE}mediapipe`);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: `${BASE}models/pose_landmarker_lite.task`, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  let landmarker;
  try {
    landmarker = await PoseLandmarker.createFromOptions(vision, options('GPU'));
  } catch (e) {
    console.warn('GPU が使えないので CPU で骨格認識します', e);
    landmarker = await PoseLandmarker.createFromOptions(vision, options('CPU'));
  }
  let lastTs = -1;
  return {
    // 映像の新しいフレームごとに呼ぶ。ランドマーク 33 点（映像の正規化座標）か null を返す
    detect(video, nowMs) {
      const ts = Math.max(nowMs, lastTs + 1);
      lastTs = ts;
      const r = landmarker.detectForVideo(video, ts);
      return r.landmarks?.[0] ?? null;
    },
  };
}

export async function startCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}
