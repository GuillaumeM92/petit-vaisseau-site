// La Boîte à Musique: the page. Plays an endless stream of generated pieces, lets the listener
// compose a playlist from a few quick choices, keep favourites, download and share pieces.
import { Player } from './player.js';
import { Visualizer, colorOf, themeOf } from './visualizer.js';
import { songFor, pieceId, parsePieceId, randomSeed, pieceTitle } from './pieces.js';
import { Universes, universe, universeOfSong } from './universes.js';
import { Strings, t } from './i18n.js';
import { InstrumentId, InstrumentCount, Instruments } from '../engine/instruments.js';
import { MusicStyle } from '../engine/styles.js';

const $ = (sel) => document.querySelector(sel);
const store = {
  get(key, fallback) { try { const v = localStorage.getItem('lbam.' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('lbam.' + key, JSON.stringify(value)); } catch { /* private mode */ } },
};

const state = {
  lang: store.get('lang', (navigator.language || 'fr').startsWith('fr') ? 'fr' : 'en'),
  favorites: store.get('favorites', []),
  history: store.get('history', []),
  heard: store.get('heard', 0),
  universe: universe(store.get('universe', 'classique')).id,
  choices: loadChoices(), // per universe: { classique: {...}, cinematique: {...} }
  count: store.get('count', 10),
  playlist: [],
  index: -1,
  tab: 'playlist',
  timerEnd: 0,
};

// Choices were one set before the universes: they go to the universe their style belongs to.
function loadChoices() {
  const saved = store.get('choices', {});
  if (saved.classique || saved.cinematique) return saved;
  const { style, ...rest } = saved;
  return style === MusicStyle.Cinematic ? { classique: {}, cinematique: rest }
    : { classique: style === undefined ? rest : { ...rest, style }, cinematique: {} };
}
const choicesOf = (id) => (state.choices[id] ??= {});

const player = new Player();
player.setVolume(store.get('volume', 0.8));
const viz = new Visualizer($('#viz'), player, document.querySelector('.now'));
const L = (key, ...args) => t(state.lang, key, ...args);

// ---------------- pieces ----------------

// A new piece of the current universe with the listener's settings. In Classique, no style chosen
// lets the seed pick among the six (as in the game); the other universes write their style in the id.
function newPiece() {
  const choices = {};
  for (const [k, v] of Object.entries(choicesOf(state.universe))) if (v !== '' && v !== null && v !== undefined) choices[k] = v;
  const u = universe(state.universe);
  if (u.styles.length === 1) choices.style = u.styles[0];
  return pieceId(randomSeed(), choices);
}

function generatePlaylist() {
  state.playlist = Array.from({ length: state.count }, newPiece);
  state.index = -1;
  playIndex(0);
  setTab('playlist');
}

async function playIndex(i, start = 0) {
  if (i >= state.playlist.length) state.playlist.push(newPiece());
  state.index = i;
  await playId(state.playlist[i], start);
}

async function playId(id, start = 0, fade = 0.4) {
  showLoading(true);
  try { await player.play(id, fade, start); } finally { showLoading(false); }
  renderNow(id);
  renderLists();
}

// Plays a piece from the favourites or the history: it slots in after the current one.
function playOutside(id) {
  state.playlist.splice(state.index + 1, 0, id);
  playIndex(state.index + 1);
}

player.onStarted = (id) => {
  // A queued piece started by itself: follow it in the playlist.
  const at = state.playlist.indexOf(id, Math.max(0, state.index));
  if (at >= 0) state.index = at;
  record(id);
  renderNow(id);
  renderLists();
};

player.onNeedsNext = () => {
  const next = state.index + 1;
  if (next >= state.playlist.length) state.playlist.push(newPiece());
  player.queue(state.playlist[next]);
  renderLists();
};

function record(id) {
  const known = state.history.includes(id) || state.favorites.includes(id);
  state.history = [id, ...state.history.filter((x) => x !== id)].slice(0, 100);
  if (!known) state.heard++;
  store.set('history', state.history);
  store.set('heard', state.heard);
}

function toggleFavorite(id) {
  state.favorites = state.favorites.includes(id) ? state.favorites.filter((x) => x !== id) : [id, ...state.favorites];
  store.set('favorites', state.favorites);
  renderNow(player.current);
  renderLists();
}

// The download menu: a light MP3 first, the full-quality WAV for those who rework the sound.
function openDownloadMenu(id, button) {
  const menu = $('#dlMenu');
  const seconds = songFor(id).length + 3;
  const mb = (bytes) => L('mb', (bytes / 1e6).toLocaleString(state.lang, { maximumFractionDigits: 1 }));
  menu.replaceChildren(
    menuItem(L('dlMp3'), mb(seconds * 24000), () => download(id, 'mp3', button)),
    menuItem(L('dlWav'), mb(seconds * 176400), () => download(id, 'wav', button)),
  );
  const r = button.getBoundingClientRect();
  menu.hidden = false;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - menu.offsetWidth / 2), innerWidth - menu.offsetWidth - 8);
  const top = r.bottom + 8 + menu.offsetHeight > innerHeight ? r.top - menu.offsetHeight - 8 : r.bottom + 8;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.querySelector('button').focus();
}

