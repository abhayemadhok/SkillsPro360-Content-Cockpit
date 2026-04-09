
/* ── Category map ─────────────────────────────────────────────────────────── */
const CATEGORIES = {
  'Harvard: Health Care Leadership': [
    'hbs-healthcare-strategy',
    'hms-digital-health',
    'hbs-teamwork-healthcare',
    'hms-reducing-racial-disparities'
  ],
  'Harvard: Data Science & Digital Transformation': [
    'hbs-data-science-business',
    'harvard-data-science-ai-principles',
    'harvard-data-privacy-technology',
    'harvard-big-data-social-good'
  ],
  'Harvard: Leadership, Communication & Transformation': [
    'hks-adaptive-leadership',
    'hbs-open-innovation',
    'harvard-innovation-strategy',
    'harvard-blind-spots-decisions'
  ],
  'Harvard: Power Skills & Professional Advancement': [
    'hms-winning-mindset',
    'hls-purpose-persuasion',
    'harvard-authenticity-identity',
    'harvard-tech-ethics',
    'hks-effective-writing',
    'hks-productive-disagreement',
    'hks-cultivating-power'
  ],
  'Maxme: Human Skills Programs': [
    'maxme-new-to-leadership',
    'maxme-activating-strengths',
    'maxme-emerging-leadership',
    'maxme-communicate-connect',
    'maxme-human-skills-ai',
    'maxme-eq-foundations'
  ]
};

/* ── State ────────────────────────────────────────────────────────────────── */
let allCerts      = [];
let selectedCert  = null;
let hiIdx         = -1;
let visOpts       = [];
let contentLibrary = {};   // keyed by cert id — populated from content_library.json

// Stored image prompts for copy-image
const imagePromptCache = {};

/* ═══════════════════════════════════════════════════════════════════════════
   LOCALSTORAGE — Keys
   ═══════════════════════════════════════════════════════════════════════════ */
const LS_KEY         = 'sp360_used_posts';
const LS_PAYLOAD_KEY = 'sp360_current_payload';
const LS_HISTORY_KEY = 'sp360_history';

/* ── Payload persistence ─────────────────────────────────────────────────── */
function savePayload(certId, posts) {
  try {
    const data = { certId, posts, savedAt: new Date().toISOString() };
    localStorage.setItem(LS_PAYLOAD_KEY, JSON.stringify(data));
    updateHistory(certId);
  } catch (e) { console.warn('savePayload failed', e); }
}

function loadSavedPayload() {
  try {
    const raw = localStorage.getItem(LS_PAYLOAD_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || !data.certId || !data.posts) return;

    // Re-select the cert silently (no reset, no dropdown rebuild)
    const cert = allCerts.find(c => c.id === data.certId);
    if (!cert) return;

    selectedCert = cert;
    window.SP360Bridge._set(cert);
    document.getElementById('badge-title').textContent = cert.title;
    document.getElementById('badge-meta').textContent =
      `${cert.provider} · ${cert.faculty_school} · ${cert.price_usd} · ${cert.next_cohort}`;
    document.getElementById('selected-badge').classList.add('on');
    document.getElementById('generate-btn').disabled = false;
    document.getElementById('btn-label').textContent = 'Regenerate Content';

    // Re-render cards directly from stored post data (no rebuild)
    restoreCards(data.posts);
    refreshUsedIndicators();
  } catch (e) { console.warn('loadSavedPayload failed', e); }
}

function restoreCards(posts) {
  Object.entries(posts).forEach(([type, data]) => {
    imagePromptCache[type] = data.imagePrompt;

    document.getElementById('empty-' + type).style.display = 'none';
    const contentEl = document.getElementById('content-' + type);
    contentEl.style.display = 'flex';

    document.getElementById('hook-' + type).textContent = data.hook;
    document.getElementById('body-' + type).textContent = data.body;

    const tagsEl = document.getElementById('tags-' + type);
    tagsEl.innerHTML = (data.tags || []).map(t => `<span class="post-tag">${t}</span>`).join('');

    document.getElementById('vibe-' + type).textContent = '🎨 ' + (data.vibe || '');
    document.getElementById('card-' + type).classList.add('populated');
  });
}

