// Leonida Platinum — offline GTA VI trophy tracker.
// Loads only data/trophies.json (a file of this app), keeps progress in
// localStorage, and never talks to the network at run time.
const KEY = 'leonida-platinum-v1';
const SPOILER_KEY = 'leonida-platinum-spoilers-v1';
const KIND_LABELS = {
  story: 'Story', side: 'Side quests', activities: 'Activities',
  collectibles: 'Collectibles', crime: 'Crime', money: 'Money & property',
  completion: 'Completion', oddities: 'Odd one-offs',
};
const GRADE_ORDER = ['platinum', 'gold', 'silver', 'bronze'];

const doc = await (await fetch('data/trophies.json')).json();
const trophies = doc.trophies;

let earned = new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
earned = new Set([...earned].filter((id) => trophies.some((t) => t.id === id)));

const params = new URLSearchParams(location.search);
let selectedId = Number(params.get('select')) || trophies[0].id;
let spoilerOn = params.get('spoiler') === 'on'
  ? true
  : params.get('spoiler') === 'off'
    ? false
    : localStorage.getItem(SPOILER_KEY) === '1';

const $ = (id) => document.getElementById(id);
const qInput = $('q'), kindSel = $('kind'), gradeSel = $('grade'),
  earnedSel = $('earned-filter'), spoilerBox = $('spoiler');

if (params.get('kind') && [...kindSel.options].some((o) => o.value === params.get('kind'))) kindSel.value = params.get('kind');
if (params.get('grade') && [...gradeSel.options].some((o) => o.value === params.get('grade'))) gradeSel.value = params.get('grade');
if (params.get('q')) qInput.value = params.get('q');
spoilerBox.checked = spoilerOn;

function save() {
  localStorage.setItem(KEY, JSON.stringify([...earned].sort((a, b) => a - b)));
  localStorage.setItem(SPOILER_KEY, spoilerBox.checked ? '1' : '0');
}

function isSpoiled(t) {
  return spoilerBox.checked && t.kind === 'story' && !earned.has(t.id);
}

function visible() {
  const q = qInput.value.trim().toLowerCase();
  return trophies.filter((t) => {
    if (kindSel.value === 'missable') { if (!t.missable) return false; }
    else if (kindSel.value !== 'all' && t.kind !== kindSel.value) return false;
    if (gradeSel.value !== 'all' && t.grade !== gradeSel.value) return false;
    if (earnedSel.value === 'earned' && !earned.has(t.id)) return false;
    if (earnedSel.value === 'missing' && earned.has(t.id)) return false;
    if (q && !(t.name + ' ' + t.description + ' ' + t.guide + ' ' + (t.target ?? '')).toLowerCase().includes(q)) return false;
    return true;
  });
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function renderProgress() {
  const total = trophies.length;
  const n = earned.size;
  const pct = Math.round((n / total) * 100);
  $('pct').textContent = pct + '%';
  $('count').textContent = n + ' / ' + total;
  $('bar-fill').style.width = pct + '%';
  $('bar').setAttribute('aria-valuenow', String(n));
  $('progress-note').textContent = n === 0
    ? 'Tick a trophy to start your run to the platinum.'
    : n === total
      ? 'Platinum! Every one of the 55 trophies is earned.'
      : n + ' earned — ' + (total - n) + ' to go. Next: ' + nextSuggestion();
  const chips = $('grade-chips');
  chips.replaceChildren();
  for (const g of GRADE_ORDER) {
    const got = trophies.filter((t) => t.grade === g && earned.has(t.id)).length;
    const all = trophies.filter((t) => t.grade === g).length;
    const li = el('li', 'dot-' + g, g[0].toUpperCase() + g.slice(1) + ' ' + got + '/' + all);
    chips.append(li);
  }
}

function nextSuggestion() {
  const order = [28, 3, 2, 16, 35, 31];
  for (const id of order) if (!earned.has(id)) return trophies.find((t) => t.id === id).name;
  const rest = trophies.find((t) => !earned.has(t.id));
  return rest ? rest.name : 'the platinum';
}

function renderList() {
  const list = $('list');
  const items = visible();
  list.replaceChildren();
  for (const t of items) {
    const li = el('li', 'trophy' + (earned.has(t.id) ? ' earned' : '') + (t.id === selectedId ? ' selected' : '') + (isSpoiled(t) ? ' spoiled' : ''));
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = earned.has(t.id);
    box.setAttribute('aria-label', 'Mark ' + t.name + ' as earned');
    box.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleEarned(t.id);
    });
    li.append(box);
    const mid = el('div');
    mid.append(el('div', 'trophy-name', isSpoiled(t) ? 'Hidden story trophy' : t.name));
    mid.append(el('div', 'trophy-desc', isSpoiled(t) ? 'Earn this story trophy to reveal its name and description.' : t.description));
    const meta = el('div', 'trophy-meta');
    meta.append(el('span', 'badge ' + t.grade, t.grade));
    meta.append(el('span', 'tag', KIND_LABELS[t.kind] ?? t.kind));
    if (t.target) meta.append(el('span', 'tag target', t.target));
    if (t.missable) meta.append(el('span', 'tag missable', '★ Missable'));
    mid.append(meta);
    li.append(mid);
    li.append(el('span', 'earned-mark', earned.has(t.id) ? '✓ Earned' : ''));
    li.addEventListener('click', (e) => {
      if (e.target === box) return;
      selectedId = t.id;
      renderAll();
    });
    list.append(li);
  }
  $('shown-count').textContent = '— showing ' + items.length + ' of ' + trophies.length;
  $('filter-note').textContent = items.length === 0
    ? 'No trophies match these filters — clear the search or widen the kind and grade.'
    : (kindSel.value === 'missable' ? 'Missable filter: only the 1 trophy the guides flag as possibly missable. ' : '')
      + (spoilerBox.checked ? 'Spoiler hiding is on: story trophies stay hidden until earned. ' : '')
      + 'Click a trophy to read its guide and sources on the right.';
}