function menuItem(title, sub, onClick) {
  const b = document.createElement('button');
  b.setAttribute('role', 'menuitem');
  b.innerHTML = '<span class="menu-title"></span><span class="menu-sub"></span>';
  b.firstChild.textContent = title;
  b.lastChild.textContent = sub;
  b.addEventListener('click', () => { closeDownloadMenu(); onClick(); });
  return b;
}

function closeDownloadMenu() { $('#dlMenu').hidden = true; }

async function download(id, format, button) {
  if (button) { button.disabled = true; button.classList.add('busy'); }
  toast(L('downloading'));
  try {
    const blob = await player.renderFile(id, format);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const p = parsePieceId(id);
    a.download = `${pieceTitle(id, state.lang)} (${L('number', p.seed)}) - La Boite a Musique.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } finally {
    if (button) { button.disabled = false; button.classList.remove('busy'); }
  }
}

function share(id) {
  const url = `${location.origin}${location.pathname}#p=${id}`;
  navigator.clipboard?.writeText(url).then(() => toast(L('copied')), () => prompt(L('share'), url));
  history.replaceState(null, '', `#p=${id}`);
}

// ---------------- now playing ----------------

function describe(song) {
  const S = Strings[state.lang];
  return `${S.styles[song.style]} · ${song.tempo} bpm · ${S.keys[song.key]} ${S.modeNames[song.mode]} · ${S.rooms[song.room]}`;
}

// Instruments shown as one chip: the snare taps with the bass drum, the timpani rolls with the hits,
// the cellos' spiccato with their held notes.
const ChipOf = { [InstrumentId.Tap]: InstrumentId.Kick, [InstrumentId.TimpaniRoll]: InstrumentId.Timpani,
  [InstrumentId.CellosSpic]: InstrumentId.Cello };
const chipOf = (i) => ChipOf[i] ?? i;

// Each universe has its theme (colours and visualizer): Classique the lights, Cinématique the embers,
// 8-bit the pixels.
function setTheme(theme) {
  if (document.documentElement.dataset.theme === theme) return;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = { embers: '#140b09', pixels: '#0b0a1a' }[theme] || '#0d1024';
}

function renderNow(id) {
  if (!id) return;
  const song = songFor(id);
  const p = parsePieceId(id);
  viz.setSong(song);
  const theme = themeOf(song);
  setTheme(theme);
  // a favourite or a shared piece from another universe: the page follows it
  const u = universeOfSong(song);
  if (u.id !== state.universe) { state.universe = u.id; store.set('universe', u.id); buildForm(); renderUniverses(); }
  $('#kicker').textContent = `${L('nowPlaying')} · ${L('number', p.seed)}`;
  $('#title').textContent = pieceTitle(id, state.lang);
  $('#details').textContent = describe(song);
  $('#total').textContent = clock(song.length);
  const fav = state.favorites.includes(id);
  const favButton = $('#fav');
  favButton.classList.toggle('on', fav);
  favButton.setAttribute('aria-pressed', fav);
  favButton.setAttribute('aria-label', L(fav ? 'unfavorite' : 'favorite'));
  favButton.title = L(fav ? 'unfavorite' : 'favorite');

  const chips = $('#chips');
  chips.textContent = '';
  const shown = new Set();
  for (let i = 0; i < InstrumentCount; i++) {
    const c = chipOf(i);
    if (!song.uses[i] || shown.has(c)) continue;
    shown.add(c);
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset.instrument = c;
    chip.style.setProperty('--c', colorOf(c, theme));
    chip.textContent = Strings[state.lang].instruments[c];
    chips.append(chip);
  }
  document.title = `♪ ${pieceTitle(id, state.lang)} · La Boîte à Musique`;
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: pieceTitle(id, state.lang), artist: 'La Boîte à Musique', album: describe(song) });
  }
}

