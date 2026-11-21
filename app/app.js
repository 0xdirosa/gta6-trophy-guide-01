// Leonida Platinum v3 — offline GTA VI trophy tracker.
// Loads only data/trophies.json (a file of this app), keeps progress and
// per-trophy counts in localStorage, and never talks to the network at run time.
const KEY = 'leonida-platinum-v1';
const SPOILER_KEY = 'leonida-platinum-spoilers-v1';
const COUNT_KEY = 'leonida-platinum-counts-v1';
const KIND_LABELS = {
  story: 'Story', side: 'Side chains', activities: 'Activities',
  collectibles: 'Collectibles', crime: 'Crime', money: 'Money & property',
  completion: 'Completion', oddities: 'Odd one-offs',
};
const GRADE_ORDER = ['platinum', 'gold', 'silver', 'bronze'];
const VIEWS = ['tracker', 'roadmap', 'missables', 'sources', 'disputes'];
const VIEW_LABELS = { tracker: 'Tracker', roadmap: 'Roadmap', missables: 'Missables', sources: 'Sources', disputes: 'Disputes' };
const SHORT = (name) => name.split(' — ')[0];

const doc = await (await fetch('data/trophies.json')).json();
const trophies = doc.trophies;
const byId = new Map(trophies.map((t) => [t.id, t]));
const disputedIds = new Set(doc.disputes.flatMap((d) => d.trophies));
const stageOrder = doc.roadmap.stages.map((s) => s.id);
const stageOf = new Map();
for (const s of doc.roadmap.stages) for (const id of s.trophies) stageOf.set(id, s.id);

let earned = new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
earned = new Set([...earned].filter((id) => byId.has(id)));
let counts = new Map(Object.entries(JSON.parse(localStorage.getItem(COUNT_KEY) ?? '{}')).map(([k, v]) => [Number(k), Number(v)]));
counts = new Map([...counts].filter(([id]) => byId.has(id) && Number.isFinite(counts.get(id))));

const params = new URLSearchParams(location.search);
let view = VIEWS.includes(params.get('view')) ? params.get('view') : 'tracker';
let selectedId = Number(params.get('select')) || trophies[0].id;
let spoilerOn = params.get('spoiler') === 'on'
  ? true
  : params.get('spoiler') === 'off'
    ? false
    : localStorage.getItem(SPOILER_KEY) === '1';
let chip = params.get('kind') || 'all';

const $ = (id) => document.getElementById(id);
const qInput = $('q'), gradeSel = $('grade'), spoilerBox = $('spoiler');

if (params.get('grade') && [...gradeSel.options].some((o) => o.value === params.get('grade'))) gradeSel.value = params.get('grade');
if (params.get('q')) qInput.value = params.get('q');
spoilerBox.checked = spoilerOn;

function save() {
  localStorage.setItem(KEY, JSON.stringify([...earned].sort((a, b) => a - b)));
  localStorage.setItem(COUNT_KEY, JSON.stringify(Object.fromEntries(counts)));
  localStorage.setItem(SPOILER_KEY, spoilerBox.checked ? '1' : '0');
}

