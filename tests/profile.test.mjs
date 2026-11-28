import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyProfile, normalizeProfile, toggleIn, defaultLogoFlags, myMatches, isFavComp,
  makeProfileFile, parseProfileFile, mergeSnapshot, cleanSnapshot, describeSnapshot, imageOk,
} from '../js/profile.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const PNG2 = 'data:image/png;base64,AAAA';

test('profil: kraj ze starého nastavení se převezme, dokud profil kraje nemá', () => {
  assert.deepEqual(normalizeProfile(null, { legacyRegion: 'JmSS' }).regions, ['JmSS']);
  assert.deepEqual(normalizeProfile({ regions: [] }, { legacyRegion: 'JmSS' }).regions, [], 'výslovně žádný kraj = všechny kraje');
  assert.deepEqual(normalizeProfile({ regions: ['UKSS', 'UKSS', 'JmSS'] }).regions, ['UKSS', 'JmSS']);
});

test('profil: pročištění nesmyslných hodnot', () => {
  const p = normalizeProfile({ favComps: ['c1', 3, '', 'c1'], logoDefaults: { svaz: 'ano', teams: 'nevim' }, me: { name: '  Jan Novák ', sig: 'javascript:alert(1)' } });
  assert.deepEqual(p.favComps, ['c1']);
  assert.deepEqual(p.logoDefaults, emptyProfile().logoDefaults);
  assert.deepEqual(p.me, { name: 'Jan Novák', sig: '' });
  assert.equal(imageOk(PNG), PNG);
  assert.equal(imageOk('data:text/html;base64,PHNjcmlwdD4='), '');
});

test('profil: oblíbené přidat a odebrat', () => {
  let p = emptyProfile();
  p = toggleIn(p, 'favComps', 'c3388');
  assert.ok(isFavComp(p, 'c3388'));
  p = toggleIn(p, 'favComps', 'c3388');
  assert.ok(!isFavComp(p, 'c3388'));
  p = toggleIn(p, 'myTeams', 'ŠK Louny', true);
  p = toggleIn(p, 'myTeams', 'ŠK Louny', true);
  assert.deepEqual(p.myTeams, ['ŠK Louny']);
});

test('profil: výchozí loga, loga družstev jen u mého družstva', () => {
  const p = { ...emptyProfile(), myTeams: ['ŠK Louny'], logoDefaults: { svaz: true, kraj: false, teams: 'mine' } };
  assert.deepEqual(defaultLogoFlags(p, { home: 'ŠK Louny', away: 'TJ Most' }), { svaz: true, kraj: false, home: true, away: false });
  assert.deepEqual(defaultLogoFlags({ ...p, logoDefaults: { svaz: false, kraj: true, teams: 'none' } }, { home: 'ŠK Louny' }), { svaz: false, kraj: true, home: false, away: false });
  assert.deepEqual(defaultLogoFlags(emptyProfile(), {}), { svaz: true, kraj: true, home: true, away: true });
});

test('profil: zápasy mého družstva v kole', () => {
  const p = { ...emptyProfile(), myTeams: ['ŠK Louny'] };
  const round = { no: 3, matches: [{ home: 'A', away: 'B' }, { home: 'C', away: 'ŠK Louny' }] };
  assert.deepEqual(myMatches(p, round), [{ home: 'C', away: 'ŠK Louny' }]);
  assert.deepEqual(myMatches(p, undefined), []);
});

const snap = () => ({
  profile: { ...emptyProfile(), regions: ['JmSS'], favComps: ['c3388'], me: { name: 'Jan Novák', sig: PNG } },
  logos: { kraj: PNG, teams: { 'ŠK Louny': PNG } },
  settings: { features: { png: false }, retention: 24, region: 'JmSS' },
  ui: 'touch',
  mail: { c3388: 'ridici@example.cz', _last: 'ridici@example.cz' },
  referees: ['Petr Svoboda'],
  venues: { 'ŠK Louny': 'Sokolovna' },
  userComps: [{ id: 't123', name: 'Vlastní', teams: [], rounds: [] }, { id: '../zlo', teams: [] }],
});

test('profil: soubor bez podpisu, s podpisem jen na požádání', () => {
  const plain = makeProfileFile(snap(), { now: new Date('2026-11-28T10:00:00Z') });
  assert.equal(plain.kind, 'profil');
  assert.equal(plain.exported, '2026-11-28T10:00:00.000Z');
  assert.equal(plain.profile.me.sig, '');
  assert.equal(plain.profile.me.name, 'Jan Novák');
  assert.equal(makeProfileFile(snap(), { withSig: true }).profile.me.sig, PNG);
  assert.deepEqual(plain.userComps.map((c) => c.id), ['t123'], 'vlastní soutěž s neplatným id se vynechá');
  assert.equal(plain.settings.region, undefined, 'starý kraj z nastavení se nepřenáší, je v profilu');
  const back = parseProfileFile(JSON.stringify(plain));
  assert.deepEqual(back.profile.regions, ['JmSS']);
  assert.equal(back.logos.teams['ŠK Louny'], PNG);
});

test('profil: soubor, který profil není', () => {
  assert.throws(() => parseProfileFile('{'), /neplatný formát/);
  assert.throws(() => parseProfileFile(JSON.stringify({ app: 'zapis-o-utkani', version: 1, zapisy: [] })), /záloha archivu/);
  assert.throws(() => parseProfileFile(JSON.stringify({ foo: 1 })), /není profil/);
});

test('profil: import vezme oblíbené a nastavení ze souboru, loga a historii sloučí', () => {
  const device = {
    profile: { ...emptyProfile(), regions: ['UKSS'], favComps: ['c1'], me: { name: 'Já', sig: PNG2 } },
    logos: { kraj: null, teams: { 'TJ Most': PNG2, 'ŠK Louny': PNG2 } },
    settings: { features: { mail: false } },
    ui: 'auto',
    mail: { c1: 'a@example.cz' },
    referees: ['Karel'],
    venues: { 'TJ Most': 'Klubovna' },
    userComps: [{ id: 't9', teams: [], name: 'Moje' }],
  };
  const file = cleanSnapshot({ ...snap(), profile: { ...snap().profile, me: { name: '', sig: '' } } });
  const m = mergeSnapshot(device, file);
  assert.deepEqual(m.profile.regions, ['JmSS']);
  assert.deepEqual(m.profile.favComps, ['c3388']);
  assert.deepEqual(m.profile.me, { name: 'Já', sig: PNG2 }, 'bez jména a podpisu v souboru zůstanou ze zařízení');
  assert.equal(m.logos.kraj, PNG);
  assert.deepEqual(Object.keys(m.logos.teams).sort(), ['TJ Most', 'ŠK Louny']);
  assert.equal(m.logos.teams['ŠK Louny'], PNG, 'při shodě má přednost soubor');
  assert.deepEqual(m.settings.features, { mail: false, png: false });
  assert.equal(m.ui, 'touch');
  assert.deepEqual(m.mail, { c1: 'a@example.cz', c3388: 'ridici@example.cz', _last: 'ridici@example.cz' });
  assert.deepEqual(m.referees, ['Petr Svoboda', 'Karel']);
  assert.deepEqual(Object.keys(m.venues).sort(), ['TJ Most', 'ŠK Louny']);
  assert.deepEqual(m.userComps.map((c) => c.id).sort(), ['t123', 't9']);
  assert.match(describeSnapshot(file), /kraje 1, oblíbené soutěže 1, loga 2, vlastní soutěže 1/);
});