function renderDetail() {
  const t = trophies.find((x) => x.id === selectedId) ?? trophies[0];
  const box = $('detail');
  box.replaceChildren();
  if (isSpoiled(t)) {
    box.append(el('h2', null, 'Hidden story trophy'));
    box.append(el('p', 'official', 'This story trophy is hidden while spoiler hiding is on. Earn it on PlayStation — or switch spoiler hiding off — to reveal its name, description and guide.'));
    return;
  }
  box.append(el('h2', null, t.name));
  const off = el('p', 'official');
  off.append(el('strong', null, 'Official: '));
  off.append(document.createTextNode(t.description + ' '));
  off.append(el('span', 'badge ' + t.grade, t.grade));
  box.append(off);
  const meta = el('p', 'official', (KIND_LABELS[t.kind] ?? t.kind) + (t.target ? ' · ' + t.target : ''));
  box.append(meta);
  if (t.missable) {
    const warn = el('p', 'missable-box', '★ MISSABLE — the only trophy the guides flag as possibly missable. Do the Chapter 1 balcony meditation with Lucia before leaving Chapter 1; there is no mission replay.');
    box.append(warn);
  }
  box.append(el('h3', null, 'How to get it'));
  box.append(el('p', 'guide-text', t.guide));
  const unconfirmed = /still being confirmed|unknown at launch|still pinning down|no confirmed steps|no confirmed method/i.test(t.guide);
  if (unconfirmed) {
    box.append(el('p', 'unconfirmed', 'Unconfirmed at launch: the guides listed this trophy’s exact trigger as unknown on 18 Nov 2026. The guide above follows the official description; check the sources for the confirmed method as players find it.'));
  }
  box.append(el('h3', null, 'Sources'));
  const ul = el('ul', 'sources');
  for (const s of t.sources ?? []) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = s.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = s.name;
    li.append(a);
    ul.append(li);
  }
  box.append(ul);
  const row = el('div', 'tick-row');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = earned.has(t.id) ? '✓ Earned — click to untick' : 'Mark as earned';
  btn.className = earned.has(t.id) ? 'earned' : '';
  btn.addEventListener('click', () => toggleEarned(t.id));
  row.append(btn);
  box.append(row);
}

function renderAll() {
  renderProgress();
  renderList();
  renderDetail();
}

function toggleEarned(id) {
  if (earned.has(id)) earned.delete(id);
  else earned.add(id);
  save();
  renderAll();
}

$('export').addEventListener('click', () => {
  const payload = { game: doc.game, platform: doc.platform, exported_at: new Date().toISOString(), earned: [...earned].sort((a, b) => a - b) };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  a.download = 'gta6-trophy-progress.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const ids = Array.isArray(data) ? data : data.earned;
    if (!Array.isArray(ids)) throw new Error('bad file');
    const next = new Set(ids.map(Number).filter((id) => trophies.some((t) => t.id === id)));
    earned = next;
    save();
    renderAll();
    $('filter-note').textContent = 'Imported ' + next.size + ' earned trophies from ' + file.name + '.';
  } catch {
    $('filter-note').textContent = 'That file could not be imported — it must be a progress file exported by this guide.';
  }
  e.target.value = '';
});

$('reset').addEventListener('click', () => {
  if (!earned.size) return;
  if (confirm('Clear all earned trophies? This cannot be undone — export first if you want a backup.')) {
    earned = new Set();
    save();
    renderAll();
  }
});

for (const c of [qInput, kindSel, gradeSel, earnedSel]) c.addEventListener('input', renderAll);
spoilerBox.addEventListener('change', () => { save(); renderAll(); });

renderAll();