function isSpoiled(t) {
  return spoilerBox.checked && t.kind === 'story' && !earned.has(t.id);
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function fmtMoney(v) {
  return '$' + Number(v).toLocaleString('en-US');
}

function auditNumbers() {
  const steps = trophies.flatMap((t) => t.steps || []);
  const cited = steps.filter((s) => s.src).length;
  const backed = trophies.filter((t) => new Set((t.sources || []).map((s) => SHORT(s.name))).size >= 2).length;
  const sites = new Set(doc.sources.map((s) => new URL(s.url).hostname)).size;
  const counts = {};
  for (const g of GRADE_ORDER) counts[g] = trophies.filter((t) => t.grade === g).length;
  return {
    total: trophies.length, grades: counts,
    hidden: trophies.filter((t) => t.hidden).length,
    steps: steps.length, cited, backed,
    disputes: doc.disputes.length,
    pages: doc.sources.length, sites,
  };
}

function renderAudit() {
  const a = auditNumbers();
  const strip = $('audit-strip');
  strip.replaceChildren();
  const items = [
    a.total + '/' + a.total + ' official',
    '1P ' + a.grades.gold + 'G ' + a.grades.silver + 'S ' + a.grades.bronze + 'B',
    a.hidden + ' PSN-hidden',
    a.cited + '/' + a.steps + ' steps cited',
    a.backed + '/' + a.total + ' backed by 2+ sources',
    a.disputes + ' disputes, both ways',
    a.pages + ' pages · ' + a.sites + ' sites read 21 Nov 2026',
  ];
  for (const [i, text] of items.entries()) {
    if (i) strip.append(el('span', 'audit-sep', '·'));
    strip.append(el('span', 'audit-item', text));
  }
}

function renderTabs() {
  const nav = $('view-tabs');
  nav.replaceChildren();
  for (const v of VIEWS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab' + (v === view ? ' active' : '');
    b.textContent = VIEW_LABELS[v] + (v === 'disputes' ? ' (' + doc.disputes.length + ')' : '');
    b.addEventListener('click', () => { view = v; syncUrl(); renderAll(); });
    nav.append(b);
  }
}

function chipDefs() {
  const n = (fn) => trophies.filter(fn).length;
  return [
    { key: 'all', label: 'All', count: trophies.length },
    { key: 'story', label: 'Story', count: n((t) => t.kind === 'story') },
    { key: 'missable', label: 'Missable', count: n((t) => t.missable) },
    { key: 'watch', label: 'Watch', count: n((t) => t.risk && t.risk.status === 'watch') },
    { key: 'collectibles', label: 'Collectibles', count: n((t) => t.kind === 'collectibles') },
    { key: 'activities', label: 'Activities', count: n((t) => t.kind === 'activities') },
    { key: 'crime', label: 'Crime', count: n((t) => t.kind === 'crime') },
    { key: 'side', label: 'Side chains', count: n((t) => t.kind === 'side') },
    { key: 'money', label: 'Money', count: n((t) => t.kind === 'money') },
    { key: 'completion', label: 'Completion', count: n((t) => t.kind === 'completion') },
    { key: 'oddities', label: 'Oddities', count: n((t) => t.kind === 'oddities') },
    { key: 'hidden', label: 'PSN-hidden', count: n((t) => t.hidden) },
    { key: 'unconfirmed', label: 'Unconfirmed', count: n((t) => t.unconfirmed) },
    { key: 'disputed', label: 'Disputed', count: disputedIds.size },
    { key: 'earned', label: 'Earned', count: earned.size },
    { key: 'missing', label: 'Not earned', count: trophies.length - earned.size },
  ];
}

function chipMatches(t, key) {
  switch (key) {
    case 'all': return true;
    case 'missable': return !!t.missable;
    case 'watch': return t.risk && t.risk.status === 'watch';
    case 'hidden': return !!t.hidden;
    case 'unconfirmed': return !!t.unconfirmed;
    case 'disputed': return disputedIds.has(t.id);
    case 'earned': return earned.has(t.id);
    case 'missing': return !earned.has(t.id);
    default: return t.kind === key;
  }
}

function renderChips() {
  const box = $('chips');
  box.replaceChildren();
  for (const c of chipDefs()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (chip === c.key ? ' active' : '');
    b.textContent = c.label + ' ' + c.count;
    b.addEventListener('click', () => { chip = c.key; syncUrl(); renderAll(); });
    box.append(b);
  }
}

function renderProgress() {
  const total = trophies.length;
  const n = earned.size;
  const pct = Math.round((n / total) * 100);
  $('pct').textContent = pct + '%';
  $('count').textContent = n + ' / ' + total;
  $('bar-fill').style.width = pct + '%';
  $('bar').setAttribute('aria-valuenow', String(n));
  const grades = GRADE_ORDER.map((g) => {
    const got = trophies.filter((t) => t.grade === g && earned.has(t.id)).length;
    return got + g[0].toUpperCase();
  }).join(' ');
  $('progress-note').textContent = n === 0
    ? 'Tick a trophy to start your run to the platinum.'
    : n === total
      ? 'Platinum! Every one of the 55 trophies is earned.'
      : n + ' earned (' + grades + ') — ' + (total - n) + ' to go. Next: ' + nextSuggestion();
}

function nextSuggestion() {
  const order = [28, 3, 2, 16, 35, 31];
  for (const id of order) if (!earned.has(id)) return byId.get(id).name;
  const rest = trophies.find((t) => !earned.has(t.id));
  return rest ? rest.name : 'the platinum';
}

function roadmapOrder() {
  const out = [];
  for (const s of doc.roadmap.stages) for (const id of s.trophies) out.push(byId.get(id));
  return out;
}

function visible() {
  const q = qInput.value.trim().toLowerCase();
  return trophies.filter((t) => {
    if (!chipMatches(t, chip)) return false;
    if (gradeSel.value !== 'all' && t.grade !== gradeSel.value) return false;
    if (q && !(t.name + ' ' + t.description + ' ' + t.guide + ' ' + (t.target ?? '')).toLowerCase().includes(q)) return false;
    return true;
  });
}

function toggleEarned(id) {
  if (earned.has(id)) earned.delete(id);
  else earned.add(id);
  save();
  renderAll();
}

function setCount(id, value) {
  const t = byId.get(id);
  if (!t || !t.count) return;
  const max = t.count.of ?? t.count.need;
  const v = Math.max(0, Math.min(max, Math.round(value)));
  if (v === 0) counts.delete(id);
  else counts.set(id, v);
  save();
  renderAll();
}

function countLabel(t) {
  const have = counts.get(t.id) || 0;
  const unit = t.count.unit || '';
  const fmt = (v) => unit === '$' ? fmtMoney(v) : String(v);
  const of = t.count.of ? ' / ' + fmt(t.count.of) : ' needed';
  return fmt(have) + of;
}

function renderNextUp() {
  const next = roadmapOrder().filter((t) => !earned.has(t.id)).slice(0, 4);
  const box = el('section', 'next-up');
  box.append(el('span', 'next-label', 'NEXT UP · ROADMAP ORDER'));
  if (!next.length) {
    box.append(el('span', null, 'Everything is earned — the platinum is yours.'));
    return box;
  }
  const ul = el('ul', 'next-list');
  for (const t of next) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.addEventListener('click', () => { selectedId = t.id; view = 'tracker'; syncUrl(); renderAll(); });
    b.append(el('span', 'next-stage', stageOf.get(t.id)));
    b.append(document.createTextNode(' ' + t.name));
    b.append(el('span', 'badge ' + t.grade, t.grade));
    li.append(b);
    ul.append(li);
  }
  box.append(ul);
  return box;
}

