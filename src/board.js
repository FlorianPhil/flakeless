import * as THREE from "three";

const TILE = 1.2;
const GAP = 0.14;
const STEP = TILE + GAP;
const CUBE = 0.82;
const CUBE_H = 0.48;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad(n) {
  return String(n).padStart(2, "0");
}

export function dateKey(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

export function monthLabel(y, m) {
  return new Date(y, m, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

function makeTileTexture(day, weekday, muted) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = muted ? "#d5ddd8" : "#eef3ef";
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = muted ? "#7a8a80" : "#1a2b24";
  ctx.font = "700 96px Outfit, Figtree, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(day), size / 2, size * 0.52);

  ctx.fillStyle = muted ? "#8a978e" : "#4a6358";
  ctx.font = "700 34px Figtree, system-ui, sans-serif";
  ctx.fillText(weekday, size / 2, size * 0.22);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class Board {
  constructor(container, { onToggleDate } = {}) {
    this.container = container;
    this.onToggleDate = onToggleDate;
    this.year = new Date().getFullYear();
    this.month = new Date().getMonth();
    this.users = {};
    this.picks = {};
    this.myId = null;
    this.disposed = false;
    this._tileByKey = new Map();
    this._pointer = new THREE.Vector2();
    this._raycaster = new THREE.Raycaster();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#101820");

    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const aspect = w / h;
    const frustum = 6.2;
    this.camera = new THREE.OrthographicCamera(
      -frustum * aspect,
      frustum * aspect,
      frustum,
      -frustum,
      0.1,
      100
    );
    this.camera.position.set(7.5, 9.5, 7.5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    const amb = new THREE.AmbientLight(0xffffff, 0.72);
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(4, 10, 2);
    const fill = new THREE.DirectionalLight(0x88aacc, 0.35);
    fill.position.set(-5, 4, -3);
    this.scene.add(amb, key, fill);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(11, 48),
      new THREE.MeshStandardMaterial({ color: "#162029", roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = false;
    this.scene.add(ground);

    this._bindInput();
    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);
    this._raf = requestAnimationFrame(() => this._loop());
    this.rebuildMonth();
  }

  setIdentity(userId) {
    this.myId = userId;
  }

  setState({ users, picks }) {
    this.users = users || {};
    this.picks = picks || {};
    this._rebuildStacks();
  }

  setMonth(year, month) {
    this.year = year;
    this.month = month;
    this.rebuildMonth();
  }

  shiftMonth(delta) {
    const d = new Date(this.year, this.month + delta, 1);
    this.setMonth(d.getFullYear(), d.getMonth());
  }

  resize() {
    if (this.disposed) return;
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const aspect = w / h;
    const frustum = 6.2;
    this.camera.left = -frustum * aspect;
    this.camera.right = frustum * aspect;
    this.camera.top = frustum;
    this.camera.bottom = -frustum;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
  }

  rebuildMonth() {
    while (this.root.children.length) {
      const obj = this.root.children.pop();
      this._disposeObject(obj);
    }
    this._tileByKey.clear();

    const first = new Date(this.year, this.month, 1);
    // Monday-first index
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(this.year, this.month + 1, 0).getDate();
    const cells = startPad + daysInMonth;
    const rows = Math.ceil(cells / 7);

    const width = 7 * STEP - GAP;
    const depth = rows * STEP - GAP;
    const ox = -width / 2 + TILE / 2;
    const oz = -depth / 2 + TILE / 2;

    for (let i = 0; i < cells; i++) {
      const col = i % 7;
      const row = Math.floor(i / 7);
      const dayNum = i - startPad + 1;
      const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
      if (!inMonth) continue;

      const key = dateKey(this.year, this.month, dayNum);
      const weekday = WEEKDAYS[col];
      const muted = col >= 5;
      const tex = makeTileTexture(dayNum, weekday, muted);

      const geo = new THREE.BoxGeometry(TILE, 0.18, TILE);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.55,
        metalness: 0.05,
        color: 0xffffff,
      });
      const tile = new THREE.Mesh(geo, mat);
      tile.position.set(ox + col * STEP, 0.09, oz + row * STEP);
      tile.userData = { dateKey: key, kind: "tile" };

      const rim = new THREE.Mesh(
        new THREE.BoxGeometry(TILE + 0.04, 0.06, TILE + 0.04),
        new THREE.MeshStandardMaterial({ color: muted ? "#9aa89f" : "#c9d5cd", roughness: 0.8 })
      );
      rim.position.y = -0.08;
      tile.add(rim);

      const stack = new THREE.Group();
      stack.position.y = 0.12;
      tile.add(stack);
      tile.userData.stack = stack;

      this.root.add(tile);
      this._tileByKey.set(key, tile);
    }

    this._rebuildStacks();
  }

  _rebuildStacks() {
    let maxCount = 0;
    for (const ids of Object.values(this.picks)) {
      maxCount = Math.max(maxCount, ids?.length || 0);
    }

    for (const [key, tile] of this._tileByKey) {
      const stack = tile.userData.stack;
      while (stack.children.length) {
        const c = stack.children.pop();
        this._disposeObject(c);
      }

      const ids = this.picks[key] || [];
      ids.forEach((uid, i) => {
        const color = this.users[uid]?.color || "#888888";
        const mine = uid === this.myId;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(CUBE, CUBE_H, CUBE),
          new THREE.MeshStandardMaterial({
            color,
            roughness: 0.35,
            metalness: 0.15,
            emissive: mine ? new THREE.Color(color) : new THREE.Color(0x000000),
            emissiveIntensity: mine ? 0.18 : 0,
          })
        );
        mesh.position.y = CUBE_H / 2 + i * (CUBE_H + 0.04);
        mesh.rotation.y = ((i % 3) - 1) * 0.08;
        mesh.userData = { dateKey: key, kind: "cube" };
        stack.add(mesh);
      });

      const hot = ids.length > 0 && ids.length === maxCount && maxCount >= 2;
      tile.material.emissive = new THREE.Color(hot ? "#2dd4a8" : "#000000");
      tile.material.emissiveIntensity = hot ? 0.22 : 0;
    }
  }

  _bindInput() {
    const el = this.renderer.domElement;
    let downX = 0;
    let downY = 0;
    let moved = false;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    this._yaw = Math.PI / 4;
    this._pitch = 0.95;
    this._distance = 13;

    const applyCam = () => {
      const x = Math.sin(this._yaw) * Math.cos(this._pitch) * this._distance;
      const y = Math.sin(this._pitch) * this._distance;
      const z = Math.cos(this._yaw) * Math.cos(this._pitch) * this._distance;
      this.camera.position.set(x, y, z);
      this.camera.lookAt(0, 0.5, 0);
    };
    applyCam();
    this._applyCam = applyCam;

    const onDown = (e) => {
      const p = e.touches ? e.touches[0] : e;
      downX = p.clientX;
      downY = p.clientY;
      lastX = p.clientX;
      lastY = p.clientY;
      moved = false;
      dragging = true;
    };

    const onMove = (e) => {
      if (!dragging) return;
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - lastX;
      const dy = p.clientY - lastY;
      if (Math.abs(p.clientX - downX) + Math.abs(p.clientY - downY) > 10) moved = true;
      lastX = p.clientX;
      lastY = p.clientY;
      this._yaw -= dx * 0.005;
      this._pitch = Math.min(1.25, Math.max(0.45, this._pitch + dy * 0.004));
      applyCam();
    };

    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      if (moved) return;
      const p = e.changedTouches ? e.changedTouches[0] : e;
      this._pickAt(p.clientX, p.clientY);
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this._distance = Math.min(18, Math.max(8, this._distance + e.deltaY * 0.01));
        applyCam();
      },
      { passive: false }
    );

    this._unbind = () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }

  _pickAt(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const hits = this._raycaster.intersectObjects([...this._tileByKey.values()], true);
    for (const hit of hits) {
      let obj = hit.object;
      while (obj && !obj.userData?.dateKey) obj = obj.parent;
      if (obj?.userData?.dateKey) {
        this.onToggleDate?.(obj.userData.dateKey);
        return;
      }
    }
  }

  _loop() {
    if (this.disposed) return;
    this._raf = requestAnimationFrame(() => this._loop());
    this.renderer.render(this.scene, this.camera);
  }

  _disposeObject(obj) {
    obj.traverse?.((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          m.map?.dispose?.();
          m.dispose?.();
        }
      }
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    this._unbind?.();
    while (this.root.children.length) this._disposeObject(this.root.children.pop());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