// Progress and lit instruments, every frame.
function tick() {
  const id = player.current;
  if (id) {
    const song = songFor(id);
    const time = Math.max(0, Math.min(player.currentTime, song.length));
    $('#elapsed').textContent = clock(time);
    $('#fill').style.width = `${(time / song.length) * 100}%`;
    const lit = new Set();
    for (const n of song.notes) {
      if (n.time > time) break;
      if (time < n.time + n.duration + 0.15) lit.add(chipOf(n.instrument));
    }
    for (const chip of $('#chips').children) chip.classList.toggle('lit', lit.has(Number(chip.dataset.instrument)));
  }
  if (state.timerEnd) {
    const left = state.timerEnd - Date.now();
    if (left <= 0) {
      state.timerEnd = 0;
      $('#timer').value = '0';
      fadeOutAndPause();
    } else $('#timerLeft').textContent = L('timerLeft', Math.ceil(left / 60000));
  } else $('#timerLeft').textContent = '';
  requestAnimationFrame(tick);
}

async function fadeOutAndPause() {
  const volume = player.volume;
  for (let i = 20; i >= 0; i--) { player.setVolume(volume * i / 20); await new Promise((r) => setTimeout(r, 300)); }
  await player.pause();
  player.setVolume(volume);
  renderPlayButton();
}

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function renderPlayButton() {
  const playing = player.playing;
  $('#play').classList.toggle('playing', playing);
  $('#play').setAttribute('aria-label', L(playing ? 'pause' : 'play'));
  $('#play').title = L(playing ? 'pause' : 'play');
}

async function togglePlay() {
  if (!player.ctx) return start();
  if (player.playing) await player.pause(); else await player.resume();
  renderPlayButton();
}

function showLoading(on) { $('#stage').classList.toggle('loading', on); }

// ---------------- lists ----------------

function setTab(tab) {
  state.tab = tab;
  for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', b.dataset.tab === tab);
  renderLists();
}

function renderLists() {
  $('#favCount').textContent = state.favorites.length ? ` ${state.favorites.length}` : '';
  $('#heard').textContent = L('heard', state.heard);
  const list = $('#list');
  list.textContent = '';
  const ids = state.tab === 'playlist' ? state.playlist : state.tab === 'favorites' ? state.favorites : state.history;
  if (!ids.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = L(state.tab === 'playlist' ? 'emptyPlaylist' : state.tab === 'favorites' ? 'emptyFavorites' : 'emptyHistory');
    list.append(empty);
    return;
  }
  ids.forEach((id, i) => {
    const song = songFor(id);
    if (!song) return;
    const li = document.createElement('li');
    const current = id === player.current;
    li.className = current ? 'row current' : 'row';
    const main = document.createElement('button');
    main.className = 'row-main';
    main.innerHTML = `<span class="row-title"></span><span class="row-sub"></span>`;
    main.querySelector('.row-title').textContent = pieceTitle(id, state.lang);
    main.querySelector('.row-sub').textContent = `${Strings[state.lang].styles[song.style]} · ${clock(song.length)}${current ? ' · ' + L('nowPlaying') : ''}`;
    main.addEventListener('click', () => {
      if (state.tab === 'playlist') playIndex(i); else playOutside(id);
    });
    const fav = iconButton(state.favorites.includes(id) ? 'heart-on' : 'heart', L(state.favorites.includes(id) ? 'unfavorite' : 'favorite'), () => toggleFavorite(id));
    const dl = iconButton('download', L('download'), (e) => openDownloadMenu(id, e.currentTarget));
    li.append(main, fav, dl);
    list.append(li);
  });
}

