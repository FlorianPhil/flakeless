import "./styles.css";
import { Board, monthLabel } from "./board.js";
import {
  PAWN_COLORS,
  parseRoute,
  shareUrl,
  makeEventCode,
  ensureUserId,
  loadIdentity,
  saveIdentity,
  syncPull,
  syncPush,
} from "./sync.js";

const app = document.getElementById("app");
const userId = ensureUserId();

let eventCode = null;
let eventTitle = "Hangout";
let identity = null;
let users = {};
let picks = {};
let myDates = new Set();
let board = null;
let pollTimer = null;
let saveTimer = null;
let syncSource = "remote";

function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 1800);
}

function brandHtml() {
  return `<div class="brand"><div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div><strong>Flakeless</strong></div>`;
}

function renderLanding() {
  app.innerHTML = `
    <div class="landing">
      ${brandHtml()}
      <div class="hero">
        <h1>Pile up. Flake less.</h1>
        <p>Drop your cube on the days that work. When a tower rises, that’s the night.</p>
      </div>
      <div class="stack">
        <div class="field">
          <label for="plan-title">What are you planning?</label>
          <input id="plan-title" maxlength="60" placeholder="Boys weekend, Dome hangout…" value="${escapeAttr(eventTitle === "Hangout" ? "" : eventTitle)}" />
        </div>
        <button class="btn primary" id="create-btn">Start a board</button>
        <div class="field">
          <label for="join-code">Or join with a code</label>
          <input id="join-code" maxlength="8" placeholder="ABC123" autocomplete="off" style="text-transform:uppercase;letter-spacing:.12em;font-weight:700" />
        </div>
        <button class="btn ghost" id="join-btn">Join board</button>
      </div>
    </div>
  `;

  app.querySelector("#create-btn").onclick = () => {
    const title = app.querySelector("#plan-title").value.trim() || "Hangout";
    openEvent(makeEventCode(), title, true);
  };
  app.querySelector("#join-btn").onclick = () => {
    const code = app.querySelector("#join-code").value.trim().toUpperCase();
    if (code.length < 3) return toast("Enter a code");
    openEvent(code, "Hangout", true);
  };
}

function renderGate() {
  const saved = loadIdentity(eventCode);
  const name = saved?.name || "";
  const color = saved?.color || PAWN_COLORS[Math.floor(Math.random() * PAWN_COLORS.length)];

  app.innerHTML = `
    <div class="gate">
      ${brandHtml()}
      <div class="hero">
        <h1>${escapeHtml(eventTitle)}</h1>
        <p>Pick your name and cube color. Tap dates on the board to pile up.</p>
      </div>
      <div class="stack">
        <div class="field">
          <label for="name">Your name</label>
          <input id="name" maxlength="24" placeholder="Alex" value="${escapeAttr(name)}" />
        </div>
        <div class="field">
          <label>Your cube</label>
          <div class="colors" role="radiogroup" aria-label="Cube color">
            ${PAWN_COLORS.map(
              (c) =>
                `<button type="button" class="swatch" style="background:${c}" data-color="${c}" role="radio" aria-checked="${c === color}"></button>`
            ).join("")}
          </div>
        </div>
        <button class="btn primary" id="enter-btn">Enter the board</button>
        <p class="hint">Code <strong>${escapeHtml(eventCode)}</strong> · share the link after you join</p>
      </div>
    </div>
  `;

  let selected = color;
  app.querySelectorAll(".swatch").forEach((btn) => {
    btn.onclick = () => {
      selected = btn.dataset.color;
      app.querySelectorAll(".swatch").forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
    };
  });

  app.querySelector("#enter-btn").onclick = () => {
    const n = app.querySelector("#name").value.trim();
    if (!n) return toast("Add your name");
    identity = { name: n.slice(0, 24), color: selected };
    saveIdentity(eventCode, identity);
    renderBoard();
  };
}

