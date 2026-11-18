// Uložení turnajů v zařízení (localStorage). Každý turnaj zvlášť, plus přehled.

const INDEX = 'svycar:index';
const KEY = (id) => `svycar:t:${id}`;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function listTournaments() {
  return read(INDEX, []).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
}

export function loadTournament(id) {
  return read(KEY(id), null);
}

export function saveTournament(t) {
  t.updated = new Date().toISOString();
  const ok = write(KEY(t.id), t);
  const idx = read(INDEX, []).filter((x) => x.id !== t.id);
  idx.push({
    id: t.id,
    name: t.name,
    city: t.city,
    dateFrom: t.dateFrom,
    players: t.players.length,
    rounds: t.rounds,
    paired: t.roundsData.length,
    updated: t.updated,
  });
  write(INDEX, idx);
  return ok;
}

export function deleteTournament(id) {
  try {
    localStorage.removeItem(KEY(id));
  } catch {
    /* nic */
  }
  write(INDEX, read(INDEX, []).filter((x) => x.id !== id));
}