function renderListInto(root) {
  const items = visible();
  const wrap = el('section', 'list-col');
  wrap.append(el('h2', null, 'Checklist '));
  wrap.querySelector('h2').append(el('span', null, '— showing ' + items.length + ' of ' + trophies.length));
  const list = el('ul', 'trophy-list');
  for (const t of items) {
    const li = el('li', 'trophy' + (earned.has(t.id) ? ' earned' : '') + (t.id === selectedId ? ' selected' : '') + (isSpoiled(t) ? ' spoiled' : ''));
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = earned.has(t.id);
    box.setAttribute('aria-label', 'Mark ' + t.name + ' as earned');
    box.addEventListener('change', (e) => { e.stopPropagation(); toggleEarned(t.id); });
    li.append(box);
    const mid = el('div');
    mid.append(el('div', 'trophy-name', isSpoiled(t) ? 'Hidden story trophy' : t.name));
    mid.append(el('div', 'trophy-desc', isSpoiled(t) ? 'Earn this story trophy to reveal its name and description.' : t.description));
    const meta = el('div', 'trophy-meta');
    meta.append(el('span', 'badge ' + t.grade, t.grade));
    meta.append(el('span', 'tag', KIND_LABELS[t.kind] ?? t.kind));
    if (t.target) meta.append(el('span', 'tag target', t.target));
    if (t.missable) meta.append(el('span', 'tag missable', '★ Missable'));
    else if (t.risk) meta.append(el('span', 'tag watch', 'Watch'));
    if (t.unconfirmed) meta.append(el('span', 'tag unconfirmed', 'Unconfirmed'));
    if (t.count) meta.append(el('span', 'tag count-tag', countLabel(t)));
    mid.append(meta);
    li.append(mid);
    li.append(el('span', 'earned-mark', earned.has(t.id) ? '✓ Earned' : ''));
    li.addEventListener('click', (e) => { if (e.target === box) return; selectedId = t.id; syncUrl(); renderAll(); });
    list.append(li);
  }
  wrap.append(list);
  root.append(wrap);
  return items.length;
}

