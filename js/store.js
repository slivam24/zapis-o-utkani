// Ukládání do zařízení (localStorage): rozpracovaný zápis, archiv, naposledy použití rozhodčí a místnosti.
const KEY_DRAFT = 'zapis.draft.v1';
const KEY_ARCHIVE = 'zapis.archive.v1';
const KEY_REFEREES = 'zapis.referees.v1';
const KEY_VENUES = 'zapis.venues.v1';
const KEY_DATA = 'zapis.data.v1';
const KEY_COMPS = 'zapis.comps.v1';

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

export const loadDraft = () => read(KEY_DRAFT, null);
export const saveDraft = (s) => write(KEY_DRAFT, s);
export const clearDraft = () => {
  try {
    localStorage.removeItem(KEY_DRAFT);
  } catch {
    /* nic */
  }
};

export const loadArchive = () => read(KEY_ARCHIVE, []);
export const saveArchive = (list) => write(KEY_ARCHIVE, list);

export function archiveMatch(state) {
  const list = loadArchive().filter((m) => m.id !== state.id);
  list.unshift({ ...state, status: 'done', updatedAt: new Date().toISOString() });
  return saveArchive(list);
}

export function deleteFromArchive(id) {
  return saveArchive(loadArchive().filter((m) => m.id !== id));
}

export const recentReferees = () => read(KEY_REFEREES, []);
export function rememberReferee(name) {
  const n = (name ?? '').trim();
  if (!n) return;
  const list = [n, ...recentReferees().filter((x) => x !== n)].slice(0, 12);
  write(KEY_REFEREES, list);
}

export const venueFor = (team) => read(KEY_VENUES, {})[team] ?? '';
export function rememberVenue(team, venue) {
  if (!team || !venue?.trim()) return;
  const map = read(KEY_VENUES, {});
  map[team] = venue.trim();
  write(KEY_VENUES, map);
}

export const loadCachedData = () => read(KEY_DATA, null);
export const saveCachedData = (d) => write(KEY_DATA, d);

// Soutěže, které si uživatel přidal sám. Žijí jen v tomhle zařízení.
export const loadUserComps = () => read(KEY_COMPS, []);

export function saveUserComp(comp) {
  const list = loadUserComps().filter((c) => c.id !== comp.id);
  list.push(comp);
  return write(KEY_COMPS, list);
}

export function deleteUserComp(id) {
  return write(KEY_COMPS, loadUserComps().filter((c) => c.id !== id));
}

