// Uživatelský profil: oblíbené kraje a soutěže, moje družstva, výchozí zapnutí log a můj podpis.
// Profil je jen v zařízení (jako všechno ostatní). Jde stáhnout do souboru i s logy, nastavením
// a zapamatovanými údaji a nahrát na jiném zařízení. Tady jsou jen čisté funkce (bez localStorage),
// ukládání je v store.js.
import { BACKUP_APP } from './archive.js';
import { DEFAULT_LOGOS } from './logic.js';

export const PROFILE_KIND = 'profil';
export const PROFILE_VERSION = 1;
/** Loga družstev ve výchozím stavu: vždy, jen u mého družstva, nikdy. */
export const TEAM_LOGO_MODES = ['all', 'mine', 'none'];

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const str = (x, max = 200) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
const strList = (x, max = 200) => [...new Set((Array.isArray(x) ? x : []).map((v) => str(v, max)).filter(Boolean))];
// obrázek (logo, podpis) smí být jen obrázek vložený přímo v souboru, nic jiného se do <img> nedostane
export const imageOk = (x) =>
  typeof x === 'string' && x.length < 3_000_000 && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(x) ? x : '';

/** Prázdný profil. */
export const emptyProfile = () => ({
  regions: [],
  favComps: [],
  myTeams: [],
  logoDefaults: { svaz: true, kraj: true, teams: 'all' },
  me: { name: '', sig: '' },
});

/**
 * Pročistí profil (z úložiště i ze souboru). legacyRegion je kraj ze starého nastavení
 * (dřív šel vybrat jen jeden), ten se převezme, když profil ještě žádné kraje nemá.
 */
export function normalizeProfile(p, { legacyRegion = '' } = {}) {
  const e = emptyProfile();
  const src = isObj(p) ? p : {};
  const ld = isObj(src.logoDefaults) ? src.logoDefaults : {};
  const me = isObj(src.me) ? src.me : {};
  const regions = strList(src.regions, 10);
  if (!regions.length && !Array.isArray(src.regions) && str(legacyRegion, 10)) regions.push(str(legacyRegion, 10));
  return {
    regions,
    favComps: strList(src.favComps, 60),
    myTeams: strList(src.myTeams),
    logoDefaults: {
      svaz: typeof ld.svaz === 'boolean' ? ld.svaz : e.logoDefaults.svaz,
      kraj: typeof ld.kraj === 'boolean' ? ld.kraj : e.logoDefaults.kraj,
      teams: TEAM_LOGO_MODES.includes(ld.teams) ? ld.teams : e.logoDefaults.teams,
    },
    me: { name: str(me.name, 120), sig: imageOk(me.sig) },
  };
}

export const isFavComp = (profile, id) => !!id && profile.favComps.includes(id);
export const isMyTeam = (profile, name) => !!name && profile.myTeams.includes(name);

/** Přidá nebo odebere položku seznamu v profilu (favComps, myTeams, regions). Vrací nový profil. */
export function toggleIn(profile, list, value, on = !profile[list].includes(value)) {
  const rest = profile[list].filter((x) => x !== value);
  return { ...profile, [list]: on && value ? [...rest, value] : rest };
}

/**
 * Výchozí zapnutí log pro zápis podle profilu: svaz a kraj podle nastavení, loga družstev
 * vždy, jen u mého družstva, nebo nikdy.
 */
export function defaultLogoFlags(profile, { home = '', away = '' } = {}) {
  const d = profile?.logoDefaults ?? emptyProfile().logoDefaults;
  const team = (name) => (d.teams === 'all' ? true : d.teams === 'mine' ? isMyTeam(profile, name) : false);
  return { ...DEFAULT_LOGOS, svaz: d.svaz, kraj: d.kraj, home: team(home), away: team(away) };
}

/** Zápasy kola, ve kterých hraje moje družstvo. */
export const myMatches = (profile, round) =>
  (round?.matches ?? []).filter((m) => isMyTeam(profile, m.home) || isMyTeam(profile, m.away));

// ---------- export a import ----------
//
// Snímek (snapshot) je všechno, co profil v souboru nese:
//   { profile, logos: { kraj, teams }, settings, ui, mail, referees, venues, userComps }

const cleanLogos = (l) => {
  const src = isObj(l) ? l : {};
  const teams = {};
  for (const [k, v] of Object.entries(isObj(src.teams) ? src.teams : {})) {
    const name = str(k);
    const img = imageOk(v);
    if (name && img) teams[name] = img;
  }
  return { kraj: imageOk(src.kraj) || null, teams };
};

const cleanSettings = (s) => {
  const src = isObj(s) ? s : {};
  const out = {};
  if (isObj(src.features)) {
    out.features = Object.fromEntries(Object.entries(src.features).filter(([, v]) => typeof v === 'boolean').map(([k, v]) => [str(k, 40), v]));
  }
  if (Number.isInteger(src.retention) && src.retention >= 0 && src.retention <= 120) out.retention = src.retention;
  return out;
};