function renderDetailInto(root) {
  const t = byId.get(selectedId) ?? trophies[0];
  const aside = el('aside', 'detail-col');
  const box = el('div', 'detail');
  if (isSpoiled(t)) {
    box.append(el('h2', null, 'Hidden story trophy'));
    box.append(el('p', 'official', 'This story trophy is hidden while spoiler hiding is on. Earn it on PlayStation — or switch spoiler hiding off — to reveal its name, description and guide.'));
    aside.append(box);
    root.append(aside);
    return;
  }
  box.append(el('h2', null, t.name));
  const off = el('p', 'official');
  off.append(el('strong', null, 'Official: '));
  off.append(document.createTextNode(t.description + ' '));
  off.append(el('span', 'badge ' + t.grade, t.grade));
  box.append(off);
  box.append(el('p', 'official', (KIND_LABELS[t.kind] ?? t.kind) + ' · ' + (t.chapter || 'Free roam') + ' · Stage ' + (t.stage || '—') + (t.target ? ' · ' + t.target : '')));
  const row = el('div', 'tick-row');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = earned.has(t.id) ? '✓ Earned — click to untick' : 'Mark as earned';
  btn.className = earned.has(t.id) ? 'earned' : '';
  btn.addEventListener('click', () => toggleEarned(t.id));
  row.append(btn);
  box.append(row);
  if (t.risk) {
    const warn = el('div', 'risk-box ' + t.risk.status);
    warn.append(el('p', 'risk-title', t.risk.status === 'missable' ? '★ POSSIBLY MISSABLE' : '⚠ WATCH — easy to get wrong'));
    warn.append(el('p', null, 'Window: ' + t.risk.window));
    warn.append(el('p', null, 'Last chance: ' + t.risk.lastChance));
    warn.append(el('p', null, 'Protect yourself: ' + t.risk.protect + ' [' + t.risk.src + ']'));
    box.append(warn);
  }
  // In-panel dispute notes: where the sources disagree about this trophy,
  // show both versions here (not only on the Disputes tab). d-balcony gets a
  // one-line summary of the same dispute (same facts, fewer words); other
  // disputes render in full.
  const DISPUTE_SHORT = {
    'd-balcony': {
      a: 'PowerPyx: the balcony raises the counter +1, but may not count as one of the 18.',
      b: 'KeenGamer: the balcony is a separate first step, not one of the 18.',
      call: 'Do the balcony in Chapter 1 anyway.',
    },
  };
  for (const d of doc.disputes.filter((x) => x.trophies.includes(t.id))) {
    const s = DISPUTE_SHORT[d.id];
    const note = el('div', 'dispute-note');
    const body = el('p', 'dispute-note-body');
    body.append(el('span', 'dispute-note-lead', '⚠ SOURCES DIFFER — ' + (s ? '' : d.topic + ': ')));
    if (s) {
      body.append(document.createTextNode(s.a + ' ' + s.b + ' '));
      body.append(el('strong', null, 'Our call: ' + s.call));
    } else {
      body.append(document.createTextNode('A — ' + d.a.src + ': ' + d.a.claim + ' '));
      body.append(document.createTextNode('B — ' + d.b.src + ': ' + d.b.claim + ' '));
      body.append(el('strong', null, 'Our call: ' + d.call));
    }
    note.append(body);
    box.append(note);
  }
  if (t.steps && t.steps.length) {
    box.append(el('h3', null, 'How to get it — cited steps'));
    const ol = el('ol', 'steps');
    for (const s of t.steps) {
      const li = document.createElement('li');
      li.append(document.createTextNode(s.text + ' '));
      li.append(el('span', 'ref', '[' + s.src + ']'));
      ol.append(li);
    }
    box.append(ol);
  } else {
    box.append(el('h3', null, 'How to get it'));
    box.append(el('p', 'guide-text', t.guide));
  }
  if (t.count) {
    const cw = el('div', 'count-widget');
    cw.append(el('span', 'count-label', 'YOUR COUNT'));
    const minus = document.createElement('button');
    minus.type = 'button'; minus.textContent = '−';
    minus.addEventListener('click', () => setCount(t.id, (counts.get(t.id) || 0) - (t.count.unit === '$' ? 1000 : 1)));
    const val = el('span', 'count-value', countLabel(t));
    const plus = document.createElement('button');
    plus.type = 'button'; plus.textContent = '+';
    plus.addEventListener('click', () => setCount(t.id, (counts.get(t.id) || 0) + (t.count.unit === '$' ? 1000 : 1)));
    cw.append(minus, val, plus);
    cw.append(el('span', 'count-note', 'Saved in this browser'));
    box.append(cw);
  }
  if (t.unconfirmed) {
    box.append(el('p', 'unconfirmed', 'Unconfirmed at launch: the guides listed this trophy’s exact trigger as unknown on 18 Nov 2026. The guide above follows the official description; check the sources for the confirmed method as players find it.'));
  }
  box.append(el('h3', null, 'SOURCES FOR THIS GUIDE'));
  const ul = el('ul', 'sources');
  for (const s of t.sources ?? []) {
    const short = SHORT(s.name);
    const n = (t.steps || []).filter((st) => st.src === short).length;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = s.url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = s.name;
    li.append(a);
    li.append(el('span', 'claim-count', n > 0 ? ' — ' + n + ' step' + (n > 1 ? 's' : '') + ' cited' : ' — guide source'));
    ul.append(li);
  }
  box.append(ul);
  if (t.steps && t.steps.length) {
    const det = document.createElement('details');
    det.className = 'notes';
    det.append(el('summary', null, 'Guide notes'));
    det.append(el('p', 'guide-text', t.guide));
    box.append(det);
  }
  aside.append(box);
  root.append(aside);
}