function clearPayload() {
  localStorage.removeItem(LS_PAYLOAD_KEY);
  selectedCert = null;
  window.SP360Bridge._clear();
  document.getElementById('selected-badge').classList.remove('on');
  document.getElementById('generate-btn').disabled = true;
  document.getElementById('btn-label').textContent = 'Generate Today\'s Content';
  document.getElementById('btn-icon').textContent = '✦';
  document.getElementById('search-input').value = '';
  resetCards();
  buildDropdown('');
}

/* ── History ─────────────────────────────────────────────────────────────── */
function getHistory() {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function updateHistory(certId) {
  const cert = allCerts.find(c => c.id === certId);
  if (!cert) return;
  let history = getHistory();
  // Remove existing entry for this cert so it re-appears at top
  history = history.filter(h => h.certId !== certId);
  history.unshift({ certId, title: cert.title, provider: cert.provider, savedAt: new Date().toISOString() });
  history = history.slice(0, 5);
  localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;
  const history = getHistory();
  if (!history.length) {
    list.innerHTML = '<div class="history-empty">No history yet.<br>Generate a post set to begin.</div>';
    return;
  }
  list.innerHTML = history.map(h => {
    const when = formatRelative(h.savedAt);
    return `<div class="history-item" onclick="restoreFromHistory('${h.certId}')">
      <div class="history-item-title">${h.title}</div>
      <div class="history-item-meta">${h.provider} · ${when}</div>
    </div>`;
  }).join('');
}

function restoreFromHistory(certId) {
  try {
    const raw = localStorage.getItem(LS_PAYLOAD_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.certId === certId) {
        // Already the current payload — just re-render
        loadSavedPayload();
        return;
      }
    }
    // Different cert: select it, then render immediately from library if available
    const cert = allCerts.find(c => c.id === certId);
    if (!cert) return;
    resetCards();
    selectCert(cert);

    const entry = contentLibrary[certId];
    if (entry) {
      restoreCards(entry.posts);
      savePayload(certId, entry.posts);
      refreshUsedIndicators();
      document.getElementById('btn-label').textContent = 'Regenerate Content';
    }
    // If no library entry, user clicks Generate to build via Agent Bridge
  } catch (e) { console.warn('restoreFromHistory failed', e); }
}

function formatRelative(iso) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return ''; }
}

/* ── Used Tracking ───────────────────────────────────────────────────────── */

function getUsed() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
  catch { return {}; }
}

function markUsed(certId, type) {
  const used = getUsed();
  used[`${certId}_${type}`] = true;
  localStorage.setItem(LS_KEY, JSON.stringify(used));
}

function isUsed(certId, type) {
  return !!getUsed()[`${certId}_${type}`];
}

function refreshUsedIndicators() {
  if (!selectedCert) return;
  ['prestige', 'disruptor', 'practitioner'].forEach(type => {
    const el = document.getElementById('used-' + type);
    if (el) el.classList.toggle('on', isUsed(selectedCert.id, type));
  });
  // Refresh dropdown dots
  rebuildUsedDots();
}

