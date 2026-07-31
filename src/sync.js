const PAWN_COLORS = [
  "#FF6B5A",
  "#F5A524",
  "#2DD4A8",
  "#5B8DEF",
  "#C084FC",
  "#F472B6",
];

export { PAWN_COLORS };

function uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `u_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function makeEventCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[(Math.random() * alphabet.length) | 0];
  return out;
}

export function parseRoute() {
  const params = new URLSearchParams(window.location.search);
  const event =
    (params.get("e") || params.get("plan") || params.get("event") || "").toUpperCase().trim() ||
    null;
  const title = (params.get("title") || "").trim() || null;
  return { event, title };
}

export function shareUrl(event, title) {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("e", event);
  if (title) url.searchParams.set("title", title);
  return url.toString();
}

export function ensureUserId() {
  let id = localStorage.getItem("flakeless.userId");
  if (!id) {
    id = uid();
    localStorage.setItem("flakeless.userId", id);
  }
  return id;
}

export function loadIdentity(event) {
  try {
    const raw = localStorage.getItem(`flakeless.identity.${event}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveIdentity(event, identity) {
  localStorage.setItem(`flakeless.identity.${event}`, JSON.stringify(identity));
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function ensureSetup() {
  try {
    await jsonFetch("/api/setup", { method: "POST", body: "{}" });
  } catch {
    /* ignore */
  }
}

export async function fetchState(event) {
  return jsonFetch(`/api/state?event=${encodeURIComponent(event)}`);
}

export async function lockPicks({ userId, name, color, dates, event }) {
  return jsonFetch("/api/lock", {
    method: "POST",
    body: JSON.stringify({ userId, name, color, dates, event }),
  });
}

/* Offline / API-down fallback so the board still demos. */
const LOCAL_KEY = "flakeless.localEvents";

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeLocal(all) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
}

export function localGetState(event) {
  const all = readLocal();
  const row = all[event] || { users: {}, picks: {} };
  return { users: row.users || {}, picks: row.picks || {} };
}

export function localLockPicks({ userId, name, color, dates, event }) {
  const all = readLocal();
  if (!all[event]) all[event] = { users: {}, picks: {} };
  all[event].users[userId] = { name, color };
  for (const [key, ids] of Object.entries(all[event].picks)) {
    all[event].picks[key] = ids.filter((id) => id !== userId);
    if (!all[event].picks[key].length) delete all[event].picks[key];
  }
  for (const dateKey of dates) {
    if (!all[event].picks[dateKey]) all[event].picks[dateKey] = [];
    if (!all[event].picks[dateKey].includes(userId)) {
      all[event].picks[dateKey].push(userId);
    }
  }
  writeLocal(all);
  return { ok: true, local: true };
}

export async function syncPull(event) {
  try {
    await ensureSetup();
    const remote = await fetchState(event);
    return { ...remote, source: "remote" };
  } catch {
    return { ...localGetState(event), source: "local" };
  }
}

export async function syncPush(payload) {
  try {
    await ensureSetup();
    await lockPicks(payload);
    localLockPicks(payload);
    return { source: "remote" };
  } catch {
    localLockPicks(payload);
    return { source: "local" };
  }
}