function renderBoard() {
  stopPoll();
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <button class="icon-btn" id="back" aria-label="Leave">←</button>
        <div class="title">
          <strong>${escapeHtml(eventTitle)}</strong>
          <span id="sync-label">Syncing…</span>
        </div>
        <button class="icon-btn" id="share" aria-label="Share">↗</button>
      </header>
      <div class="board-wrap" id="board"></div>
      <footer class="dock">
        <div class="people" id="people"></div>
        <div class="actions">
          <button class="btn ghost" id="clear-mine">Clear my picks</button>
          <button class="btn primary" id="copy-link">Copy invite</button>
        </div>
        <div class="status" id="status">Tap a date to place your cube</div>
      </footer>
    </div>
  `;

  const wrap = app.querySelector("#board");
  const monthBar = document.createElement("div");
  monthBar.className = "month-bar";
  monthBar.innerHTML = `
    <button class="icon-btn" id="prev-month" aria-label="Previous month">‹</button>
    <div class="label" id="month-label"></div>
    <button class="icon-btn" id="next-month" aria-label="Next month">›</button>
    <button class="icon-btn today-btn" id="today" aria-label="Jump to today">Today</button>
  `;
  wrap.appendChild(monthBar);

  board?.dispose();
  board = new Board(wrap, { onToggleDate: toggleDate });
  board.setIdentity(userId);

  const now = new Date();
  board.setMonth(now.getFullYear(), now.getMonth());
  updateMonthLabel();

  app.querySelector("#prev-month").onclick = () => {
    board.shiftMonth(-1);
    updateMonthLabel();
  };
  app.querySelector("#next-month").onclick = () => {
    board.shiftMonth(1);
    updateMonthLabel();
  };
  app.querySelector("#today").onclick = () => {
    const d = new Date();
    board.setMonth(d.getFullYear(), d.getMonth());
    updateMonthLabel();
  };
  app.querySelector("#back").onclick = () => {
    if (confirm("Leave this board?")) {
      history.replaceState({}, "", "/");
      teardown();
      boot();
    }
  };
  app.querySelector("#share").onclick = copyInvite;
  app.querySelector("#copy-link").onclick = copyInvite;
  app.querySelector("#clear-mine").onclick = () => {
    myDates.clear();
    queueSave();
    applyLocalState();
  };

  refreshFromServer().then(() => startPoll());
}

function updateMonthLabel() {
  const el = app.querySelector("#month-label");
  if (el && board) el.textContent = monthLabel(board.year, board.month);
}

function applyLocalState() {
  const nextPicks = { ...picks };
  for (const [key, ids] of Object.entries(nextPicks)) {
    nextPicks[key] = ids.filter((id) => id !== userId);
    if (!nextPicks[key].length) delete nextPicks[key];
  }
  for (const key of myDates) {
    if (!nextPicks[key]) nextPicks[key] = [];
    if (!nextPicks[key].includes(userId)) nextPicks[key] = [...nextPicks[key], userId];
  }
  picks = nextPicks;
  users = {
    ...users,
    [userId]: { name: identity.name, color: identity.color },
  };
  board?.setState({ users, picks });
  renderPeople();
  renderStatus();
}

function toggleDate(key) {
  if (myDates.has(key)) myDates.delete(key);
  else myDates.add(key);
  applyLocalState();
  queueSave();
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(pushMine, 280);
}

async function pushMine() {
  const result = await syncPush({
    userId,
    name: identity.name,
    color: identity.color,
    dates: [...myDates],
    event: eventCode,
  });
  syncSource = result.source;
  updateSyncLabel();
}

async function refreshFromServer() {
  const state = await syncPull(eventCode);
  syncSource = state.source;
  users = state.users || {};
  picks = state.picks || {};
  myDates = new Set(
    Object.entries(picks)
      .filter(([, ids]) => ids.includes(userId))
      .map(([k]) => k)
  );
  if (identity) {
    users[userId] = { name: identity.name, color: identity.color };
  }
  board?.setState({ users, picks });
  renderPeople();
  renderStatus();
  updateSyncLabel();
}

function renderPeople() {
  const el = app.querySelector("#people");
  if (!el) return;
  const ids = Object.keys(users);
  if (!ids.length) {
    el.innerHTML = `<div class="person"><span>Waiting for friends…</span></div>`;
    return;
  }
  el.innerHTML = ids
    .map((id) => {
      const u = users[id];
      const count = Object.values(picks).filter((arr) => arr.includes(id)).length;
      return `<div class="person ${id === userId ? "me" : ""}"><i style="background:${escapeAttr(u.color)}"></i>${escapeHtml(u.name)} · ${count}</div>`;
    })
    .join("");
}

function renderStatus() {
  const el = app.querySelector("#status");
  if (!el) return;
  let best = [];
  let bestCount = 0;
  for (const [key, ids] of Object.entries(picks)) {
    const n = ids.length;
    if (n > bestCount) {
      bestCount = n;
      best = [key];
    } else if (n === bestCount && n > 0) {
      best.push(key);
    }
  }
  if (bestCount < 2) {
    el.className = "status";
    el.textContent = myDates.size
      ? "Waiting for the pile to grow…"
      : "Tap a date to place your cube";
    return;
  }
  el.className = "status hot";
  const labels = best
    .slice(0, 3)
    .map((k) => {
      const [y, m, d] = k.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    })
    .join(" · ");
  el.textContent = `Hottest: ${labels} (${bestCount})`;
}

function updateSyncLabel() {
  const el = app.querySelector("#sync-label");
  if (!el) return;
  el.textContent =
    syncSource === "remote"
      ? `Live · ${eventCode}`
      : `Local demo · ${eventCode} (API offline)`;
}

function copyInvite() {
  const url = shareUrl(eventCode, eventTitle);
  navigator.clipboard?.writeText(url).then(
    () => toast("Invite link copied"),
    () => toast(url)
  );
}

function startPoll() {
  stopPoll();
  pollTimer = setInterval(() => {
    refreshFromServer().catch(() => {});
  }, 2500);
}

function stopPoll() {
  clearInterval(pollTimer);
  pollTimer = null;
}

function teardown() {
  stopPoll();
  clearTimeout(saveTimer);
  board?.dispose();
  board = null;
}

function openEvent(code, title, pushUrl) {
  eventCode = code.toUpperCase();
  eventTitle = title || "Hangout";
  identity = loadIdentity(eventCode);
  if (pushUrl) {
    history.replaceState({}, "", shareUrl(eventCode, eventTitle).replace(window.location.origin, ""));
  }
  if (identity?.name) renderBoard();
  else renderGate();
}

function boot() {
  const route = parseRoute();
  if (route.title) eventTitle = route.title;
  if (route.event) {
    openEvent(route.event, eventTitle || "Hangout", false);
  } else {
    renderLanding();
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replaceAll("'", "&#39;");
}

window.addEventListener("beforeunload", teardown);
boot();