function iconButton(icon, label, onClick) {
  const b = document.createElement('button');
  b.className = 'icon-btn small';
  b.setAttribute('aria-label', label);
  b.title = label;
  b.innerHTML = `<svg aria-hidden="true"><use href="#i-${icon}"/></svg>`;
  b.addEventListener('click', onClick);
  return b;
}

// ---------------- compose form ----------------

function option(value, label) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
}

// The settings of the current universe (js/universes.js): its styles, soloists and moods, the
// accompaniment and the room where they can be chosen (Cinématique: its strings' ostinato accompanies;
// 8-bit: the console's dry sound).
function buildForm() {
  const S = Strings[state.lang];
  const u = universe(state.universe);
  const choices = choicesOf(u.id);
  if (choices.lead !== undefined && !u.leads.includes(choices.lead)) delete choices.lead;
  if (!u.accomps) delete choices.accomp;
  if (!u.room) delete choices.room;
  if (u.styles.length === 1) delete choices.style;
  if (choices.mode >= u.moods) delete choices.mode;
  store.set('choices', state.choices);
  const leadName = (id) => u.id === 'cinematique' && id === InstrumentId.Strings ? S.instruments[InstrumentId.ViolinsSpic] : S.instruments[id];
  const fields = [
    ...(u.styles.length > 1 ? [['style', L('style'), u.styles.map((i) => [i, S.styles[i]])]] : []),
    ['mode', L('mood'), S.moods.slice(0, u.moods).map((s, i) => [i, s])],
    ['lead', L('lead'), u.leads.map((id) => [id, leadName(id)])],
    ...(u.accomps ? [['accomp', L('accomp'), u.accomps.map((id) => [id, S.instruments[id]])]] : []),
    ['tempo', L('tempo'), [['s', L('slower')], ['f', L('faster')]]],
    ['drums', L('drums'), [['y', L('with')], ['n', L('without')]]],
    ...(u.room ? [['room', L('room'), S.rooms.slice(0, 5).map((s, i) => [i, s])]] : []),
  ];
  const form = $('#fields');
  form.textContent = '';
  for (const [name, label, options] of fields) {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    wrap.innerHTML = `<span></span>`;
    wrap.firstChild.textContent = label;
    const select = document.createElement('select');
    select.append(option('', L('surprise')));
    for (const [v, text] of options) select.append(option(v, text));
    const current = choices[name];
    select.value = current === undefined ? '' : String(current);
    select.addEventListener('change', () => {
      const v = select.value;
      if (v === '') delete choices[name];
      else choices[name] = name === 'tempo' || name === 'drums' ? v : Number(v);
      store.set('choices', state.choices);
    });
    wrap.append(select);
    form.append(wrap);
  }
  const count = document.createElement('label');
  count.className = 'field';
  count.innerHTML = `<span></span>`;
  count.firstChild.textContent = L('count');
  const select = document.createElement('select');
  for (const n of [5, 10, 20, 50]) select.append(option(n, String(n)));
  select.value = String(state.count);
  select.addEventListener('change', () => { state.count = Number(select.value); store.set('count', state.count); });
  count.append(select);
  form.append(count);
}

// ---------------- texts, language ----------------

