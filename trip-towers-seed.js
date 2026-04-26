function dateFromKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function addPick(state, dateKey, uid) {
  if (!state.picks[dateKey]) state.picks[dateKey] = [];
  if (!state.picks[dateKey].includes(uid)) state.picks[dateKey].push(uid);
}

function visibleDateKeys(monthWindow) {
  const keys = [];
  for (const monthData of monthWindow) {
    for (const week of monthData.weeks) {
      for (const day of week) {
        if (day) keys.push(monthData.key(day));
      }
    }
  }
  return keys;
}

export function seedFakeFriends(state, monthWindow, presetColors, save) {
  if (state.users.f_alex) return;

  state.users ||= {};
  state.picks ||= {};

  const friends = [
    { uid: "f_alex", name: "Alex", color: presetColors[1] },
    { uid: "f_mina", name: "Mina", color: presetColors[2] },
    { uid: "f_jules", name: "Jules", color: presetColors[3] },
    { uid: "f_sam", name: "Sam", color: presetColors[4] },
    { uid: "f_priya", name: "Priya", color: presetColors[5] },
    { uid: "f_noah", name: "Noah", color: presetColors[6] }
  ];

  for (const friend of friends) {
    state.users[friend.uid] = { name: friend.name, color: friend.color };
  }

  const allDates = visibleDateKeys(monthWindow);
  const futureWeekendDates = allDates.filter((dateKey) => {
    const date = dateFromKey(dateKey);
    const visibleMonth = monthWindow.findIndex((m) => dateKey.startsWith(`${m.year}-${String(m.month + 1).padStart(2, "0")}`));
    const day = date.getDay();
    return visibleMonth > 0 && (day === 5 || day === 6 || day === 0);
  });

  const consensus = futureWeekendDates
    .filter((dateKey) => {
      const day = Number(dateKey.slice(-2));
      return day >= 7 && day <= 24;
    })
    .slice(0, 10);

  const fallback = futureWeekendDates.slice(0, 10);
  const sharedDates = consensus.length >= 6 ? consensus : fallback;

  friends.forEach((friend, friendIndex) => {
    sharedDates.forEach((dateKey, dateIndex) => {
      const guaranteed = dateIndex < 2;
      const score = hashString(`${friend.uid}:${dateKey}`) % 100;
      if (guaranteed || score < 76 - friendIndex * 3) addPick(state, dateKey, friend.uid);
    });

    allDates.forEach((dateKey) => {
      const date = dateFromKey(dateKey);
      const isWeekend = date.getDay() === 6 || date.getDay() === 0;
      const score = hashString(`${dateKey}:${friend.uid}:extra`) % 100;
      if (score < (isWeekend ? 8 : 3)) addPick(state, dateKey, friend.uid);
    });
  });

  save(state);
}
