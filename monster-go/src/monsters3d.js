// 地図の上にモンスターを 3D で立たせる（MapLibre のカスタムレイヤー＋three.js）。
// モンスターに 3D モデルの URL（.glb）が登録されていればそれを、なければ仮のモデルを表示する。
// 仮のモデルは「色つきの丸いキャラ」で、ふわふわ上下しながらゆっくり回る。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MercatorCoordinate } from 'maplibre-gl';

const HEIGHT_M = 32; // 地図上での高さ（メートル）。ゲームらしく実物よりかなり大きめ

export function createMonsterLayer(map) {
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(1, 3, 2);
  scene.add(sun);

  const loader = new GLTFLoader();
  const modelCache = new Map(); // URL → Promise<正規化済みモデル>
  const shown = new Map(); // spawn id → { group, spawn }
  let renderer;
  let wanted = [];
  let failed = false;

  const layer = {
    id: 'monsters-3d',
    type: 'custom',
    renderingMode: '3d',
    onAdd(_map, gl) {
      try {
        renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
        renderer.autoClear = false;
        sync();
      } catch (e) {
        console.error('3D モンスターを表示できません', e);
        failed = true;
      }
    },
    render(_gl, args) {
      if (!renderer || !shown.size) return;
      // 地図の中心を原点にして、メートル単位・Y が上の座標で描く（遠い座標による精度落ちを防ぐ）
      const origin = MercatorCoordinate.fromLngLat(map.getCenter(), 0);
      const u = origin.meterInMercatorCoordinateUnits();
      const base = new THREE.Matrix4()
        .fromArray(args.defaultProjectionData.mainMatrix)
        .multiply(new THREE.Matrix4().makeTranslation(origin.x, origin.y, 0))
        .multiply(new THREE.Matrix4().makeScale(u, -u, u))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      camera.projectionMatrix = base;
      camera.projectionMatrixInverse.copy(base).invert();

      const t = performance.now() / 1000;
      for (const { group, spawn, phase } of shown.values()) {
        const mc = MercatorCoordinate.fromLngLat([spawn.lng, spawn.lat], 0);
        group.position.set((mc.x - origin.x) / u, 0, (mc.y - origin.y) / u);
        const body = group.userData.body;
        body.position.y = 0.08 + Math.abs(Math.sin(t * 2.2 + phase)) * 0.18; // ぴょんぴょん
        body.rotation.y = t * 0.6 + phase; // ゆっくり回る
        const squash = 1 + Math.sin(t * 4.4 + phase) * 0.04;
        body.scale.set(squash, 2 - squash, squash);
      }
      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint(); // 動かし続ける
    },
  };

  // 表示したいモンスターの一覧を受け取り、増えた分を足し・消えた分を消す
  function setSpawns(spawns) {
    wanted = spawns;
    sync();
  }

  function sync() {
    if (!renderer) return;
    const ids = new Set(wanted.map((s) => s.id));
    for (const [id, item] of shown) {
      if (!ids.has(id)) {
        scene.remove(item.group);
        shown.delete(id);
      }
    }
    for (const spawn of wanted) {
      const item = shown.get(spawn.id);
      if (item) {
        item.spawn = spawn;
        // 見た目に反映済みの状態と比べる（spawn は画面側で書き換えられることがあるため）
        if (item.model && item.faded !== !!spawn.caught) {
          setFaded(item.group, spawn.caught);
          item.faded = !!spawn.caught;
        }
        continue;
      }
      const group = new THREE.Group();
      const body = new THREE.Group();
      group.add(body);
      group.add(shadow());
      group.userData.body = body;
      group.scale.setScalar(HEIGHT_M);
      scene.add(group);
      const entry = { group, spawn, phase: (spawn.point_id * 1.7) % (Math.PI * 2), model: null, faded: false };
      shown.set(spawn.id, entry);
      buildModel(spawn).then((model) => {
        if (shown.get(spawn.id) !== entry) return;
        body.add(model);
        // 独自のカメラ行列を使っているので、three.js の画面外判定で消えないようにする
        group.traverse((o) => (o.frustumCulled = false));
        entry.model = model;
        entry.faded = !!entry.spawn.caught;
        setFaded(group, entry.faded);
      });
    }
    map.triggerRepaint();
  }

  async function buildModel(spawn) {
    if (spawn.model_url) {
      try {
        const source = await loadModel(spawn.model_url);
        return source.clone(true);
      } catch (e) {
        console.warn('3D モデルを読み込めないため仮のモデルを使います', spawn.model_url, e);
      }
    }
    return placeholder(spawn);
  }

  // .glb を読み込み、高さ 1・足元が 0・中心が原点になるようにそろえる
  function loadModel(url) {
    if (!modelCache.has(url)) {
      modelCache.set(
        url,
        loader.loadAsync(url).then((gltf) => {
          const obj = gltf.scene;
          const box = new THREE.Box3().setFromObject(obj);
          const size = box.getSize(new THREE.Vector3());
          const scale = 1 / Math.max(size.y, 1e-6);
          const wrapper = new THREE.Group();
          obj.scale.setScalar(scale);
          const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
          obj.position.set(-center.x, -box.min.y * scale, -center.z);
          wrapper.add(obj);
          return wrapper;
        }),
      );
    }
    return modelCache.get(url);
  }

  return { layer, setSpawns, get failed() { return failed; } };
}