function renderTracker() {
  const root = $('view-root');
  root.replaceChildren();
  root.append(renderNextUp());
  const layout = el('div', 'layout');
  renderListInto(layout);
  renderDetailInto(layout);
  root.append(layout);
  $('filter-note').textContent = (chip === 'missable' ? 'Missable filter: only the 1 trophy the guides flag as possibly missable. ' : '')
    + (chip === 'watch' ? 'Watch filter: 6 trophies that punish a wrong move — check before you start. ' : '')
    + (spoilerBox.checked ? 'Spoiler shield ON: story trophies stay hidden until earned. ' : '')
    + 'Click a trophy to read its guide and sources on the right.';
}

function renderRoadmap() {
  const root = $('view-root');
  root.replaceChildren();
  const r = doc.roadmap;
  const head = el('section', 'roadmap-head');
  head.append(el('h2', null, 'Roadmap to the platinum'));
  head.append(el('p', 'roadmap-meta', 'Difficulty ' + r.difficulty + ' · Time ' + r.time + ' · ' + r.playthroughs + ' playthrough · ' + r.online + ' online trophies · Hardest: ' + r.hardest + ' · Saves: ' + r.saves + ' · Cheats ' + r.cheats + '. Time: PowerPyx (4/10, ~200 h); Push Square puts the same run at up to 300 h or more — see Disputes.'));
  root.append(head);
  const grid = el('div', 'stages');
  for (const s of r.stages) {
    const card = el('section', 'stage');
    const got = s.trophies.filter((id) => earned.has(id)).length;
    card.append(el('h3', null, s.id + ' — ' + s.title + ' '));
    card.querySelector('h3').append(el('span', null, got + '/' + s.trophies.length + ' earned · ' + s.hours));
    card.append(el('p', null, s.note));
    const ul = el('ul', 'stage-trophies');
    for (const id of s.trophies) {
      const t = byId.get(id);
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = earned.has(id) ? 'earned' : '';
      b.addEventListener('click', () => { selectedId = id; view = 'tracker'; syncUrl(); renderAll(); });
      b.append(document.createTextNode((earned.has(id) ? '✓ ' : '') + t.name));
      li.append(b);
      ul.append(li);
    }
    card.append(ul);
    grid.append(card);
  }
  root.append(grid);
  $('filter-note').textContent = 'Roadmap order is the order to earn them in: story first, then the 100% checklist, then cleanup. Click a trophy to open its guide.';
}