function rebuildUsedDots() {
  const used = getUsed();
  document.querySelectorAll('.dd-option').forEach(el => {
    const id = el.dataset.id;
    const dot = el.querySelector('.dd-used-dot');
    if (!dot) return;
    const hasAny = ['prestige','disruptor','practitioner'].some(t => used[`${id}_${t}`]);
    dot.style.display = hasAny ? 'inline-block' : 'none';
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   JS BRIDGE — Task 4
   Exposes the selected cert to external agents / slash commands.
   Access via:  window.SP360Bridge.getPayload()
   ═══════════════════════════════════════════════════════════════════════════ */
window.SP360Bridge = {
  _cert: null,

  /** Returns a structured payload ready for /agents generation */
  getPayload() {
    if (!this._cert) return null;
    const c = this._cert;
    return {
      certId:       c.id,
      title:        c.title,
      provider:     c.provider,
      facultySchool: c.faculty_school,
      price:        c.price_usd,
      nextCohort:   c.next_cohort,
      industries:   c.industries,
      personas:     c.target_personas,
      hooks: {
        coreProblem:      c.core_problem,
        ahaMoment:        c.aha_moment,
        roi:              c.roi,
        enemyOfProgress:  c.enemy_of_progress,
        practicalShift:   c.practical_shift,
        visualVibe:       c.visual_vibe
      },
      modules:      c.syllabus_modules,
      outcomes:     c.learning_outcomes,
      _readyAt:     new Date().toISOString()
    };
  },

  /** Returns the raw selected cert object */
  getCert() { return this._cert; },

  /** Returns just the cert ID string */
  getId() { return this._cert ? this._cert.id : null; },

  _set(cert) {
    this._cert = cert;
    this._notifyHeader(cert);
    this._notifyRow(cert);
  },

  _clear() {
    this._cert = null;
    document.getElementById('bridge-indicator').classList.remove('active');
    document.getElementById('bridge-row').classList.remove('on');
  },

  _notifyHeader(cert) {
    const el = document.getElementById('bridge-indicator');
    document.getElementById('bridge-label').textContent = cert.id;
    el.classList.add('active');
  },

  _notifyRow(cert) {
    document.getElementById('bridge-id-pill').textContent = cert.id;
    document.getElementById('bridge-meta').textContent =
      cert.provider + ' · ' + cert.duration;
    document.getElementById('bridge-row').classList.add('on');
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
   LOAD KB
   ═══════════════════════════════════════════════════════════════════════════ */
async function loadKB() {
  try {
    // Load KB and pre-built library in parallel — library failure is non-fatal
    const [certsRes, libRes] = await Promise.all([
      fetch('data/certs_kb.json'),
      fetch('data/content_library.json').catch(() => null)
    ]);

    const kb = await certsRes.json();
    allCerts = kb.certifications || [];

    if (libRes && libRes.ok) {
      const lib = await libRes.json();
      (lib.entries || []).forEach(e => { contentLibrary[e.id] = e; });
      console.log(`📚 Content library loaded — ${Object.keys(contentLibrary).length} entries ready.`);
    }

    buildDropdown('');
    renderHistory();      // populate sidebar from stored history
    loadSavedPayload();   // auto-restore last generated session
  } catch (e) {
    console.error('Failed to load data/certs_kb.json', e);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   DROPDOWN
   ═══════════════════════════════════════════════════════════════════════════ */
function buildDropdown(query) {
  const list = document.getElementById('dropdown-list');
  const q    = query.toLowerCase().trim();
  const used = getUsed();
  list.innerHTML = '';
  visOpts = [];
  let hasResults = false;

  for (const [cat, ids] of Object.entries(CATEGORIES)) {
    const matches = ids
      .map(id => allCerts.find(c => c.id === id))
      .filter(c => {
        if (!c) return false;
        if (!q) return true;
        return (
          c.title.toLowerCase().includes(q) ||
          c.provider.toLowerCase().includes(q) ||
          cat.toLowerCase().includes(q) ||
          (c.faculty_school || '').toLowerCase().includes(q) ||
          (c.industries  || []).some(i => i.toLowerCase().includes(q))
        );
      });

    if (!matches.length) continue;
    hasResults = true;

    const grp = document.createElement('div');
    grp.className = 'group-label';
    grp.textContent = cat;
    list.appendChild(grp);

    matches.forEach(cert => {
      const hasAny = ['prestige','disruptor','practitioner'].some(t => used[`${cert.id}_${t}`]);
      const opt = document.createElement('div');
      opt.className = 'dd-option' + (selectedCert?.id === cert.id ? ' selected' : '');
      opt.dataset.id = cert.id;
      opt.innerHTML =
        `<span class="dd-used-dot" style="display:${hasAny ? 'inline-block' : 'none'}"></span>` +
        `<span>${cert.title}</span>` +
        `<span class="dd-price">${cert.price_usd}</span>`;
      opt.addEventListener('mousedown', e => { e.preventDefault(); selectCert(cert); });
      list.appendChild(opt);
      visOpts.push({ el: opt, cert });
    });
  }

  if (!hasResults) {
    const nr = document.createElement('div');
    nr.className = 'no-results';
    nr.textContent = `No courses match "${query}"`;
    list.appendChild(nr);
  }

  hiIdx = -1;
}

function selectCert(cert) {
  selectedCert = cert;

  // Update bridge
  window.SP360Bridge._set(cert);

  // Update badge
  document.getElementById('badge-title').textContent = cert.title;
  document.getElementById('badge-meta').textContent =
    `${cert.provider} · ${cert.faculty_school} · ${cert.price_usd} · ${cert.next_cohort}`;
  document.getElementById('selected-badge').classList.add('on');

  // Enable button
  document.getElementById('generate-btn').disabled = false;

  // Refresh used indicators
  refreshUsedIndicators();
  resetCards();

  // Close dropdown
  document.getElementById('search-input').value = '';
  document.getElementById('search-input').blur();
  document.getElementById('dropdown-list').classList.remove('open');
}

document.getElementById('badge-clear').addEventListener('click', () => {
  selectedCert = null;
  window.SP360Bridge._clear();
  document.getElementById('selected-badge').classList.remove('on');
  document.getElementById('generate-btn').disabled = true;
  document.getElementById('search-input').value = '';
  resetCards();
  buildDropdown('');
});

document.getElementById('reset-btn').addEventListener('click', () => {
  clearPayload();
});

/* Dropdown open / search */
const $search = document.getElementById('search-input');
const $list   = document.getElementById('dropdown-list');

$search.addEventListener('focus',  () => { buildDropdown($search.value); $list.classList.add('open'); });
$search.addEventListener('blur',   () => setTimeout(() => $list.classList.remove('open'), 160));
$search.addEventListener('input',  () => { buildDropdown($search.value); $list.classList.add('open'); hiIdx = -1; });

$search.addEventListener('keydown', e => {
  if (!$list.classList.contains('open')) return;
  if (e.key === 'ArrowDown')  { e.preventDefault(); hiIdx = Math.min(hiIdx + 1, visOpts.length - 1); applyHi(); }
  else if (e.key === 'ArrowUp')   { e.preventDefault(); hiIdx = Math.max(hiIdx - 1, 0); applyHi(); }
  else if (e.key === 'Enter')     { e.preventDefault(); if (hiIdx >= 0 && visOpts[hiIdx]) selectCert(visOpts[hiIdx].cert); }
  else if (e.key === 'Escape')    { $list.classList.remove('open'); }
});

function applyHi() {
  visOpts.forEach((o, i) => o.el.classList.toggle('hi', i === hiIdx));
  visOpts[hiIdx]?.el.scrollIntoView({ block: 'nearest' });
}

/* ═══════════════════════════════════════════════════════════════════════════
   GENERATE
   ═══════════════════════════════════════════════════════════════════════════ */
document.getElementById('generate-btn').addEventListener('click', () => {
  if (!selectedCert) return;

  const btn   = document.getElementById('generate-btn');
  const label = document.getElementById('btn-label');
  const icon  = document.getElementById('btn-icon');

  // ── Fast path: pre-built content library ──────────────────────────────────
  const entry = contentLibrary[selectedCert.id];
  if (entry) {
    restoreCards(entry.posts);
    savePayload(selectedCert.id, entry.posts);
    refreshUsedIndicators();
    label.textContent = 'Regenerate Content';
    return;
  }

  // ── Fallback: Agent Bridge + local template builders ─────────────────────
  // Used when running locally with Claude Code and content_library.json is
  // absent or the selected cert has no pre-built entry.
  btn.disabled = true;
  icon.innerHTML = '<span class="spinner"></span>';
  label.textContent = 'Generating…';

  setTimeout(() => {
    const payload = window.SP360Bridge.getPayload();
    if (!payload) { btn.disabled = false; icon.textContent = '✦'; label.textContent = 'Generate Today\'s Content'; return; }
    renderCards(payload);
    btn.disabled = false;
    icon.textContent = '✦';
    label.textContent = 'Regenerate Content';
    refreshUsedIndicators();
  }, 850);
});

/* ═══════════════════════════════════════════════════════════════════════════
   CARD RENDERING  (ARCHITECT: accepts SP360Bridge payload, not raw cert)
   ═══════════════════════════════════════════════════════════════════════════ */
function renderCards(p) {
  const posts = {
    prestige:     buildPrestige(p),
    disruptor:    buildDisruptor(p),
    practitioner: buildPractitioner(p)
  };

  Object.entries(posts).forEach(([type, data]) => {
    // Cache image prompts
    imagePromptCache[type] = data.imagePrompt;

    // Show content
    document.getElementById('empty-' + type).style.display = 'none';
    const contentEl = document.getElementById('content-' + type);
    contentEl.style.display = 'flex';

    document.getElementById('hook-' + type).textContent = data.hook;
    document.getElementById('body-' + type).textContent = data.body;

    const tagsEl = document.getElementById('tags-' + type);
    tagsEl.innerHTML = data.tags.map(t => `<span class="post-tag">${t}</span>`).join('');

    document.getElementById('vibe-' + type).textContent = '🎨 ' + data.vibe;

    document.getElementById('card-' + type).classList.add('populated');
  });

  // Persist so the page survives a refresh
  savePayload(p.certId, posts);

  refreshUsedIndicators();
}

function resetCards() {
  ['prestige', 'disruptor', 'practitioner'].forEach(type => {
    document.getElementById('empty-' + type).style.display = 'flex';
    document.getElementById('content-' + type).style.display = 'none';
    document.getElementById('card-' + type).classList.remove('populated');
    document.getElementById('used-' + type).classList.remove('on');
    document.getElementById('vibe-' + type).textContent = '';
    resetBtn('copytxt-' + type, '⎘ Copy Caption');
    resetBtn('copyimg-' + type, '🍌 Copy Image Prompt');
  });
  imagePromptCache.prestige = imagePromptCache.disruptor = imagePromptCache.practitioner = null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MASTER TEMPLATES  (all accept SP360Bridge payload shape)
   ─────────────────────────────────────────────────────────────────────────
   Payload keys used:
     p.title, p.provider, p.facultySchool, p.price, p.nextCohort,
     p.industries, p.personas, p.modules, p.outcomes,
     p.hooks.{ ahaMoment, coreProblem, roi, enemyOfProgress,
               practicalShift, visualVibe }
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── TEMPLATE 1: THE PRESTIGE ─────────────────────────────────────────────
   Tone: Exclusive & Academic
   Lead: faculty name → aha_moment
   ────────────────────────────────────────────────────────────────────────── */
function buildPrestige(p) {
  const faculty  = p.hooks.visualVibe ? p.facultySchool : p.provider; // fallback guard
  const rawCert  = allCerts.find(c => c.id === p.certId) || {};
  const name     = rawCert.faculty?.[0]?.name || p.facultySchool;
  const school   = p.facultySchool;
  const outcome1 = p.outcomes?.[0]?.theme || '';
  const outcome2 = p.outcomes?.[1]?.theme || '';
  const persona1 = (p.personas || []).slice(0, 2).join(' and ');
  const cohort   = p.nextCohort === 'On-Demand (start immediately)'
    ? 'Available on-demand — start today.'
    : `Next cohort: ${p.nextCohort}.`;
  const vibe     = (p.hooks.visualVibe || []).slice(0, 2).join(', ');

  // HOOK: faculty attribution + aha moment (Exclusive & Academic tone)
  const hook = `${name} — ${school}:\n\n"${p.hooks.ahaMoment}"`;

  // BODY: academic framing, dual outcomes, price signal
  const body =
    `This is the central insight behind ${p.title} — a ${rawCert.duration || ''} course from ${p.provider}.\n\n` +
    `Designed for ${persona1}.\n\n` +
    `You will leave with:\n` +
    `→ ${outcome1}\n` +
    `→ ${outcome2}\n\n` +
    `${p.hooks.roi}\n\n` +
    `${p.price} · ${cohort}`;

  const tags = buildTags(p, ['#ExecutiveEducation', '#ProfessionalDevelopment', '#HarvardOnline', '#SkillsPro360']);

  // NANO BANANA — Safe-Composition template
  const imagePrompt =
    `/image_generation ${(p.hooks.visualVibe || []).join(', ')}, high-end corporate photography, 8k resolution. COMPOSITION: Wide shot, subject off-center to the right, minimalist negative space on the left for text. TEXT OVERLAY: '${p.title}' rendered in clean, white sans-serif typography in the upper-left quadrant. STYLING: No distorted faces, no garbled text, cinematic lighting.`;

  return { hook, body, tags, vibe, imagePrompt };
}

/* ── TEMPLATE 2: THE DISRUPTOR ────────────────────────────────────────────
   Tone: Urgent & Provocative
   Lead: enemy_of_progress as the opening truth
   ────────────────────────────────────────────────────────────────────────── */
function buildDisruptor(p) {
  const rawCert  = allCerts.find(c => c.id === p.certId) || {};
  const enemy    = p.hooks.enemyOfProgress || 'The status quo holding you back.';
  const industry = (p.industries || ['professionals'])[0].toLowerCase();
  const school   = p.facultySchool;
  const cohort   = p.nextCohort === 'On-Demand (start immediately)'
    ? 'on demand — start now'
    : p.nextCohort;
  const vibe     = (p.hooks.visualVibe || []).slice(1, 3).join(', ');

  // HOOK: enemy of progress as the cold open (Urgent & Provocative tone)
  const hook = `The real enemy of every ${industry} leader:\n\n"${enemy}"`;

  // BODY: validate problem → name the course → deliver the aha
  const body =
    `${p.hooks.coreProblem}\n\n` +
    `That's the trap. And it's costing your organisation more than you think.\n\n` +
    `${p.title} — ${school} — was built as the antidote.\n\n` +
    `The insight that changes everything:\n` +
    `"${p.hooks.ahaMoment}"\n\n` +
    `${rawCert.duration || ''} · ${p.price} · ${cohort}`;

  const tags = buildTags(p, ['#Leadership', '#CareerGrowth', '#StatusQuo', '#SkillsPro360']);

  // NANO BANANA — Safe-Composition template
  const imagePrompt =
    `/image_generation ${(p.hooks.visualVibe || []).join(', ')}, high-end corporate photography, 8k resolution. COMPOSITION: Wide shot, subject off-center to the right, minimalist negative space on the left for text. TEXT OVERLAY: '${p.title}' rendered in clean, white sans-serif typography in the upper-left quadrant. STYLING: No distorted faces, no garbled text, cinematic lighting.`;

  return { hook, body, tags, vibe, imagePrompt };
}

/* ── TEMPLATE 3: THE PRACTITIONER ────────────────────────────────────────
   Tone: Helpful & Direct
   Lead: practical_shift Stop/Start framework
   ────────────────────────────────────────────────────────────────────────── */
function buildPractitioner(p) {
  const rawCert  = allCerts.find(c => c.id === p.certId) || {};
  const ps       = p.hooks.practicalShift || { stop: 'defaulting to old habits', start: 'building this capability deliberately' };
  const industry = (p.industries || ['this field'])[0];
  const modules  = (p.modules || []).slice(0, 3);
  const cohort   = p.nextCohort === 'On-Demand (start immediately)'
    ? 'Start today — on demand'
    : `Cohort: ${p.nextCohort}`;
  const vibe     = (p.hooks.visualVibe || []).slice(2, 4).join(', ');

  // HOOK: Stop/Start as the direct opener (Helpful & Direct tone)
  const hook =
    `For ${industry} professionals — the two-line shift:\n\n` +
    `✗ STOP: ${ps.stop}\n` +
    `✓ START: ${ps.start}`;

  // BODY: what you'll cover + what you'll walk away with
  const body =
    (modules.length
      ? `${p.title} gives you the framework to make that shift real.\n\n` +
        `What's covered:\n` + modules.map(m => `  · ${m}`).join('\n') + '\n\n'
      : `${p.title} gives you the framework to make that shift real.\n\n`) +
    `The payoff: ${p.hooks.roi}\n\n` +
    `${p.price} · ${cohort} · ${p.provider}`;

  const tags = buildTags(p, ['#ActionableInsights', '#CareerDevelopment', '#SkillsGap', '#SkillsPro360']);

  // NANO BANANA — Safe-Composition template
  const imagePrompt =
    `/image_generation ${(p.hooks.visualVibe || []).join(', ')}, high-end corporate photography, 8k resolution. COMPOSITION: Wide shot, subject off-center to the right, minimalist negative space on the left for text. TEXT OVERLAY: '${p.title}' rendered in clean, white sans-serif typography in the upper-left quadrant. STYLING: No distorted faces, no garbled text, cinematic lighting.`;

  return { hook, body, tags, vibe, imagePrompt };
}

/* ── REVIEWER NOTE ────────────────────────────────────────────────────────
   DOM field mapping verified against index.html card structure:
     hook  → #hook-{type}   (.post-hook)   bold serif, textContent
     body  → #body-{type}   (.post-body)   pre-wrap sans, textContent
     tags  → #tags-{type}   (.post-tags)   span.post-tag pills, innerHTML
     vibe  → #vibe-{type}   (.footer-vibe) 🎨 prefix appended in renderCards
     imagePrompt → imagePromptCache[type]  copied by 🍌 button
   All fields are strings. pre-wrap on .post-body renders \n as line breaks.
   ─────────────────────────────────────────────────────────────────────────── */

function buildTags(p, defaults) {
  // accepts both raw cert and bridge payload (both have .industries)
  const industry = (p.industries || []).slice(0, 1).map(i => '#' + i.replace(/[\s&]/g, ''));
  return [...industry, ...defaults].slice(0, 5);
}

/* ═══════════════════════════════════════════════════════════════════════════
   COPY ACTIONS
   ═══════════════════════════════════════════════════════════════════════════ */
function copyText(type) {
  const hook = document.getElementById('hook-' + type)?.textContent || '';
  const body = document.getElementById('body-' + type)?.textContent || '';
  const tags = [...document.getElementById('tags-' + type).querySelectorAll('.post-tag')]
    .map(t => t.textContent).join(' ');
  const full = [hook, body, tags].filter(Boolean).join('\n\n');

  navigator.clipboard.writeText(full).then(() => {
    flashBtn('copytxt-' + type, '✓ Copied!');
    if (selectedCert) {
      markUsed(selectedCert.id, type);
      refreshUsedIndicators();
    }
  });
}

function copyImage(type) {
  const prompt = imagePromptCache[type];
  if (!prompt) return;

  navigator.clipboard.writeText(prompt).then(() => {
    flashBtn('copyimg-' + type, '✓ Prompt Copied!');
    if (selectedCert) {
      markUsed(selectedCert.id, type);
      refreshUsedIndicators();
    }
  });
}

function flashBtn(id, successText) {
  const btn = document.getElementById(id);
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = successText;
  btn.classList.add('success');
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('success');
  }, 2200);
}

function resetBtn(id, label) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.textContent = label;
  btn.classList.remove('success');
}

/* ── Init ───────────────────────────────────────────────────────────────── */
loadKB();
