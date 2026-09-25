// La Boîte à Musique: the page. Plays an endless stream of generated pieces, lets the listener
// compose a playlist from a few quick choices, keep favourites, download and share pieces.
import { Player } from './player.js';
import { Visualizer, InstrumentColors } from './visualizer.js';
import { songFor, pieceId, parsePieceId, randomSeed, pieceTitle } from './pieces.js';
import { Strings, t } from './i18n.js';
import { InstrumentId, InstrumentCount, Instruments } from '../engine/instruments.js';
import { Leads, Accomps } from '../engine/composer.js';

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
  choices: store.get('choices', {}),
  count: store.get('count', 10),
  playlist: [],
  index: -1,
  tab: 'playlist',
  timerEnd: 0,
};

const player = new Player();
player.setVolume(store.get('volume', 0.8));
const viz = new Visualizer($('#viz'), player, document.querySelector('.now'));
const L = (key, ...args) => t(state.lang, key, ...args);

// ---------------- pieces ----------------

function newPiece() {
  const choices = {};
  for (const [k, v] of Object.entries(state.choices)) if (v !== '' && v !== null && v !== undefined) choices[k] = v;
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

async function playId(id, start = 0) {
  showLoading(true);
  try { await player.play(id, 0.4, start); } finally { showLoading(false); }
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

function renderNow(id) {
  if (!id) return;
  const song = songFor(id);
  const p = parsePieceId(id);
  viz.setSong(song);
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
  for (let i = 0; i < InstrumentCount; i++) {
    if (!song.uses[i] || (i === InstrumentId.Tap && song.uses[InstrumentId.Kick])) continue;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset.instrument = i === InstrumentId.Tap ? InstrumentId.Kick : i;
    chip.style.setProperty('--c', InstrumentColors[i]);
    chip.textContent = Strings[state.lang].instruments[i];
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
      if (time < n.time + n.duration + 0.15) lit.add(n.instrument === InstrumentId.Tap ? InstrumentId.Kick : n.instrument);
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

function buildForm() {
  const S = Strings[state.lang];
  const fields = [
    ['style', L('style'), S.styles.map((s, i) => [i, s])],
    ['mode', L('mood'), S.moods.map((s, i) => [i, s])],
    ['lead', L('lead'), Leads.map((id) => [id, S.instruments[id]])],
    ['accomp', L('accomp'), Accomps.map((id) => [id, S.instruments[id]])],
    ['tempo', L('tempo'), [['s', L('slower')], ['f', L('faster')]]],
    ['drums', L('drums'), [['y', L('with')], ['n', L('without')]]],
    ['room', L('room'), S.rooms.map((s, i) => [i, s])],
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
    const current = state.choices[name];
    select.value = current === undefined ? '' : String(current);
    select.addEventListener('change', () => {
      const v = select.value;
      if (v === '') delete state.choices[name];
      else state.choices[name] = name === 'tempo' || name === 'drums' ? v : Number(v);
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

async function start() {
  $('#start').hidden = true;
  const shared = /#p=([\w.-]+)/.exec(location.hash)?.[1];
  const first = shared && parsePieceId(shared) ? shared : newPiece();
  state.playlist = [first];
  await playIndex(0);
  renderPlayButton();
}

$('#startButton').addEventListener('click', start);
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
$('#generate').addEventListener('click', async () => { await player.start(); $('#start').hidden = true; generatePlaylist(); renderPlayButton(); });
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