const cleanMail = (m) =>
  Object.fromEntries(
    Object.entries(isObj(m) ? m : {})
      .map(([k, v]) => [str(k, 60), str(v, 320)])
      .filter(([k, v]) => k && v),
  );

const cleanVenues = (m) =>
  Object.fromEntries(
    Object.entries(isObj(m) ? m : {})
      .map(([k, v]) => [str(k), str(v)])
      .filter(([k, v]) => k && v),
  );

// vlastní soutěž (přidaná ze souborů z chess-results): jen základní kontrola tvaru
const compOk = (c) => isObj(c) && typeof c.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(c.id) && Array.isArray(c.teams);

/** Pročistí snímek ze souboru. Co nejde použít, vynechá. */
export function cleanSnapshot(s) {
  const src = isObj(s) ? s : {};
  return {
    profile: normalizeProfile(src.profile),
    logos: cleanLogos(src.logos),
    settings: cleanSettings(src.settings),
    ui: ['auto', 'desktop', 'touch'].includes(src.ui) ? src.ui : 'auto',
    mail: cleanMail(src.mail),
    referees: strList(src.referees).slice(0, 12),
    venues: cleanVenues(src.venues),
    userComps: (Array.isArray(src.userComps) ? src.userComps : []).filter(compOk).map((c) => ({ ...c, local: true })),
  };
}

/** Obsah souboru s profilem. Podpis jen když ho uživatel výslovně přidá (withSig). */
export function makeProfileFile(snapshot, { withSig = false, now = new Date() } = {}) {
  const s = cleanSnapshot(snapshot);
  if (!withSig) s.profile = { ...s.profile, me: { ...s.profile.me, sig: '' } };
  return { app: BACKUP_APP, kind: PROFILE_KIND, version: PROFILE_VERSION, exported: now.toISOString(), ...s };
}

/** Přečte soubor s profilem. Hodí chybu, když to profil není. */
export function parseProfileFile(text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error('Soubor není profil aplikace (neplatný formát JSON).');
  }
  if (!isObj(j) || j.app !== BACKUP_APP || j.kind !== PROFILE_KIND) {
    if (isObj(j) && Array.isArray(j.zapisy)) throw new Error('Tohle je záloha archivu zápisů. Nahraj ji v Archivu.');
    throw new Error('Soubor není profil aplikace Zápis o utkání.');
  }
  return cleanSnapshot(j);
}

/**
 * Sloučí profil ze souboru se stavem zařízení:
 * - oblíbené kraje, soutěže, moje družstva, výchozí loga, nastavení a zobrazení se vezmou ze souboru,
 * - loga, e-mailové adresy, rozhodčí, hrací místnosti a vlastní soutěže se sloučí
 *   (při shodě má přednost soubor), nic ze zařízení se nesmaže,
 * - jméno a podpis ze souboru, jen když v něm jsou; jinak zůstanou ze zařízení.
 */
export function mergeSnapshot(current, incoming) {
  const cur = cleanSnapshot(current);
  const inc = cleanSnapshot(incoming);
  const byId = new Map(cur.userComps.map((c) => [c.id, c]));
  for (const c of inc.userComps) byId.set(c.id, c);
  return {
    profile: {
      ...inc.profile,
      me: {
        name: inc.profile.me.name || cur.profile.me.name,
        sig: inc.profile.me.sig || cur.profile.me.sig,
      },
    },
    logos: { kraj: inc.logos.kraj || cur.logos.kraj, teams: { ...cur.logos.teams, ...inc.logos.teams } },
    settings: { ...cur.settings, ...inc.settings, features: { ...(cur.settings.features ?? {}), ...(inc.settings.features ?? {}) } },
    ui: inc.ui,
    mail: { ...cur.mail, ...inc.mail },
    referees: [...new Set([...inc.referees, ...cur.referees])].slice(0, 12),
    venues: { ...cur.venues, ...inc.venues },
    userComps: [...byId.values()],
  };
}

/** Krátký popis obsahu snímku pro potvrzení importu. */
export function describeSnapshot(s) {
  const p = s.profile;
  const parts = [
    p.regions.length ? `kraje ${p.regions.length}` : '',
    p.favComps.length ? `oblíbené soutěže ${p.favComps.length}` : '',
    p.myTeams.length ? `moje družstva ${p.myTeams.length}` : '',
    Object.keys(s.logos.teams).length + (s.logos.kraj ? 1 : 0) ? `loga ${Object.keys(s.logos.teams).length + (s.logos.kraj ? 1 : 0)}` : '',
    s.userComps.length ? `vlastní soutěže ${s.userComps.length}` : '',
    p.me.sig ? 'můj podpis' : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'jen nastavení';
}