// ---- 仮のモデル（色つきの丸いキャラ） ----

function placeholder(spawn) {
  const hue = ((spawn.monster_id * 137.5) % 360) / 360;
  const color = new THREE.Color().setHSL(hue, 0.65, 0.58);
  const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, ...extra });
  const g = new THREE.Group();

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 24), mat(color));
  body.scale.set(1, 1.1, 1);
  body.position.y = 0.4;
  g.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), mat(color.clone().lerp(new THREE.Color('#fff'), 0.6)));
  belly.position.set(0, 0.34, 0.17);
  belly.scale.set(1, 1, 0.5);
  g.add(belly);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), mat('#ffffff'));
    eye.position.set(side * 0.12, 0.55, 0.27);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), mat('#111827'));
    pupil.position.set(side * 0.12, 0.55, 0.335);
    g.add(pupil);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 16), mat(color.clone().offsetHSL(0, 0, -0.12)));
    ear.position.set(side * 0.19, 0.84, 0);
    ear.rotation.z = -side * 0.35;
    g.add(ear);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), mat(color.clone().offsetHSL(0, 0, -0.15)));
    foot.position.set(side * 0.15, 0.06, 0.08);
    foot.scale.set(1, 0.6, 1.3);
    g.add(foot);
  }

  if (spawn.rarity === 'legend') {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.025, 12, 40),
      mat('#fbbf24', { emissive: '#f59e0b', emissiveIntensity: 0.8, metalness: 0.6 }),
    );
    halo.position.y = 1.08;
    halo.rotation.x = Math.PI / 2;
    g.add(halo);
  } else if (spawn.rarity === 'rare') {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), mat('#a855f7', { emissive: '#7e22ce', emissiveIntensity: 0.6 }));
    gem.position.y = 0.98;
    g.add(gem);
  }
  return g;
}

function shadow() {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(0.3, 32),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.01;
  return m;
}

// 捕獲済みは半透明にする
function setFaded(group, faded) {
  group.traverse((o) => {
    if (!o.isMesh || !o.material || o.parent === group) return;
    if (!o.userData.ownMaterial) {
      o.material = o.material.clone(); // 読み込んだモデルは共有なので複製してから変える
      o.userData.ownMaterial = true;
      o.userData.baseOpacity = o.material.opacity;
    }
    o.material.transparent = faded || o.userData.baseOpacity < 1;
    o.material.opacity = faded ? 0.35 : o.userData.baseOpacity;
    o.material.needsUpdate = true; // 透明・不透明の切り替えは描画の設定を作り直す必要がある
  });
}