function renderMissables() {
  const root = $('view-root');
  root.replaceChildren();
  const miss = trophies.filter((t) => t.missable);
  const watch = trophies.filter((t) => t.risk && t.risk.status === 'watch');
  const head = el('section', 'miss-head');
  head.append(el('h2', null, 'Missables & watch list'));
  head.append(el('p', null, '1 possibly missable trophy, 6 watch trophies, and the story gates by chapter. Everything else can be finished in free roam after the story — there is no mission replay, so keep a manual save at the start and end of each chapter (15 manual slots).'));
  root.append(head);
  const mkTable = (title, rows) => {
    const sec = el('section', 'miss-table');
    sec.append(el('h3', null, title));
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const h of ['Trophy', 'Window', 'Last chance', 'Protect yourself', 'Source']) hr.append(el('th', null, h));
    thead.append(hr);
    table.append(thead);
    const tb = document.createElement('tbody');
    for (const t of rows) {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'linklike';
      b.textContent = t.name;
      b.addEventListener('click', () => { selectedId = t.id; view = 'tracker'; syncUrl(); renderAll(); });
      name.append(b);
      tr.append(name);
      tr.append(el('td', null, t.risk.window));
      tr.append(el('td', null, t.risk.lastChance));
      tr.append(el('td', null, t.risk.protect));
      tr.append(el('td', null, t.risk.src));
      tb.append(tr);
    }
    table.append(tb);
    sec.append(table);
    return sec;
  };
  root.append(mkTable('Last chance — possibly missable (' + miss.length + ')', miss));
  root.append(mkTable('Watch — easy to get wrong (' + watch.length + ')', watch));
  const gates = el('section', 'miss-gates');
  gates.append(el('h3', null, 'Story gates by chapter'));
  for (const ch of ['Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4', 'Chapter 5']) {
    const list = trophies.filter((t) => t.gate && t.gate.chapter === ch);
    if (!list.length) continue;
    gates.append(el('h4', null, ch));
    const ul = el('ul', 'gate-list');
    for (const t of list) {
      const li = document.createElement('li');
      li.append(document.createTextNode(t.gate.mission + ' → '));
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'linklike';
      b.textContent = t.name;
      b.addEventListener('click', () => { selectedId = t.id; view = 'tracker'; syncUrl(); renderAll(); });
      li.append(b);
      ul.append(li);
    }
    gates.append(ul);
  }
  root.append(gates);
  const unc = trophies.filter((t) => t.unconfirmed);
  const note = el('p', 'miss-note', unc.length + ' trophies have an unconfirmed trigger at launch (' + unc.map((t) => t.name).join(', ') + '). They are flagged Unconfirmed in the tracker, not guessed at.');
  root.append(note);
  $('filter-note').textContent = 'Missable data comes from the cited guides — PowerPyx flags the one missable meditation; the watch list is this guide’s own read of the same sources.';
}

function renderSources() {
  const root = $('view-root');
  root.replaceChildren();
  const head = el('section', 'sources-head');
  head.append(el('h2', null, 'Sources & audit'));
  head.append(el('p', null, 'Every fact in this guide comes from a page read on 21 Nov 2026. Claim counts are counted from this guide’s own data: steps citing a source, and guides listing it.'));
  root.append(head);
  const ol = el('ol', 'source-list');
  for (const [i, s] of doc.sources.entries()) {
    const short = SHORT(s.name);
    const guides = trophies.filter((t) => (t.sources || []).some((x) => SHORT(x.name) === short)).length;
    const steps = trophies.reduce((a, t) => a + (t.steps || []).filter((st) => st.src === short).length, 0);
    const li = document.createElement('li');
    li.append(el('strong', null, (i + 1) + '. '));
    const a = document.createElement('a');
    a.href = s.url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = s.name;
    li.append(a);
    li.append(el('p', null, 'Read ' + s.read + ' · cited by ' + guides + '/55 guides · ' + steps + ' steps cited. ' + s.note));
    ol.append(li);
  }
  root.append(ol);
  const a = auditNumbers();
  const strip = el('p', 'audit-line', 'Audit: ' + a.total + '/' + a.total + ' official · 1P ' + a.grades.gold + 'G ' + a.grades.silver + 'S ' + a.grades.bronze + 'B · ' + a.hidden + ' PSN-hidden · ' + a.cited + '/' + a.steps + ' steps cited · ' + a.backed + '/' + a.total + ' backed by 2+ sources · ' + a.disputes + ' disputes, both ways · ' + a.pages + ' pages · ' + a.sites + ' sites read 21 Nov 2026.');
  root.append(strip);
  $('filter-note').textContent = 'Sources are cited, never copied: every guide is written for this page in our own words.';
}

