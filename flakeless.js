import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const UID_KEY = "flakeless-uid";
const SETTINGS_KEY = "flakeless-settings-v4";

const presetColors = [
  "#ff5a3c",
  "#ffd166",
  "#2ec4b6",
  "#4d96ff",
  "#7b61ff",
  "#ef476f",
  "#06d6a0",
  "#f8f9ff",
  "#1f2937"
];

async function fetchState() {
  try {
    const res = await fetch("/api/state");
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return { users: {}, picks: {} };
  }
}

const defaultSettings = {
  yaw: 10,
  pitch: 0,
  animSpeed: 1.85,
  mouseFollow: true,
  dateCaps: false,
  viewMode: "one",
  activeMonth: 0
};

const loadSettings = () => {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
  } catch {
    return { ...defaultSettings };
  }
};

const saveSettings = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

function getMyId() {
  const existing = localStorage.getItem(UID_KEY);
  if (existing) return existing;
  const next = `u_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(UID_KEY, next);
  return next;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getMonthData(offset) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = first.getFullYear();
  const month = first.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const start = (first.getDay() + 6) % 7;
  const weeks = [];
  let day = 1;

  for (let r = 0; r < 6; r += 1) {
    const week = [];
    for (let c = 0; c < 7; c += 1) {
      const cell = r * 7 + c;
      if (cell < start || day > daysInMonth) {
        week.push(null);
      } else {
        week.push(day);
        day += 1;
      }
    }
    weeks.push(week);
  }

  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(first);
  return {
    month,
    year,
    weeks,
    label,
    key: (d) => `${year}-${pad2(month + 1)}-${pad2(d)}`
  };
}

function takenColors() {
  const set = new Set();
  for (const [uid, user] of Object.entries(state.users)) {
    if (uid === myId) continue;
    set.add(user.color);
  }
  return set;
}

function pickFirstAvailableColor() {
  const taken = takenColors();
  return presetColors.find((color) => !taken.has(color)) || presetColors[0];
}

function committedSetForMe() {
  const committed = new Set();
  for (const [dateKey, uids] of Object.entries(state.picks)) {
    if (uids.includes(myId)) committed.add(dateKey);
  }
  return committed;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function plural(count, singular, pluralText = `${singular}s`) {
  return count === 1 ? singular : pluralText;
}

let state = { users: {}, picks: {} };

const myId = getMyId();
const monthWindow = [getMonthData(1), getMonthData(2), getMonthData(3)];

const nameField = document.getElementById("name-field");
const nameInput = document.getElementById("name-input");
const nameError = document.getElementById("name-error");
const swatchesEl = document.getElementById("color-swatches");
const lockBtn = document.getElementById("lock-btn");
const resetBtn = document.getElementById("reset-btn");
const statusEl = document.getElementById("status");
const legendEl = document.getElementById("legend");
const canvas = document.getElementById("scene-canvas");
const scenePanel = document.querySelector(".scene-panel");
const viewThreeBtn = document.getElementById("view-three-btn");
const viewOneBtn = document.getElementById("view-one-btn");
const prevMonthBtn = document.getElementById("prev-month-btn");
const nextMonthBtn = document.getElementById("next-month-btn");
const focusMonthLabel = document.getElementById("focus-month-label");

const savedUser = state.users[myId] || {};
let myName = savedUser.name || "";
let myColor = savedUser.color && !takenColors().has(savedUser.color)
  ? savedUser.color
  : pickFirstAvailableColor();
let pending = committedSetForMe();
let settings = loadSettings();
if (!["one", "three"].includes(settings.viewMode)) settings.viewMode = defaultSettings.viewMode;
if (window.innerWidth <= 720) settings.viewMode = "one";
settings.activeMonth = Math.min(Math.max(Number(settings.activeMonth) || 0, 0), monthWindow.length - 1);

nameInput.value = myName;

const TILE_SIZE = 1;
const TILE_GAP = 0.18;
const TILE_STEP = TILE_SIZE + TILE_GAP;
const TILE_HEIGHT = 0.16;
const COLS = 7;
const ROWS = 6;
const PAD_X = 0.58;
const PAD_Z_TOP = 1.52;
const PAD_Z_BOT = 0.58;
const BOARD_W = COLS * TILE_STEP - TILE_GAP + PAD_X * 2;
const BOARD_D = ROWS * TILE_STEP - TILE_GAP + PAD_Z_TOP + PAD_Z_BOT;
const BOARD_H = 0.24;
const BOARD_GAP = 1.18;
const TOTAL_W = BOARD_W * 3 + BOARD_GAP * 2;
const CUBE_SIZE = 0.52;
const CUBE_GAP = 0;
const CUBE_STEP = CUBE_SIZE + CUBE_GAP;
const HOVER_LIFT = 0.16;
const FOCUSED_BOARD_SCALE = 1.22;
const MONTH_SLIDE_DISTANCE = BOARD_W * 1.24;
const MONTH_SLIDE_DURATION = 0.48;
const MOUSE_DRIFT_X = 0.11;
const MOUSE_DRIFT_Y = 0.28;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const sceneRoot = new THREE.Group();
scene.add(sceneRoot);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.set(8.4, 9.1, 11.4);
camera.lookAt(0, 0, 0);

const hemi = new THREE.HemisphereLight(0xffffff, 0xdfe7f0, 2.45);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0xffffff, 3.25);
keyLight.position.set(-7, 12, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -22;
keyLight.shadow.camera.right = 22;
keyLight.shadow.camera.top = 18;
keyLight.shadow.camera.bottom = -18;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xbcecff, 1.05);
rimLight.position.set(8, 5, -9);
scene.add(rimLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(TOTAL_W + 10, BOARD_D + 12),
  new THREE.ShadowMaterial({ opacity: 0.18 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.015;
ground.receiveShadow = true;
scene.add(ground);

const boardGeometry = new RoundedBoxGeometry(BOARD_W, BOARD_H, BOARD_D, 3, 0.08);
const tileGeometry = new RoundedBoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE, 2, 0.035);
const cubeGeometry = new RoundedBoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, 2, 0.035);

const boardMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color("#f8f9ff"),
  roughness: 0.82,
  metalness: 0.01
});

const tileMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color("#ffffff"),
  roughness: 0.78,
  metalness: 0
});

const tileEdgeMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color("#dfe5ed"),
  roughness: 0.84,
  metalness: 0
});

const textPlaneGeometry = new THREE.PlaneGeometry(1, 1);
const cubeMatCache = new Map();
const boards = [];
const springs = [];
let sceneReady = false;
let hoveredTileGroup = null;
let targetMouseRotX = 0;
let targetMouseRotY = 0;
let curMouseRotX = 0;
let curMouseRotY = 0;
let monthTransition = null;

function cubeMat(hex, ghost) {
  const key = `${hex}${ghost ? "-g" : ""}`;
  if (cubeMatCache.has(key)) return cubeMatCache.get(key);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: 0.66,
    metalness: 0,
    transparent: true,
    opacity: ghost ? 0.48 : 0.96
  });
  cubeMatCache.set(key, material);
  return material;
}

function makeTextTexture(text, options = {}) {
  const width = options.width || 512;
  const height = options.height || 160;
  const canvasEl = document.createElement("canvas");
  canvasEl.width = width;
  canvasEl.height = height;
  const ctx = canvasEl.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = options.color || "#1f2937";
  ctx.textAlign = options.align || "center";
  ctx.textBaseline = "middle";
  ctx.font = options.font || "800 92px Inter, system-ui, sans-serif";
  const x = options.align === "left" ? 12 : width / 2;
  ctx.fillText(text, x, height / 2 + (options.yOffset || 0));
  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function makeTextPlane(text, width, height, options = {}) {
  const texture = makeTextTexture(text, options);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(textPlaneGeometry, material);
  mesh.scale.set(width, height, 1);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = options.renderOrder || 2;
  return mesh;
}

function makeDateCap(day) {
  const canvasEl = document.createElement("canvas");
  canvasEl.width = 128;
  canvasEl.height = 88;
  const ctx = canvasEl.getContext("2d");
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(31, 41, 55, 0.22)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(12, 12, 104, 64, 18);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#1f2937";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 44px Inter, system-ui, sans-serif";
  ctx.fillText(String(day), 64, 45);

  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false
  });
  const cap = new THREE.Mesh(textPlaneGeometry, material);
  cap.scale.set(0.42, 0.29, 1);
  cap.rotation.x = -Math.PI / 2;
  cap.renderOrder = 9;
  cap.position.set(0, CUBE_SIZE / 2 + 0.025, 0);
  cap.userData.day = day;
  return cap;
}

function removeDateCap(cubeRef) {
  const cap = cubeRef.mesh.userData.dateCap;
  if (!cap) return;
  cubeRef.mesh.remove(cap);
  delete cubeRef.mesh.userData.dateCap;
}

function updateTowerDateCap(tileEntry, dateKey) {
  const activeCubes = tileEntry.tower.userData.cubes.filter((cubeRef) => !cubeRef.leaving);
  const topCube = activeCubes.at(-1);
  for (const cubeRef of activeCubes) {
    if (cubeRef !== topCube || !settings.dateCaps) removeDateCap(cubeRef);
  }

  if (!settings.dateCaps || !topCube) return;
  const day = Number(dateKey.slice(-2));
  const existing = topCube.mesh.userData.dateCap;
  if (existing && existing.userData.day === day) return;
  removeDateCap(topCube);
  const cap = makeDateCap(day);
  topCube.mesh.userData.dateCap = cap;
  topCube.mesh.add(cap);
}

function refreshDateCaps() {
  if (!sceneReady) return;
  for (const board of boards) {
    for (const [dateKey, tileEntry] of board.tiles) {
      updateTowerDateCap(tileEntry, dateKey);
    }
  }
}

function buildBoard(index, monthData) {
  const boardGroup = new THREE.Group();
  const originalX = -TOTAL_W / 2 + BOARD_W / 2 + index * (BOARD_W + BOARD_GAP);
  boardGroup.position.x = originalX;
  sceneRoot.add(boardGroup);

  const boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);
  boardMesh.position.y = BOARD_H / 2;
  boardMesh.castShadow = true;
  boardMesh.receiveShadow = true;
  boardGroup.add(boardMesh);

  const label = makeTextPlane(monthData.label, 4.8, 0.74, {
    width: 768,
    height: 160,
    color: "#1f2937",
    font: "800 78px Inter, system-ui, sans-serif"
  });
  label.position.set(0, BOARD_H + 0.026, -BOARD_D / 2 + 0.42);
  boardGroup.add(label);

  const weekdays = ["M", "T", "W", "T", "F", "S", "S"];
  const gridW = COLS * TILE_STEP - TILE_GAP;
  const gridD = ROWS * TILE_STEP - TILE_GAP;
  const tilesOriginX = -gridW / 2 + TILE_SIZE / 2;
  const tilesOriginZ = -BOARD_D / 2 + PAD_Z_TOP + TILE_SIZE / 2;

  weekdays.forEach((day, c) => {
    const weekday = makeTextPlane(day, 0.42, 0.28, {
      width: 128,
      height: 128,
      color: "#7b8495",
      font: "800 76px Inter, system-ui, sans-serif"
    });
    weekday.position.set(tilesOriginX + c * TILE_STEP, BOARD_H + 0.028, -BOARD_D / 2 + 1.08);
    boardGroup.add(weekday);
  });

  const tiles = new Map();
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const day = monthData.weeks[r][c];
      if (!day) continue;

      const dateKey = monthData.key(day);
      const tileGroup = new THREE.Group();
      const x = tilesOriginX + c * TILE_STEP;
      const z = tilesOriginZ + r * TILE_STEP;
      const baseY = BOARD_H + 0.012;
      tileGroup.position.set(x, baseY, z);
      tileGroup.userData = { dateKey, hover: false, lift: 0, baseY };
      boardGroup.add(tileGroup);

      const tile = new THREE.Mesh(tileGeometry, [tileMaterial, tileMaterial, tileEdgeMaterial, tileEdgeMaterial, tileMaterial, tileMaterial]);
      tile.position.y = TILE_HEIGHT / 2;
      tile.castShadow = true;
      tile.receiveShadow = true;
      tile.userData.tileGroup = tileGroup;
      tileGroup.add(tile);

      const number = makeTextPlane(String(day), 0.42, 0.28, {
        width: 128,
        height: 96,
        color: "#243044",
        font: "800 72px Inter, system-ui, sans-serif",
        renderOrder: 4
      });
      number.position.set(TILE_SIZE * 0.27, TILE_HEIGHT + 0.014, TILE_SIZE * 0.27);
      tileGroup.add(number);

      const tower = new THREE.Group();
      tower.position.set(-TILE_SIZE * 0.26, TILE_HEIGHT + 0.02, -TILE_SIZE * 0.26);
      tower.userData.cubes = [];
      tileGroup.add(tower);

      tiles.set(dateKey, { tileGroup, tile, tower, baseY, x, z });
    }
  }

  boards.push({ group: boardGroup, tiles, monthData, gridD, originalX });
}

function tileMeshes() {
  const meshes = [];
  for (const board of boards) {
    if (!board.group.visible) continue;
    for (const tile of board.tiles.values()) meshes.push(tile.tile);
  }
  return meshes;
}

function findTileEntry(dateKey) {
  for (const board of boards) {
    const tile = board.tiles.get(dateKey);
    if (tile) return tile;
  }
  return null;
}

function computeOccupants(dateKey) {
  const occupants = [];
  for (const uid of state.picks[dateKey] || []) {
    if (uid === myId) continue;
    const user = state.users[uid];
    if (!user) continue;
    occupants.push({ key: uid, color: user.color, ghost: false });
  }

  if (pending.has(dateKey)) {
    const ghost = !(state.picks[dateKey] || []).includes(myId);
    occupants.push({ key: "me", color: myColor, ghost });
  }

  return occupants;
}

function cubeRestY(index) {
  return CUBE_SIZE / 2 + index * CUBE_STEP;
}

function removeCubeRef(tower, cubeRef) {
  removeDateCap(cubeRef);
  tower.remove(cubeRef.mesh);
  const cubes = tower.userData.cubes;
  const index = cubes.indexOf(cubeRef);
  if (index >= 0) cubes.splice(index, 1);
}

function updateCubeRef(cubeRef, desired) {
  if (cubeRef.color === desired.color && cubeRef.ghost === desired.ghost) return;
  cubeRef.color = desired.color;
  cubeRef.ghost = desired.ghost;
  cubeRef.mesh.material = cubeMat(desired.color, desired.ghost);
}

function addCube(tower, desired, stackIndex, animateNew) {
  const mesh = new THREE.Mesh(cubeGeometry, cubeMat(desired.color, desired.ghost));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const targetY = cubeRestY(stackIndex);
  mesh.position.set(0, animateNew ? targetY + 1.4 : targetY, 0);
  const cubeRef = {
    key: desired.key,
    color: desired.color,
    ghost: desired.ghost,
    mesh,
    leaving: false
  };
  tower.add(mesh);

  if (animateNew) {
    springs.push({
      obj: mesh,
      t: -stackIndex * 0.055,
      dur: 0.62,
      startY: targetY + 1.4,
      targetY,
      mode: "drop"
    });
  }

  return cubeRef;
}

function queueLift(tower, cubeRef) {
  springs.push({
    obj: cubeRef.mesh,
    t: 0,
    dur: 0.58,
    startY: cubeRef.mesh.position.y,
    targetY: cubeRef.mesh.position.y + 1.42,
    mode: "lift",
    tower,
    cubeRef
  });
}

function syncTile(dateKey, tileEntry, opts = {}) {
  if (!sceneReady || !tileEntry) return;

  const animateNew = !!opts.animateNew;
  const animateRemove = !!opts.animateRemove;
  const tower = tileEntry.tower;
  const current = tower.userData.cubes || [];
  const desired = computeOccupants(dateKey);
  const desiredByKey = new Map(desired.map((item) => [item.key, item]));
  const activeByKey = new Map();

  for (const cubeRef of current) {
    if (cubeRef.leaving) continue;
    if (!desiredByKey.has(cubeRef.key)) {
      cubeRef.leaving = true;
      removeDateCap(cubeRef);
      for (let i = springs.length - 1; i >= 0; i--) {
        if (springs[i].obj === cubeRef.mesh && springs[i].mode === "drop") springs.splice(i, 1);
      }
      if (animateRemove) queueLift(tower, cubeRef);
      else removeCubeRef(tower, cubeRef);
    } else {
      activeByKey.set(cubeRef.key, cubeRef);
    }
  }

  const activeRefs = [];
  desired.forEach((desiredCube, index) => {
    let cubeRef = activeByKey.get(desiredCube.key);
    if (cubeRef) {
      updateCubeRef(cubeRef, desiredCube);
    } else {
      cubeRef = addCube(tower, desiredCube, index, animateNew);
    }
    cubeRef.leaving = false;
    if (!animateNew || activeByKey.has(desiredCube.key)) {
      cubeRef.mesh.position.y = cubeRestY(index);
      cubeRef.mesh.scale.set(1, 1, 1);
    }
    activeRefs.push(cubeRef);
  });

  const leavingRefs = tower.userData.cubes.filter((cubeRef) => cubeRef.leaving);
  tower.userData.cubes = [...activeRefs, ...leavingRefs];
  updateTowerDateCap(tileEntry, dateKey);
}

function syncAll(opts = {}) {
  if (!sceneReady) return;
  for (const board of boards) {
    for (const [dateKey, tileEntry] of board.tiles) {
      syncTile(dateKey, tileEntry, opts);
    }
  }
}

function syncMyColor() {
  if (!sceneReady) return;
  for (const dateKey of pending) {
    const tileEntry = findTileEntry(dateKey);
    if (!tileEntry) continue;
    const cubeRef = tileEntry.tower.userData.cubes.find((cube) => cube.key === "me" && !cube.leaving);
    if (!cubeRef) continue;
    updateCubeRef(cubeRef, { key: "me", color: myColor, ghost: !(state.picks[dateKey] || []).includes(myId) });
  }
}

async function lockPicks() {
  myName = nameInput.value.trim();
  if (!myName) {
    setNameWarning(true, "Name required before locking picks.");
    nameInput.focus();
    renderStatus("Name required.");
    return;
  }
  if (pending.size === 0) {
    renderStatus("No dates selected.");
    return;
  }

  lockBtn.disabled = true;
  renderStatus("Saving...");

  try {
    const res = await fetch("/api/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: myId, name: myName, color: myColor, dates: [...pending] })
    });
    if (!res.ok) throw new Error();
    state = await fetchState();
    syncAll({ animateNew: false, animateRemove: false });
    renderSwatches();
    renderLegend();
    renderStatus(`Locked ${pending.size} ${plural(pending.size, "date")}.`);
  } catch {
    renderStatus("Save failed. Check connection.");
    lockBtn.disabled = false;
  }
}

function resetPending() {
  pending = committedSetForMe();
  syncAll({ animateNew: true, animateRemove: true });
  renderLegend();
  renderStatus();
}

function tileClick(dateKey) {
  myName = nameInput.value.trim();
  if (!myName) {
    setNameWarning(true);
    nameInput.focus();
    renderStatus("Name required.");
    return;
  }

  if (pending.has(dateKey)) pending.delete(dateKey);
  else pending.add(dateKey);

  const tileEntry = findTileEntry(dateKey);
  syncTile(dateKey, tileEntry, { animateNew: true, animateRemove: true });
  renderLegend();
  renderStatus();
}

function selectColor(color) {
  if (takenColors().has(color)) return;
  myColor = color;
  syncMyColor();
  renderSwatches();
  renderLegend();
  renderStatus();
}

function renderSwatches() {
  const taken = takenColors();
  swatchesEl.replaceChildren();
  presetColors.forEach((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch";
    button.style.setProperty("--swatch", color);
    button.disabled = taken.has(color);
    button.setAttribute("aria-label", button.disabled ? `${color} taken` : color);
    button.setAttribute("aria-pressed", String(color === myColor));
    if (!button.disabled) button.addEventListener("click", () => selectColor(color));
    swatchesEl.append(button);
  });
}

function countCommittedPicks(uid) {
  let count = 0;
  for (const uids of Object.values(state.picks)) {
    if (uids.includes(uid)) count += 1;
  }
  return count;
}

function renderLegend() {
  const rows = Object.entries(state.users)
    .filter(([uid]) => uid !== myId)
    .map(([uid, user]) => ({ uid, name: user.name, color: user.color, count: countCommittedPicks(uid), you: false }));

  const displayName = nameInput.value.trim() || state.users[myId]?.name;
  if (displayName || pending.size > 0) {
    rows.push({ uid: myId, name: displayName || "You", color: myColor, count: pending.size, you: true });
  }

  rows.sort((a, b) => {
    if (a.you) return 1;
    if (b.you) return -1;
    return b.count - a.count || a.name.localeCompare(b.name);
  });

  legendEl.replaceChildren();
  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "legend-row";
    item.innerHTML = `
      <span class="legend-dot" style="--dot: ${row.color}"></span>
      <span class="legend-name">${row.name}${row.you ? " (you)" : ""}</span>
      <span class="legend-count">${row.count}</span>
    `;
    legendEl.append(item);
  }
}

function renderStatus(message) {
  const committed = committedSetForMe();
  const dirtyPicks = !setsEqual(pending, committed);
  const saved = state.users[myId] || {};
  const currentName = nameInput.value.trim();
  const dirtyProfile = !!currentName && (currentName !== (saved.name || "") || myColor !== saved.color);
  const ready = currentName.length > 0 && pending.size > 0 && !takenColors().has(myColor);
  lockBtn.disabled = !ready;
  resetBtn.disabled = !dirtyPicks;

  if (message) {
    statusEl.textContent = message;
    return;
  }

  if (!currentName) {
    statusEl.textContent = "Name required.";
  } else if (pending.size === 0) {
    statusEl.textContent = "No dates selected.";
  } else if (dirtyPicks || dirtyProfile) {
    statusEl.textContent = `${pending.size} pending ${plural(pending.size, "date")}.`;
  } else {
    statusEl.textContent = `${pending.size} locked ${plural(pending.size, "date")}.`;
  }
}

function setNameWarning(show, message = "Name required before choosing dates.") {
  nameField.classList.toggle("has-error", show);
  nameInput.setAttribute("aria-invalid", String(show));
  nameError.hidden = !show;
  if (show) nameError.textContent = message;
}

function renderViewControls() {
  const isOne = settings.viewMode === "one";
  viewThreeBtn.setAttribute("aria-pressed", String(!isOne));
  viewOneBtn.setAttribute("aria-pressed", String(isOne));
  prevMonthBtn.disabled = !isOne || settings.activeMonth <= 0;
  nextMonthBtn.disabled = !isOne || settings.activeMonth >= monthWindow.length - 1;
  scenePanel.classList.toggle("show-month-arrows", isOne);
  const label = isOne
    ? monthWindow[settings.activeMonth].label
    : `${monthWindow[0].label.split(" ")[0]} - ${monthWindow.at(-1).label.split(" ")[0]}`;
  focusMonthLabel.value = label;
  focusMonthLabel.textContent = label;
}

function applyMonthView() {
  const isOne = settings.viewMode === "one";
  if (!isOne) monthTransition = null;
  boards.forEach((board, index) => {
    const isActive = index === settings.activeMonth;
    board.group.visible = !isOne || isActive;
    board.group.position.x = isOne ? 0 : board.originalX;
    const scale = isOne && isActive ? FOCUSED_BOARD_SCALE : 1;
    board.group.scale.set(scale, scale, scale);
  });
  renderViewControls();
  resize();
}

function beginMonthSlide(fromIndex, toIndex) {
  if (fromIndex === toIndex) {
    applyMonthView();
    return;
  }

  const direction = toIndex > fromIndex ? 1 : -1;
  monthTransition = {
    fromIndex,
    toIndex,
    direction,
    t: 0,
    dur: MONTH_SLIDE_DURATION
  };

  boards.forEach((board, index) => {
    const active = index === fromIndex || index === toIndex;
    board.group.visible = active;
    board.group.position.x = index === toIndex ? direction * MONTH_SLIDE_DISTANCE : 0;
    const scale = active ? FOCUSED_BOARD_SCALE : 1;
    board.group.scale.set(scale, scale, scale);
  });

  renderViewControls();
  resize();
}

function setViewMode(mode) {
  settings.viewMode = mode;
  saveSettings();
  applyMonthView();
}

function stepFocusedMonth(delta) {
  const previousMonth = settings.activeMonth;
  const nextMonth = Math.min(Math.max(settings.activeMonth + delta, 0), monthWindow.length - 1);
  if (nextMonth === previousMonth) return;
  settings.viewMode = "one";
  settings.activeMonth = nextMonth;
  saveSettings();
  beginMonthSlide(previousMonth, nextMonth);
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function setPointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function tileGroupFromEvent(event) {
  setPointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(tileMeshes(), false);
  return hits[0]?.object.userData.tileGroup || null;
}

function setHover(next) {
  if (hoveredTileGroup === next) return;
  if (hoveredTileGroup) hoveredTileGroup.userData.hover = false;
  hoveredTileGroup = next;
  if (hoveredTileGroup) hoveredTileGroup.userData.hover = true;
  canvas.style.cursor = hoveredTileGroup ? "pointer" : "default";
}

function updateMouseRotation(event) {
  if (!settings.mouseFollow) {
    targetMouseRotX = 0;
    targetMouseRotY = 0;
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const rx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ry = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  targetMouseRotY = rx * MOUSE_DRIFT_Y;
  targetMouseRotX = -ry * MOUSE_DRIFT_X;
}

canvas.addEventListener("mousemove", (event) => {
  setHover(tileGroupFromEvent(event));
  updateMouseRotation(event);
});

canvas.addEventListener("mouseleave", () => {
  setHover(null);
  targetMouseRotX = 0;
  targetMouseRotY = 0;
});

canvas.addEventListener("click", (event) => {
  const tileGroup = tileGroupFromEvent(event);
  if (!tileGroup) return;
  tileClick(tileGroup.userData.dateKey);
});

let touchStartX = 0;
let touchStartY = 0;
let touchMoved = false;

canvas.addEventListener("touchstart", (event) => {
  if (event.touches.length !== 1) return;
  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;
  touchMoved = false;
}, { passive: true });

canvas.addEventListener("touchmove", (event) => {
  if (event.touches.length !== 1) return;
  event.preventDefault();
  const dx = event.touches[0].clientX - touchStartX;
  const dy = event.touches[0].clientY - touchStartY;
  if (Math.abs(dx) > 6 || Math.abs(dy) > 6) touchMoved = true;
  updateMouseRotation({ clientX: event.touches[0].clientX, clientY: event.touches[0].clientY });
}, { passive: false });

canvas.addEventListener("touchend", (event) => {
  targetMouseRotX = 0;
  targetMouseRotY = 0;
  if (!touchMoved) {
    const touch = event.changedTouches[0];
    const tileGroup = tileGroupFromEvent({ clientX: touch.clientX, clientY: touch.clientY });
    if (tileGroup) {
      event.preventDefault();
      tileClick(tileGroup.userData.dateKey);
    }
  }
});

nameInput.addEventListener("input", () => {
  myName = nameInput.value.trim();
  if (myName) setNameWarning(false);
  renderLegend();
  renderStatus();
});

lockBtn.addEventListener("click", lockPicks);
resetBtn.addEventListener("click", resetPending);
viewThreeBtn.addEventListener("click", () => setViewMode("three"));
viewOneBtn.addEventListener("click", () => setViewMode("one"));
prevMonthBtn.addEventListener("click", () => stepFocusedMonth(-1));
nextMonthBtn.addEventListener("click", () => stepFocusedMonth(1));

function updateSprings(dt) {
  for (let i = springs.length - 1; i >= 0; i -= 1) {
    const spring = springs[i];
    spring.t += dt;
    if (spring.t < 0) continue;

    const p = Math.min(spring.t / spring.dur, 1);
    if (spring.mode === "drop") {
      if (p < 0.78) {
        const u = p / 0.78;
        const eased = u * u;
        spring.obj.position.y = THREE.MathUtils.lerp(spring.startY, spring.targetY, eased);
        spring.obj.scale.set(0.94, 1.08, 0.94);
      } else {
        const u = (p - 0.78) / 0.22;
        const squash = Math.sin(u * Math.PI) * 0.16;
        spring.obj.position.y = spring.targetY;
        spring.obj.scale.set(1 + squash * 0.42, 1 - squash, 1 + squash * 0.42);
      }
    } else if (spring.mode === "lift") {
      if (p < 0.22) {
        const u = p / 0.22;
        const squash = Math.sin(u * Math.PI) * 0.18;
        spring.obj.position.y = spring.startY;
        spring.obj.scale.set(1 + squash * 0.38, 1 - squash, 1 + squash * 0.38);
      } else {
        const u = (p - 0.22) / 0.78;
        const eased = u * u;
        spring.obj.position.y = THREE.MathUtils.lerp(spring.startY, spring.targetY, eased);
        spring.obj.scale.set(1, 1, 1);
      }
    }

    if (p >= 1) {
      spring.obj.scale.set(1, 1, 1);
      if (spring.mode === "lift") removeCubeRef(spring.tower, spring.cubeRef);
      springs.splice(i, 1);
    }
  }
}

function updateTileLifts(dt) {
  const ease = 1 - Math.pow(0.001, dt);
  for (const board of boards) {
    for (const tile of board.tiles.values()) {
      const data = tile.tileGroup.userData;
      const target = data.hover ? HOVER_LIFT : 0;
      data.lift = THREE.MathUtils.lerp(data.lift, target, ease);
      tile.tileGroup.position.y = data.baseY + data.lift;
    }
  }
}

function updateMonthTransition(dt) {
  if (!monthTransition) return;

  monthTransition.t += dt;
  const p = Math.min(monthTransition.t / monthTransition.dur, 1);
  const eased = 1 - Math.pow(1 - p, 3);
  const { fromIndex, toIndex, direction } = monthTransition;
  const fromBoard = boards[fromIndex];
  const toBoard = boards[toIndex];

  fromBoard.group.position.x = THREE.MathUtils.lerp(0, -direction * MONTH_SLIDE_DISTANCE, eased);
  toBoard.group.position.x = THREE.MathUtils.lerp(direction * MONTH_SLIDE_DISTANCE, 0, eased);

  if (p >= 1) {
    monthTransition = null;
    boards.forEach((board, index) => {
      const isActive = index === settings.activeMonth;
      board.group.visible = isActive;
      board.group.position.x = isActive ? 0 : board.originalX;
      const scale = isActive ? FOCUSED_BOARD_SCALE : 1;
      board.group.scale.set(scale, scale, scale);
    });
  }
}

function resize() {
  const rect = scenePanel.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  renderer.setSize(width, height, false);

  const aspect = width / height;
  const focus = settings.viewMode === "one";
  const visibleW = focus ? BOARD_W * 1.34 : TOTAL_W;
  const visibleD = focus ? BOARD_D * 1.2 : BOARD_D;
  const minView = focus ? 7.8 : 11;
  const heightForDepth = visibleD * (focus ? 1.2 : 1.86);
  const heightForWidth = (visibleW / Math.max(aspect, 0.42)) * (focus ? 0.96 : 1.08);
  const viewHeight = Math.max(heightForDepth, heightForWidth, minView);
  camera.left = -viewHeight * aspect / 2;
  camera.right = viewHeight * aspect / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
}

let last = performance.now();
function animate(now = performance.now()) {
  const dt = Math.min((now - last) / 1000, 0.033);
  last = now;

  updateSprings(dt * settings.animSpeed);
  updateTileLifts(dt);
  updateMonthTransition(dt);

  const rotEase = 1 - Math.pow(0.001, dt);
  curMouseRotX = THREE.MathUtils.lerp(curMouseRotX, targetMouseRotX, rotEase);
  curMouseRotY = THREE.MathUtils.lerp(curMouseRotY, targetMouseRotY, rotEase);
  sceneRoot.rotation.x = THREE.MathUtils.degToRad(settings.pitch) + curMouseRotX;
  sceneRoot.rotation.y = THREE.MathUtils.degToRad(settings.yaw) + curMouseRotY;

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

monthWindow.forEach((monthData, index) => buildBoard(index, monthData));
applyMonthView();
renderSwatches();
renderLegend();
renderStatus();

requestAnimationFrame(async () => {
  resize();
  sceneReady = true;
  last = performance.now();
  animate(last);
  state = await fetchState();
  const savedUser = state.users[myId] || {};
  if (savedUser.name) {
    myName = savedUser.name;
    nameInput.value = myName;
  }
  if (savedUser.color && !takenColors().has(savedUser.color)) {
    myColor = savedUser.color;
  }
  pending = committedSetForMe();
  syncAll({ animateNew: true });
  renderSwatches();
  renderLegend();
  renderStatus();
});

window.addEventListener("focus", async () => {
  state = await fetchState();
  syncAll({ animateNew: true, animateRemove: true });
  renderSwatches();
  renderLegend();
  renderStatus();
});

window.addEventListener("resize", resize);