function applyTexts() {
  document.documentElement.lang = state.lang;
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = L(el.dataset.t);
  for (const el of document.querySelectorAll('[data-t-label]')) { el.setAttribute('aria-label', L(el.dataset.tLabel)); el.title = L(el.dataset.tLabel); }
  const why = $('#whyList');
  why.textContent = '';
  for (const [title, text] of Strings[state.lang].why) {
    const li = document.createElement('li');
    li.innerHTML = '<h3></h3><p></p>';
    li.querySelector('h3').textContent = title;
    li.querySelector('p').textContent = text;
    why.append(li);
  }
  $('#timer').replaceChildren(option(0, L('timerOff')), ...[15, 30, 60, 90].map((m) => option(m, L('minutes', m))));
  for (const b of document.querySelectorAll('.lang button')) b.setAttribute('aria-pressed', b.dataset.lang === state.lang);
  buildForm();
  renderUniverses();
  renderOffline();
  renderNow(player.current);
  renderLists();
  renderPlayButton();
}

// ---------------- start ----------------

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------------- universes ----------------

const sharedId = () => { const id = /#p=([\w.-]+)/.exec(location.hash)?.[1]; return id && parsePieceId(id) ? id : null; };

// The universe cards (start screen) and the switch above the player; the ones to come greyed out.
function renderUniverses() {
  const S = Strings[state.lang];
  const nav = $('#universes'), cards = $('#cards'), soon = $('#soonCards');
  nav.replaceChildren(); cards.replaceChildren(); soon.replaceChildren();
  nav.setAttribute('aria-label', L('universe'));
  for (const u of Universes) {
    const [name, text] = S.universes[u.id];
    const pill = document.createElement('button');
    pill.className = `universe-pill u-${u.id}`;
    pill.disabled = !!u.soon;
    pill.setAttribute('aria-pressed', u.id === state.universe);
    pill.innerHTML = '<span class="dot"></span><span class="name"></span>';
    pill.querySelector('.name').textContent = name;
    if (u.soon) { pill.insertAdjacentHTML('beforeend', `<span class="soon-tag"></span>`); pill.lastChild.textContent = L('soon'); }
    else pill.addEventListener('click', () => switchUniverse(u.id));
    nav.append(pill);

    const card = document.createElement('button');
    card.className = `universe-card u-${u.id}`;
    card.disabled = !!u.soon;
    card.innerHTML = '<span class="art"></span><span class="card-name"></span><span class="card-text"></span>';
    card.querySelector('.card-name').textContent = name;
    card.querySelector('.card-text').textContent = u.soon ? L('soon') : text;
    if (!u.soon) {
      card.insertAdjacentHTML('beforeend', '<span class="card-play"><svg aria-hidden="true"><use href="#i-play"/></svg></span>');
      card.addEventListener('click', () => start(u.id));
    }
    (u.soon ? soon : cards).append(card);
  }
  $('#composeHint').textContent = L('composeHint', S.universes[state.universe][0]);
  const shared = sharedId();
  $('#shared').hidden = !shared;
  if (shared) {
    $('#sharedTitle').textContent = pieceTitle(shared, state.lang);
    $('#shared .shared-kicker').textContent = `${L('sharedTitle')} · ${L('number', parsePieceId(shared).seed)}`;
  }
}

// Another universe: its theme fades in while the piece playing fades out, then a new piece starts.
async function switchUniverse(id) {
  if (id === state.universe && player.current) return;
  state.universe = id;
  store.set('universe', id);
  setTheme(universe(id).theme);
  buildForm();
  renderUniverses();
  if (!player.ctx) return start(id);
  state.playlist = [newPiece()];
  state.index = 0;
  await playId(state.playlist[0], 0, 1.5);
  renderPlayButton();
}

async function start(id = state.universe, piece = null) {
  $('#start').hidden = true;
  $('#universes').hidden = false;
  if (!piece) {
    state.universe = id;
    store.set('universe', id);
    setTheme(universe(id).theme);
    buildForm();
    renderUniverses();
  }
  state.playlist = [piece || newPiece()];
  await playIndex(0);
  renderPlayButton();
}

// A shared link opens in its piece's universe (without changing the listener's own).
{ const shared = sharedId(); if (shared) state.universe = universeOfSong(songFor(shared)).id; }
setTheme(universe(state.universe).theme);
$('#sharedButton').addEventListener('click', () => start(state.universe, sharedId()));
$('#play').addEventListener('click', togglePlay);
$('#next').addEventListener('click', () => player.ctx ? playIndex(state.index + 1) : start());
$('#prev').addEventListener('click', () => {
  if (!player.ctx) return;
  if (player.currentTime > 5 || state.index <= 0) playIndex(Math.max(state.index, 0));
  else playIndex(state.index - 1);
});
$('#fav').addEventListener('click', () => player.current && toggleFavorite(player.current));
$('#dl').addEventListener('click', (e) => { e.stopPropagation(); if (player.current) openDownloadMenu(player.current, e.currentTarget); });
document.addEventListener('click', (e) => { if (!e.target.closest('#dlMenu, .icon-btn')) closeDownloadMenu(); });
$('#share').addEventListener('click', () => player.current && share(player.current));
$('#generate').addEventListener('click', async () => {
  await player.start();
  $('#start').hidden = true;
  $('#universes').hidden = false;
  generatePlaylist();
  renderPlayButton();
});
$('#volume').value = String(player.volume);
$('#volume').addEventListener('input', (e) => { player.setVolume(Number(e.target.value)); store.set('volume', player.volume); });
$('#timer').addEventListener('change', (e) => { const m = Number(e.target.value); state.timerEnd = m ? Date.now() + m * 60000 : 0; });
$('#bar').addEventListener('click', (e) => {
  const id = player.current;
  if (!id) return;
  const r = e.currentTarget.getBoundingClientRect();
  playId(id, ((e.clientX - r.left) / r.width) * songFor(id).length);
});
for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => setTab(b.dataset.tab));
for (const b of document.querySelectorAll('.lang button')) b.addEventListener('click', () => { state.lang = b.dataset.lang; store.set('lang', state.lang); applyTexts(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDownloadMenu();
  if (e.target.closest('input, select, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'n' || e.key === 'ArrowRight') $('#next').click();
  else if (e.key === 'p' || e.key === 'ArrowLeft') $('#prev').click();
  else if (e.key === 'f') $('#fav').click();
});
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', togglePlay);
  navigator.mediaSession.setActionHandler('pause', togglePlay);
  navigator.mediaSession.setActionHandler('nexttrack', () => $('#next').click());
  navigator.mediaSession.setActionHandler('previoustrack', () => $('#prev').click());
}

// ---------------- offline, install ----------------

let offlineState = { done: 0, total: 0, busy: false };

function renderOffline() {
  const button = $('#offlineBtn');
  const { done, total, busy } = offlineState;
  const ready = total > 0 && done >= total;
  button.classList.toggle('done', ready);
  button.querySelector('use').setAttribute('href', ready ? '#i-check' : '#i-offline');
  $('#offlineLabel').textContent = ready ? L('offlineReady') : busy ? L('offlineProgress', Math.round((done / total) * 100)) : L('offline');
  button.title = L('offlineTitle');
}

async function checkOffline() {
  const manifest = await player.loadManifest();
  const files = Object.entries(manifest).flatMap(([name, list]) => list.map((f) => `notes/${name}/${f}`));
  const cache = await caches.open('lbam-notes');
  let done = 0;
  for (const f of files) if (await cache.match(new URL(f, location.href))) done++;
  offlineState = { done, total: files.length, busy: false };
  renderOffline();
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').then(() => {
    $('#offlineBtn').hidden = false;
    checkOffline();
  });
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type !== 'notes-progress') return;
    offlineState = { done: e.data.done, total: e.data.total, busy: e.data.done < e.data.total };
    renderOffline();
  });
  $('#offlineBtn').addEventListener('click', async () => {
    if (offlineState.total && offlineState.done >= offlineState.total) return;
    const registration = await navigator.serviceWorker.ready;
    offlineState.busy = true;
    renderOffline();
    registration.active.postMessage({ type: 'cache-all-notes' });
  });
}

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('#installBtn').hidden = false;
});
$('#installBtn').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('#installBtn').hidden = true;
});

applyTexts();
requestAnimationFrame(tick);