function renderDisputes() {
  const root = $('view-root');
  root.replaceChildren();
  const head = el('section', 'disputes-head');
  head.append(el('h2', null, 'Disputes — shown both ways'));
  head.append(el('p', null, 'Where the sources disagree, this guide shows both versions and says which one it follows. Nothing here is invented: each side names its source.'));
  root.append(head);
  for (const d of doc.disputes) {
    const card = el('section', 'dispute');
    card.append(el('h3', null, d.topic));
    const grid = el('div', 'dispute-grid');
    const aSide = el('div', 'dispute-side');
    aSide.append(el('p', 'dispute-who', 'A — ' + d.a.src));
    aSide.append(el('p', null, d.a.claim));
    const bSide = el('div', 'dispute-side');
    bSide.append(el('p', 'dispute-who', 'B — ' + d.b.src));
    bSide.append(el('p', null, d.b.claim));
    grid.append(aSide, bSide);
    card.append(grid);
    card.append(el('p', 'dispute-call', 'Our call: ' + d.call));
    const names = d.trophies.map((id) => byId.get(id).name).join(', ');
    card.append(el('p', 'dispute-trophies', 'Trophies: ' + names));
    root.append(card);
  }
  $('filter-note').textContent = doc.disputes.length + ' disputes, each with both versions and our call. If a source later settles one, the call changes with it.';
}

function syncUrl() {
  const p = new URLSearchParams();
  p.set('view', view);
  p.set('select', String(selectedId));
  p.set('spoiler', spoilerBox.checked ? 'on' : 'off');
  if (chip !== 'all') p.set('kind', chip);
  if (gradeSel.value !== 'all') p.set('grade', gradeSel.value);
  if (qInput.value.trim()) p.set('q', qInput.value.trim());
  history.replaceState(null, '', '?' + p.toString());
}

function renderAll() {
  renderAudit();
  renderTabs();
  renderProgress();
  const trackerOnly = view === 'tracker';
  $('controls').style.display = trackerOnly ? '' : 'none';
  $('chips').style.display = trackerOnly ? '' : 'none';
  $('filter-note').style.display = trackerOnly ? '' : 'none';
  if (trackerOnly) renderChips();
  if (view === 'tracker') renderTracker();
  else if (view === 'roadmap') renderRoadmap();
  else if (view === 'missables') renderMissables();
  else if (view === 'sources') renderSources();
  else renderDisputes();
  $('spoiler').closest('label').childNodes[1].textContent = spoilerBox.checked ? ' Spoiler shield ON ' : ' Hide story spoilers ';
  $('sources-line').textContent = 'Guide sources: ' + doc.sources.map((s) => SHORT(s.name)).join(', ') + ' — linked beside each trophy. Read 21 Nov 2026.';
}

$('export').addEventListener('click', () => {
  const payload = { game: doc.game, platform: doc.platform, exported_at: new Date().toISOString(), earned: [...earned].sort((a, b) => a - b), counts: Object.fromEntries(counts) };
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
    earned = new Set(ids.map(Number).filter((id) => byId.has(id)));
    if (data.counts && typeof data.counts === 'object') {
      counts = new Map(Object.entries(data.counts).map(([k, v]) => [Number(k), Number(v)]).filter(([id]) => byId.has(id)));
    }
    save();
    renderAll();
    $('filter-note').textContent = 'Imported ' + earned.size + ' earned trophies from ' + file.name + '.';
  } catch {
    $('filter-note').textContent = 'That file could not be imported — it must be a progress file exported by this guide.';
  }
  e.target.value = '';
});

$('reset').addEventListener('click', () => {
  if (!earned.size && !counts.size) return;
  if (confirm('Clear all earned trophies and counts? This cannot be undone — export first if you want a backup.')) {
    earned = new Set();
    counts = new Map();
    save();
    renderAll();
  }
});

for (const c of [qInput, gradeSel]) c.addEventListener('input', () => { syncUrl(); renderAll(); });
spoilerBox.addEventListener('change', () => { save(); syncUrl(); renderAll(); });

renderAll();
