
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
let stylesKB       = {};   // keyed by profile id — populated from styles_kb.json
let activeStyleId  = null; // currently selected style profile id

// Stored image prompts for copy-image
const imagePromptCache = {};

/* ═══════════════════════════════════════════════════════════════════════════
   LOCALSTORAGE — Keys
   ═══════════════════════════════════════════════════════════════════════════ */
const LS_KEY         = 'sp360_used_posts';
const LS_PAYLOAD_KEY = 'sp360_current_payload';
const LS_HISTORY_KEY = 'sp360_history';

/* ── Payload persistence ─────────────────────────────────────────────────── */
function savePayload(certId, posts, styleProfileId) {
  try {
    const data = { certId, posts, styleProfileId: styleProfileId || null, savedAt: new Date().toISOString() };
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

    // Storyboard: build a minimal payload from the restored cert
    const savedFlavor    = getActiveFlavor();
    const savedProfileId = FLAVOR_TO_PROFILE[savedFlavor];
    const savedProfile   = stylesKB[savedProfileId] || null;
    const savedPayload = {
      certId:        cert.id,
      title:         cert.title,
      provider:      cert.provider,
      facultySchool: cert.faculty_school,
      price:         cert.price_usd,
      nextCohort:    cert.next_cohort,
      industries:    cert.industries,
      personas:      cert.target_personas,
      modules:       cert.syllabus,
      outcomes:      cert.outcomes,
      hooks: {
        ahaMoment:   cert.aha_moment,
        coreProblem: cert.core_problem,
      },
      styleInstructions: savedProfile ? {
        profileId: savedProfile.id,
        flavor:    savedFlavor,
        tone:      savedProfile.tone,
        visualDna: savedProfile.visual_dna || null,
      } : { flavor: savedFlavor, visualDna: null },
    };
    renderStoryboard(savedPayload);
  } catch (e) { console.warn('loadSavedPayload failed', e); }
}

function restoreCards(posts) {
  Object.entries(posts).forEach(([type, data]) => {
    imagePromptCache[type] = data.imagePrompt;

    document.getElementById('empty-' + type).style.display = 'none';
    const contentEl = document.getElementById('content-' + type);
    contentEl.style.display = 'flex';

    document.getElementById('hook-' + type).textContent = data.hook;
    setBodyWithMarker(document.getElementById('body-' + type), data.body);

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
  document.querySelector('.control-panel').classList.remove('cert-selected');
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

      // Render storyboard with a minimal payload from the cert
      const histFlavor    = getActiveFlavor();
      const histProfileId = FLAVOR_TO_PROFILE[histFlavor];
      const histProfile   = stylesKB[histProfileId] || null;
      renderStoryboard({
        certId:        cert.id,
        title:         cert.title,
        provider:      cert.provider,
        facultySchool: cert.faculty_school,
        price:         cert.price_usd,
        nextCohort:    cert.next_cohort,
        industries:    cert.industries,
        personas:      cert.target_personas,
        modules:       cert.syllabus,
        outcomes:      cert.outcomes,
        hooks: { ahaMoment: cert.aha_moment, coreProblem: cert.core_problem },
        styleInstructions: histProfile
          ? { profileId: histProfile.id, flavor: histFlavor, tone: histProfile.tone, visualDna: histProfile.visual_dna || null }
          : { flavor: histFlavor, visualDna: null },
      });
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

  /** Returns a structured payload ready for /agents generation.
   *  Shape: { input1_certFacts, input2_brandStyle, input3_audiencePersona }
   *  Matches the IQ Synthesis Logic defined in agents/writer_system_prompt.md */
  getPayload() {
    if (!this._cert) return null;
    const c = this._cert;

    // ── Input 1: Cert Facts ───────────────────────────────────────────────────
    const certFacts = {
      certId:        c.id,
      title:         c.title,
      provider:      c.provider,
      facultySchool: c.faculty_school,
      price:         c.price_usd || c.price_aud,
      currency:      c.provider === 'Maxme' ? 'AUD' : 'USD',
      nextCohort:    c.next_cohort,
      duration:      c.duration,
      industries:    c.industries,
      syllabus:      c.syllabus_modules,
      outcomes:      c.learning_outcomes,
      hooks: {
        coreProblem:     c.core_problem,
        ahaMoment:       c.aha_moment,
        roi:             c.roi,
        enemyOfProgress: c.enemy_of_progress,
        practicalShift:  c.practical_shift,
        visualVibe:      c.visual_vibe
      }
    };

    // ── Input 2: Brand Style ──────────────────────────────────────────────────
    // Resolve the active style profile. If Maxme, flag maxme_exception for agent.
    const profile = stylesKB[activeStyleId] || null;
    const brandStyle = profile ? {
      profileId:      profile.id,
      label:          profile.label,
      tone:           profile.tone,
      vocabulary:     profile.vocabulary,
      hookRules:      profile.hook_rules,
      narrativeFlow:  profile.narrative_flow,
      formatting:     profile.formatting_rules,
      maxmeException: (c.provider === 'Maxme' && profile.maxme_exception)
                        ? profile.maxme_exception
                        : null,
      fullTemplates:  profile.full_post_template
    } : null;

    // ── Input 3: Audience Persona ─────────────────────────────────────────────
    const audiencePersona = {
      platform:      'LinkedIn',
      level:         'Professional / Executive',
      personas:      c.target_personas || [],
      industries:    c.industries      || [],
      contextNote:   'Reader is already inside the problem this course solves. ' +
                     'Write to their level of authority. Name their situation precisely.'
    };

    return {
      input1_certFacts:       certFacts,
      input2_brandStyle:      brandStyle,
      input3_audiencePersona: audiencePersona,
      activeStyleId,
      _readyAt: new Date().toISOString()
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
    // Load KB, pre-built library, and styles KB in parallel — library/styles failures are non-fatal
    const [certsRes, libRes, stylesRes] = await Promise.all([
      fetch('data/certs_kb.json'),
      fetch('data/content_library.json').catch(() => null),
      fetch('data/styles_kb.json').catch(() => null)
    ]);

    const kb = await certsRes.json();
    allCerts = kb.certifications || [];

    if (libRes && libRes.ok) {
      const lib = await libRes.json();
      (lib.entries || []).forEach(e => { contentLibrary[e.id] = e; });
      console.log(`📚 Content library loaded — ${Object.keys(contentLibrary).length} entries ready.`);
    }

    if (stylesRes && stylesRes.ok) {
      const styles = await stylesRes.json();
      // Index all style_profiles by id for O(1) lookup
      (styles.style_profiles || []).forEach(p => { stylesKB[p.id] = p; });
      // Default active style to LSE_EXED_GOLD_2025 if present, else first available
      const defaultId = 'LSE_EXED_GOLD_2025';
      activeStyleId = stylesKB[defaultId] ? defaultId : Object.keys(stylesKB)[0] || null;
      console.log(`🎨 Styles KB loaded — ${Object.keys(stylesKB).length} profiles. Active: ${activeStyleId}`);
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
  document.querySelector('.control-panel').classList.add('cert-selected');

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
  document.querySelector('.control-panel').classList.remove('cert-selected');
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

    // Storyboard still needs a payload — build a minimal one from selectedCert + active flavor
    const fastFlavor    = getActiveFlavor();
    const fastProfileId = FLAVOR_TO_PROFILE[fastFlavor];
    const fastProfile   = stylesKB[fastProfileId] || null;
    const fastCert      = selectedCert;
    const fastPayload = {
      certId:        fastCert.id,
      title:         fastCert.title,
      provider:      fastCert.provider,
      facultySchool: fastCert.faculty_school,
      price:         fastCert.price_usd,
      nextCohort:    fastCert.next_cohort,
      industries:    fastCert.industries,
      personas:      fastCert.target_personas,
      modules:       fastCert.syllabus,
      outcomes:      fastCert.outcomes,
      hooks: {
        ahaMoment:   fastCert.aha_moment,
        coreProblem: fastCert.core_problem,
      },
      styleInstructions: fastProfile ? {
        profileId: fastProfile.id,
        flavor:    fastFlavor,
        tone:      fastProfile.tone,
        visualDna: fastProfile.visual_dna || null,
      } : { flavor: fastFlavor, visualDna: null },
    };
    renderStoryboard(fastPayload);
    return;
  }

  // ── Fallback: Agent Bridge + local template builders ─────────────────────
  // Used when running locally with Claude Code and content_library.json is
  // absent or the selected cert has no pre-built entry.
  btn.disabled = true;
  icon.innerHTML = '<span class="spinner"></span>';
  label.textContent = 'Generating…';

  setTimeout(() => {
    // ① Read selected brand flavor from the UI selector
    const selectedFlavor = getActiveFlavor();
    const profileId      = FLAVOR_TO_PROFILE[selectedFlavor];
    const profile        = stylesKB[profileId] || null;

    // ② Pull the full 3-input payload from the bridge
    const rawPayload = window.SP360Bridge.getPayload();
    if (!rawPayload) {
      btn.disabled = false;
      icon.textContent = '✦';
      label.textContent = 'Generate Today\'s Content';
      return;
    }

    const cf = rawPayload.input1_certFacts;
    const ap = rawPayload.input3_audiencePersona;

    // ③ Build styleInstructions — vocabulary, tone, hook rules, and visual DNA from the selected profile
    const styleInstructions = profile ? {
      profileId:      profile.id,
      flavor:         selectedFlavor,
      tone:           profile.tone,
      vocabulary:     profile.vocabulary,
      hookRules:      profile.hook_rules,
      narrativeFlow:  profile.narrative_flow,
      formatting:     profile.formatting_rules,
      visualDna:      profile.visual_dna || null,
      maxmeException: (cf.provider === 'Maxme' && profile.maxme_exception)
                        ? profile.maxme_exception
                        : null,
      // ④ Merged system prompt — ready for any AI agent that reads this payload
      systemPrompt:   buildSystemPrompt(cf, profile, ap)
    } : null;

    // ⑤ Flatten to the shape template builders expect, injecting styleInstructions
    const payload = {
      certId:        cf.certId,
      title:         cf.title,
      provider:      cf.provider,
      facultySchool: cf.facultySchool,
      price:         cf.price,
      nextCohort:    cf.nextCohort,
      industries:    cf.industries,
      personas:      ap.personas,
      modules:       cf.syllabus,
      outcomes:      cf.outcomes,
      hooks:         cf.hooks,
      styleInstructions
    };

    renderCards(payload);
    btn.disabled = false;
    icon.textContent = '✦';
    label.textContent = 'Regenerate Content';
    refreshUsedIndicators();
  }, 850);
});

/* ═══════════════════════════════════════════════════════════════════════════
   SYSTEM PROMPT BUILDER
   Merges cert facts + style profile rules into an injectable instruction
   block for the Writer Agent (agents/writer_system_prompt.md).
   Exposed via styleInstructions.systemPrompt in SP360Bridge.getPayload().
   ═══════════════════════════════════════════════════════════════════════════ */
function buildSystemPrompt(certFacts, profile, audiencePersona) {
  if (!profile) return null;

  const isMaxme    = certFacts.provider === 'Maxme';
  const maxmeBlend = isMaxme && profile.maxme_exception;
  const vocab      = profile.vocabulary || {};
  const hooks      = profile.hook_rules  || {};
  const flow       = profile.narrative_flow || {};
  const fmt        = profile.formatting_rules || {};
  const tone       = profile.tone || {};

  const anchors    = (vocab.high_gravity_anchors || []).slice(0, 6).join(', ');
  const banned     = (vocab.words_to_avoid       || []).join(', ');
  const keyPhrases = (vocab.key_phrases          || []).slice(0, 5).join(' / ');

  const disruptorRule   = maxmeBlend
    ? (profile.maxme_exception.maxme_disruptor_hook_formula || '')
    : (hooks.disruptor_hook?.formula || hooks.disruptor_hook?.formula_question || '');
  const prestigeRule    = maxmeBlend
    ? (profile.maxme_exception.maxme_prestige_hook_formula || '')
    : (hooks.prestige_hook?.formula || '');
  const practitionerRule = hooks.practitioner_hook?.formula || '';

  const narrativeStructure = flow.primary_structure || '';
  const emojiMax   = fmt.emoji_policy?.maximum ?? 2;
  const bulletPfx  = fmt.bullet_prefix || '→';
  const bulletCnt  = fmt.bullet_count  || '3';
  const ctaFormat  = typeof fmt.cta_format === 'string'
    ? fmt.cta_format
    : (fmt.cta_format?.options?.[0] || '');

  return `
STYLE PROFILE: ${profile.label} (${profile.id})
COURSE: ${certFacts.title} | ${certFacts.provider}
AUDIENCE: ${(audiencePersona.personas || []).join(', ') || 'LinkedIn Professional / Executive'}

── TONE ──────────────────────────────────────────────────────────────────────
Primary:   ${tone.primary || ''}
Secondary: ${tone.secondary || ''}
Avoid:     ${tone.not || ''}
${maxmeBlend ? '\nMAXME BLEND ACTIVE: Apply human-centric empathy rules. Do not sound institutional or cold.\n' : ''}
── VOCABULARY ────────────────────────────────────────────────────────────────
Anchor words (use ≥2 per post, at sentence anchors): ${anchors}
Key phrases: ${keyPhrases}
BANNED (hard ban — rewrite any sentence that contains these): ${banned}

── HOOK RULES ────────────────────────────────────────────────────────────────
PRESTIGE hook formula:     ${prestigeRule}
DISRUPTOR hook formula:    ${disruptorRule}
PRACTITIONER hook formula: ${practitionerRule}

── NARRATIVE FLOW ────────────────────────────────────────────────────────────
Structure: ${narrativeStructure}

── FORMATTING ────────────────────────────────────────────────────────────────
Bullet prefix: ${bulletPfx}  |  Bullets per post: ${bulletCnt}  |  Emoji max: ${emojiMax} (opening/CTA only)
CTA format: ${ctaFormat}
Currency: ${certFacts.provider === 'Maxme' ? 'AUD' : 'USD'}  |  Cohort: ${certFacts.nextCohort}  |  Price: ${certFacts.price}

── CONTEXTUAL ADAPTATION ─────────────────────────────────────────────────────
Do not apply the style generically. The hook must be native to the course domain.
Course domain signals:
  core_problem:     ${certFacts.hooks?.coreProblem     || ''}
  aha_moment:       ${certFacts.hooks?.ahaMoment       || ''}
  enemy_of_progress: ${certFacts.hooks?.enemyOfProgress || ''}
  practical_shift:  ${JSON.stringify(certFacts.hooks?.practicalShift || {})}

Merge these domain signals with the hook formulas above.
Do not use a generic version of the hook — name the specific force, failure mode, or insight.
`.trim();
}

/* ═══════════════════════════════════════════════════════════════════════════
   CARD RENDERING  (ARCHITECT: accepts SP360Bridge payload, not raw cert)
   ═══════════════════════════════════════════════════════════════════════════ */
/* ── Card intent descriptions — per-flavor, injected on render ──────────────
   Each entry: [prestige, disruptor, practitioner]                           */
const CARD_INTENTS = {
  harvard_standard: [
    'Authority-building post. Leads with faculty name, institution, and the course\'s core aha moment.',
    'Pattern-interrupting post. Opens with the enemy of progress. Challenges the status quo.',
    'Stop/Start framework post. Concrete and actionable. Drives saves and shares.',
    'Faculty-authority carousel. 7 slides mapping aha moment → framework → outcomes → CTA.'
  ],
  lse_macro: [
    'Peer-Network Prestige post. Signals cohort calibre and shared macro context — not institutional name-drop.',
    'Macro Challenge post. Names the geopolitical or regulatory force reshaping the reader\'s domain.',
    'Strategic Foresight post. Surfaces the analytical gap most senior leaders carry into the next decade.',
    'Macro-governance carousel. 7 slides mapping geopolitical force → strategic stakes → capabilities → Apply.'
  ],
  mit_innovation: [
    'Frontier Insight post. Opens on the second-order problem competitors aren\'t solving yet.',
    'Named Problem post. Identifies the specific architectural or systems failure costing competitive ground.',
    'Systematic Capability post. Diagnoses the structural gap and builds the framework to close it.',
    'Systems-precision carousel. 7 slides mapping root cause → systemic fix → technical build → Deploy.'
  ],
  stanford_bridge: [
    'Research Prestige post. Leads with a cross-disciplinary finding — insight shared freely, programme deepens it.',
    'Intriguing Question post. Opens on a counterintuitive scenario grounded in Stanford research.',
    'Evidence & Practice post. Reframes the reader\'s own question with a research-backed lens.',
    'Research-curiosity carousel. 7 slides mapping question → finding → Stanford method → Join community.'
  ],
};

/* ── Card subtitle meanings — default and per-flavor overrides ─────────────
   Each entry: [prestige, disruptor, practitioner]                           */
const CARD_SUBTITLES = {
  harvard_standard: ['Authority & Credibility',    'Challenge & Provocation',      'Action & Application',   'Harvard Standard · 7 Slides' ],
  lse_macro:        ['Peer-Network · Pedigree',    'Macro Challenge · Governance', 'Strategic Foresight',    'LSE Macro · 7 Slides'        ],
  mit_innovation:   ['Frontier Insight · Systems', 'Systemic Fix · Architecture',  'Capability Gap · Scale', 'MIT Innovation · 7 Slides'   ],
  stanford_bridge:  ['Research Depth · Curiosity', 'Future Scenario · Question',   'Evidence & Practice',    'Stanford Online · 7 Slides'  ],
};

function renderCards(p) {
  const posts = {
    prestige:     buildPrestige(p),
    disruptor:    buildDisruptor(p),
    practitioner: buildPractitioner(p)
  };

  // Resolve subtitles and intent descriptions for the active flavor.
  // typeOrder covers only the 3 posts built here; storyboard subtitle/intent
  // are injected separately inside renderStoryboard() to keep concerns clean.
  const flavor    = p.styleInstructions?.flavor || 'harvard_standard';
  const subtitles = CARD_SUBTITLES[flavor] || CARD_SUBTITLES.harvard_standard;
  const intents   = CARD_INTENTS[flavor]   || CARD_INTENTS.harvard_standard;
  const aesthetic = p.styleInstructions?.visualDna?.aesthetic || '';
  const typeOrder = ['prestige', 'disruptor', 'practitioner'];

  Object.entries(posts).forEach(([type, data]) => {
    // Cache image prompts
    imagePromptCache[type] = data.imagePrompt;

    const idx = typeOrder.indexOf(type);

    // Inject subtitle meaning (idx is always 0-2 for the 3 post types)
    const subEl = document.getElementById('subtitle-' + type);
    if (subEl && idx >= 0) subEl.textContent = subtitles[idx];

    // Inject intent description
    const intentEl = document.getElementById('intent-' + type);
    if (intentEl && idx >= 0) intentEl.textContent = intents[idx];

    // Inject card-metadata — visual DNA aesthetic label (e.g. BRUTALIST / EDITORIAL)
    const metaEl = document.getElementById('meta-' + type);
    if (metaEl) metaEl.textContent = aesthetic;

    // Show content
    document.getElementById('empty-' + type).style.display = 'none';
    const contentEl = document.getElementById('content-' + type);
    contentEl.style.display = 'flex';

    document.getElementById('hook-' + type).textContent = data.hook;
    setBodyWithMarker(document.getElementById('body-' + type), data.body);

    const tagsEl = document.getElementById('tags-' + type);
    tagsEl.innerHTML = data.tags.map(t => `<span class="post-tag">${t}</span>`).join('');

    document.getElementById('vibe-' + type).textContent = '🎨 ' + data.vibe;

    document.getElementById('card-' + type).classList.add('populated');
  });

  // Render 4th card: The Storyboard
  renderStoryboard(p);

  // Persist so the page survives a refresh
  savePayload(p.certId, posts, p.styleInstructions?.profileId || null);

  refreshUsedIndicators();
}

function resetCards() {
  ['prestige', 'disruptor', 'practitioner'].forEach(type => {
    document.getElementById('empty-' + type).style.display = 'flex';
    document.getElementById('content-' + type).style.display = 'none';
    document.getElementById('card-' + type).classList.remove('populated');
    document.getElementById('used-' + type).classList.remove('on');
    document.getElementById('vibe-' + type).textContent = '';
    const metaEl = document.getElementById('meta-' + type);
    if (metaEl) metaEl.textContent = '';
    resetBtn('copytxt-' + type, '⎘ Copy Caption');
    resetBtn('copyimg-' + type, '🍌 Copy Image Prompt');
  });
  imagePromptCache.prestige = imagePromptCache.disruptor = imagePromptCache.practitioner = imagePromptCache.storyboard = null;

  // Reset storyboard card to empty state
  document.getElementById('card-storyboard').classList.remove('populated');
  document.getElementById('empty-storyboard').style.display  = 'flex';
  document.getElementById('storyboard-slides').style.display = 'none';
  document.getElementById('storyboard-slides').innerHTML     = '';
  document.getElementById('vibe-storyboard').textContent     = '';
  document.getElementById('storyboard-meta').textContent     = '';
  document.getElementById('subtitle-storyboard').textContent = '7-Slide Carousel';
  resetBtn('copytxt-storyboard', '⎘ Copy All Slides');
  resetBtn('copyimg-storyboard', '🍌 Copy Background Prompt');
  const tipEl    = document.getElementById('design-tip-storyboard');
  if (tipEl) tipEl.remove();
  const selectEl = document.getElementById('slide-prompt-select');
  if (selectEl) selectEl.remove();
  imagePromptCache['storyboardSlides'] = null;
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
   Tone: Exclusive & Academic (default) — overridden by styleInstructions
   Lead: faculty name → aha_moment (default) or style hook rule
   ────────────────────────────────────────────────────────────────────────── */
function buildPrestige(p) {
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

  const si      = p.styleInstructions;
  const flavor  = si?.flavor || 'harvard_standard';
  const anchors = si ? (si.vocabulary?.high_gravity_anchors || []).slice(0, 3) : [];

  // ── HOOK: style-aware ────────────────────────────────────────────────────
  let hook;
  if (si?.maxmeException) {
    // Maxme blend: shared-experience frame
    hook = `${p.hooks.ahaMoment}`;
  } else if (flavor === 'lse_macro') {
    // LSE Gold: peer-network invitation — who is in the room
    hook = `${p.title} brings together senior practitioners navigating the same ${(p.industries || ['sector'])[0].toLowerCase()} inflection point — not as observers, but as the leaders responsible for the decisions ahead.`;
  } else if (flavor === 'mit_innovation') {
    // MIT: frontier insight — second-order problem
    hook = `The leaders building competitive advantage through technology in ${p.title} are solving the infrastructure and governance challenge — not the tooling question.`;
  } else if (flavor === 'stanford_bridge') {
    // Stanford: cross-disciplinary research insight
    hook = `At the intersection of research and practice, ${p.facultySchool}'s work on this challenge reveals something most ${(p.industries || ['field'])[0].toLowerCase()} leaders haven't seen framed this precisely:\n\n"${p.hooks.ahaMoment}"`;
  } else {
    // Default Harvard Standard: faculty attribution + aha moment
    hook = `${name} — ${school}:\n\n"${p.hooks.ahaMoment}"`;
  }

  // ── BODY: style-aware ────────────────────────────────────────────────────
  const anchorLine = anchors.length ? `${anchors[0]} insight. ${anchors[1] || 'Evidence-based'} approach.\n\n` : '';
  const body =
    `${anchorLine}` +
    `This is the insight at the core of ${p.title} — a ${rawCert.duration || ''} programme from ${p.provider}.\n\n` +
    `Designed for ${persona1}.\n\n` +
    `You will leave with:\n` +
    `→ ${outcome1}\n` +
    `→ ${outcome2}\n\n` +
    `${p.hooks.roi}\n\n` +
    `${p.price} · ${cohort}`;

  const providerTag = p.provider === 'Maxme' ? '#Maxme' : p.provider === 'Harvard Online' ? '#HarvardOnline' : '#MITSloan';
  const tags = buildTags(p, ['#ExecutiveEducation', '#ProfessionalDevelopment', providerTag, '#SkillsPro360']);

  const imagePrompt = buildImagePrompt(p, 'prestige');

  return { hook, body, tags, vibe, imagePrompt };
}

/* ── TEMPLATE 2: THE DISRUPTOR ────────────────────────────────────────────
   Tone: Urgent & Provocative (default) — overridden by styleInstructions
   Lead: enemy_of_progress (default) or style-specific Macro Challenge / Problem
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

  const si      = p.styleInstructions;
  const flavor  = si?.flavor || 'harvard_standard';
  const anchors = si ? (si.vocabulary?.high_gravity_anchors || []).slice(0, 3) : [];

  // ── HOOK: style-aware ────────────────────────────────────────────────────
  let hook;
  if (si?.maxmeException) {
    // Maxme blend: Micro Truth — quiet behavioural observation, not macro force
    hook = `${p.hooks.coreProblem}`;
  } else if (flavor === 'lse_macro') {
    // LSE Gold: Macro Challenge — geopolitical/regulatory/macro-economic force
    hook = `The ${(si?.narrativeFlow?.primary_structure || 'structural shift')} reshaping ${industry} is not a cycle. The ${anchors[0] || 'governance'} frameworks most organisations built on previous assumptions are underbuilt for the environment ahead.`;
  } else if (flavor === 'mit_innovation') {
    // MIT: Named Problem — specific technical or organisational failure mode
    hook = `Most ${industry} organisations are losing ${anchors[0] || 'competitive'} ground not because of the technology they lack — but because the ${anchors[1] || 'systematic'} architecture to deploy it was never built.`;
  } else if (flavor === 'stanford_bridge') {
    // Stanford: Intriguing question or Future Scenario
    hook = `What if the biggest barrier to progress in ${industry} isn't resources or strategy — but the mental models inherited from the last decade's successes? The research says this is already the case.`;
  } else {
    // Default Harvard Standard: enemy of progress as cold open
    hook = `The real enemy of every ${industry} leader:\n\n"${enemy}"`;
  }

  // ── BODY: style-aware narrative flow ────────────────────────────────────
  const anchorInsert = anchors.length
    ? `The ${anchors[0] || 'systematic'} root cause is structural — not incidental.\n\n`
    : '';

  const body =
    `${p.hooks.coreProblem}\n\n` +
    `${anchorInsert}` +
    `${p.title} — ${school} — was built as the antidote.\n\n` +
    `The insight that changes the approach:\n` +
    `"${p.hooks.ahaMoment}"\n\n` +
    `${rawCert.duration || ''} · ${p.price} · ${cohort}`;

  const tags = buildTags(p, ['#Leadership', '#CareerGrowth', '#StrategicThinking', '#SkillsPro360']);

  const imagePrompt = buildImagePrompt(p, 'disruptor');

  return { hook, body, tags, vibe, imagePrompt };
}

/* ── TEMPLATE 3: THE PRACTITIONER ────────────────────────────────────────
   Tone: Helpful & Direct (default) — overridden by styleInstructions
   Lead: Stop/Start framework (default) or style-specific capability gap
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

  const si      = p.styleInstructions;
  const flavor  = si?.flavor || 'harvard_standard';
  const anchors = si ? (si.vocabulary?.high_gravity_anchors || []).slice(0, 3) : [];
  const bulletP = si?.formatting?.bullet_prefix || '→';

  // ── HOOK: style-aware ────────────────────────────────────────────────────
  let hook;
  if (si?.maxmeException) {
    // Maxme blend: diagnostic observation — reader recognises it from their team
    hook = `${p.hooks.coreProblem}\n\nThis isn't a skill gap. It's a ${anchors[0] || 'foundational'} design gap — and it's fixable.`;
  } else if (flavor === 'lse_macro') {
    // LSE Gold: strategic foresight gap — what most senior leaders lack
    hook = `Most ${industry} leaders have the tools to model the outcome. Fewer have the ${anchors[0] || 'institutional'} framework to anticipate the upstream cause before it becomes a binding constraint.`;
  } else if (flavor === 'mit_innovation') {
    // MIT: systematic capability gap — structural root cause
    hook = `Most ${industry} teams lack a ${anchors[0] || 'systematic'} approach to ${p.title.toLowerCase()} — not because of budget, but because the ${anchors[1] || 'architectural'} foundation was never built.`;
  } else if (flavor === 'stanford_bridge') {
    // Stanford: reader's practical question, reframed with research
    hook = `How do you build ${industry} capability that outlasts a single programme? Research-backed insights from ${p.facultySchool} reframe this as a ${anchors[0] || 'foundational'} design question — and the answer contradicts most standard playbooks.`;
  } else {
    // Default Harvard Standard: Stop/Start
    hook =
      `For ${industry} professionals — the two-line shift:\n\n` +
      `✗ STOP: ${ps.stop}\n` +
      `✓ START: ${ps.start}`;
  }

  // ── BODY: style-aware ────────────────────────────────────────────────────
  const outcomeLines = (p.outcomes || []).slice(0, 3)
    .map(o => `${bulletP} ${o.theme || o}`)
    .join('\n');

  const body =
    (modules.length
      ? `${p.title} gives you the ${anchors[0] || 'systematic'} framework to make that shift real.\n\n` +
        `What's covered:\n` + modules.map(m => `  · ${m}`).join('\n') + '\n\n'
      : `${p.title} gives you the ${anchors[0] || 'systematic'} framework to make that shift real.\n\n`) +
    (outcomeLines ? `You will build:\n${outcomeLines}\n\n` : '') +
    `The payoff: ${p.hooks.roi}\n\n` +
    `${p.price} · ${cohort} · ${p.provider}`;

  const tags = buildTags(p, ['#ActionableInsights', '#CareerDevelopment', '#SkillsGap', '#SkillsPro360']);

  const imagePrompt = buildImagePrompt(p, 'practitioner');

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

/* ── Image Prompt Builder ────────────────────────────────────────────────────
   Combines Course Subject + Visual DNA from the active style profile to build
   a single, professional background prompt for Nano Banana 2.              */
function buildImagePrompt(p, postType) {
  const si      = p.styleInstructions;
  const dna     = si?.visualDna;
  const subject = p.title || 'executive education';
  const vibe    = (p.hooks?.visualVibe || []).join(', ');

  if (dna) {
    const keywords = (dna.nano_banana_keywords || []).join(', ');
    const mood     = dna.mood     || '';
    const palette  = dna.palette  || '';
    const comp     = dna.composition_style || '';
    return (
      `/image_generation SUBJECT: ${subject}. ` +
      `AESTHETIC: ${dna.aesthetic}. ` +
      `PALETTE: ${palette}. ` +
      `COMPOSITION: ${comp}. ` +
      `MOOD: ${mood}. ` +
      `VISUAL KEYWORDS: ${keywords}${vibe ? ', ' + vibe : ''}. ` +
      `8K resolution. Background only — no text overlay, no faces, no garbled elements. ` +
      `Designed as a LinkedIn carousel background for a ${postType} post about ${subject}.`
    );
  }

  // Fallback: original safe-composition template
  return (
    `/image_generation ${vibe ? vibe + ', ' : ''}high-end corporate photography, 8k resolution. ` +
    `COMPOSITION: Wide shot, subject off-center to the right, minimalist negative space on the left for text. ` +
    `TEXT OVERLAY: '${subject}' rendered in clean, white sans-serif typography in the upper-left quadrant. ` +
    `STYLING: No distorted faces, no garbled text, cinematic lighting.`
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   STORYBOARD — 7-Slide Carousel
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Strategic intent per flavor — 7 slides each ────────────────────────── */
const STORYBOARD_STRATEGY = {
  harvard_standard: [
    { label: 'The Hook',      directive: 'Open with the faculty name and their most provocative insight. One sentence. Make the reader stop.' },
    { label: 'The Problem',   directive: 'State the core problem this course solves. Name it precisely — no vague generalisations.' },
    { label: 'The Aha',       directive: 'The central insight that reframes how the reader sees the problem. Quote or paraphrase directly.' },
    { label: 'The Framework', directive: 'Name the academic framework or methodology. 3 pillars, each in 5 words or fewer.' },
    { label: 'The Outcomes',  directive: 'Three specific things participants will be able to do after this course.' },
    { label: 'The Network',   directive: 'Who else is in the room. Cohort calibre, industries, seniority level — peer value signal.' },
    { label: 'The CTA',       directive: 'Price anchor + cohort date + one direct action. No fluff. No urgency tricks.' },
  ],
  lse_macro: [
    { label: 'The Macro Force',      directive: 'Name the geopolitical, regulatory, or economic force reshaping the reader\'s domain. One sentence.' },
    { label: 'The Strategic Stakes', directive: 'Translate the macro force into a specific decision or liability for the reader\'s role.' },
    { label: 'The Governance Gap',   directive: 'Name what most organisations are missing: the institutional framework that doesn\'t yet exist for this environment.' },
    { label: 'The LSE Approach',     directive: 'How LSE\'s research and faculty approach this challenge differently from conventional strategy frameworks.' },
    { label: 'The Capabilities',     directive: 'Three specific capabilities participants build — framed as governance, foresight, and institutional literacy.' },
    { label: 'The Cohort',           directive: 'Peer-network invitation. Name the seniority, sectors, and shared challenge of the cohort.' },
    { label: 'Applications Open',    directive: 'Formal CTA — "Applications are open." Price, cohort date, link. No urgency. Selective tone.' },
  ],
  mit_innovation: [
    { label: 'The Problem',          directive: 'Name the specific architectural or systems failure costing competitive ground. Root cause, not symptom.' },
    { label: 'The Root Cause',       directive: 'Why the problem is structural — not a tooling gap, not a talent gap, but a systems design gap.' },
    { label: 'The Systemic Fix',     directive: 'Introduce the framework or architectural approach that addresses the root condition.' },
    { label: 'The Technical Build',  directive: 'Three specific capabilities or frameworks built in the programme — scalable, deployable, measurable.' },
    { label: 'The Frontier Signal',  directive: 'What leaders who complete this programme are solving that competitors aren\'t watching yet.' },
    { label: 'The Cohort Edge',      directive: 'The cohort is the competitive advantage. Name the technical seniority and frontier context of peers.' },
    { label: 'The CTA',              directive: 'Direct, technical CTA. Price, cohort date, and one precise action verb. No softening.' },
  ],
  stanford_bridge: [
    { label: 'The Question',         directive: 'Open with a counterintuitive question grounded in Stanford research. End on an open beat.' },
    { label: 'The Research Lens',    directive: 'Name the interdisciplinary intersection and what Stanford\'s work in this area actually shows.' },
    { label: 'The Counterintuitive', directive: 'The finding that contradicts conventional wisdom. Specific, evidential, surprising.' },
    { label: 'The Stanford Method',  directive: 'How Stanford approaches this differently — cross-disciplinary faculty, iterative cohort structure, applied research.' },
    { label: 'The Outcomes',         directive: 'Three things participants build or change — framed as research-to-practice capabilities.' },
    { label: 'The Community',        directive: 'Lifelong learning invitation. Who you\'ll learn alongside. Shared curiosity, not credentials.' },
    { label: 'Join the Community',   directive: 'Community-framed CTA. "Join a community of lifelong learners." Price, date, link. Warm, inclusive tone.' },
  ],
};

/* ── Build storyboard data ───────────────────────────────────────────────── */
function buildStoryboard(p) {
  const si       = p.styleInstructions;
  const flavor   = si?.flavor || 'harvard_standard';
  const strategy = STORYBOARD_STRATEGY[flavor] || STORYBOARD_STRATEGY.harvard_standard;
  const dna      = si?.visualDna;

  // Generator fix: guaranteed non-empty modules — never returns empty slide 4
  const DEFAULT_MODULES = ['Strategic Overview', 'Core Framework', 'Implementation'];
  const modules = (p.modules && p.modules.length) ? p.modules : DEFAULT_MODULES;

  // Map cert content onto each slide
  const contentMap = [
    // Slide 1: Hook
    p.hooks?.ahaMoment
      ? `"${p.hooks.ahaMoment}"\n— ${p.facultySchool || p.provider}`
      : `${p.title} — ${p.provider}`,
    // Slide 2: Problem
    p.hooks?.coreProblem || `The core challenge facing ${(p.industries || ['professionals'])[0].toLowerCase()} leaders today.`,
    // Slide 3: Aha / Insight
    p.hooks?.ahaMoment || `The insight that changes how you approach ${p.title.toLowerCase()}.`,
    // Slide 4: Framework / Modules (always populated via DEFAULT_MODULES fallback)
    modules.slice(0, 3).map((m, i) => `${i + 1}. ${m}`).join('\n'),
    // Slide 5: Outcomes
    (p.outcomes || []).slice(0, 3).map(o => `→ ${o.theme || o}`).join('\n') ||
      `→ Build the framework\n→ Apply it immediately\n→ Lead with precision`,
    // Slide 6: Network / Community
    `${(p.personas || []).slice(0, 2).join(' and ') || 'Senior practitioners'} from organisations navigating the same challenge — globally.`,
    // Slide 7: CTA
    `${p.title} | ${p.provider}\n${p.price || ''} · ${p.nextCohort === 'On-Demand (start immediately)' ? 'Start on demand' : p.nextCohort || 'Upcoming cohort'}`,
  ];

  // Per-slide visual direction modifiers — injected into visual_prompt
  const slideVisualMods = {
    harvard_standard: [
      'Deep navy background with a single gold rule beneath the quote. Heavy negative space.',
      'Full-bleed editorial photography. No decorative elements. Subject centred.',
      'Large serif pull-quote on minimal background. Gold highlight on one phrase.',
      'Three-column structured layout. Gold dividers. Clean academic diagram aesthetic.',
      'Outcome list on stark white or navy. Arrow or check icons in gold.',
      'Portrait-style cohort photography. Soft vignette. Institutional gravitas.',
      'Centred CTA layout. Gold CTA button area. Course name in large serif type.',
    ],
    lse_macro: [
      'Geopolitical map or aerial city photography. Stark crop. Left-side negative space.',
      'Full-bleed editorial. High-contrast foreground. Right-side text safe zone.',
      'Board-room or institutional interior. Oxford navy overlay at 40% opacity.',
      'Structured grid layout. Gold hairlines. Policy document / Economist aesthetic.',
      'Three-column bullet layout. Muted navy background. Parchment white text.',
      'Group of senior practitioners. Formal portrait. Minimal colour grading.',
      'Formal seal or building exterior. Gold type area. "Applications are open." centred.',
    ],
    mit_innovation: [
      'Blueprint grid overlay on dark background. Electric blue accent lines.',
      'Abstract systems diagram. Technical line-work on dark navy or charcoal.',
      'High-contrast overlay for the insight block. White text on near-black.',
      'Technical architecture diagram aesthetic. Blueprint precision. Electric blue highlights.',
      'Three-row outcome list on clean white grid. Numbered in electric blue.',
      'Engineers or researchers collaborating. Clinical lighting. No posed shots.',
      'CTA block with technical precision. Grid-locked. Electric blue CTA accent.',
    ],
    stanford_bridge: [
      'Warm sunlit campus photography. Open whitespace. Optimistic, uncluttered.',
      'Natural library or study setting. Warm light. Genuine curiosity.',
      'Single bold counterintuitive text block on clean warm background.',
      'Collaborative workshop setting. Open table. Natural materials visible.',
      'Outcome list on warm white. Organic line separators. No clinical grid.',
      'Diverse learner community. Genuine interaction. Cardinal red accent element.',
      'Warm open-door invitation aesthetic. Soft shadow. Community feel.',
    ],
  };

  const mods = slideVisualMods[flavor] || slideVisualMods.harvard_standard;

  // Each slide is an object with `text` (for the user) and `visual_prompt` (for Nano Banana)
  const slides = strategy.map((s, i) => {
    const text = contentMap[i] || '';
    const visual_prompt = dna
      ? (`/image_generation SLIDE ${String(i + 1).padStart(2, '0')} — ${s.label.toUpperCase()}. ` +
         `COURSE: ${p.title}. ` +
         `AESTHETIC: ${dna.aesthetic}. ` +
         `SLIDE DIRECTION: ${mods[i] || mods[0]}. ` +
         `PALETTE: ${dna.palette}. ` +
         `MOOD: ${dna.mood}. ` +
         `KEYWORDS: ${(dna.nano_banana_keywords || []).join(', ')}. ` +
         `8K resolution. Background only — no text rendered in image, no faces, no logos.`)
      : `/image_generation SLIDE ${i + 1} — ${s.label}. Course: ${p.title}. High-end corporate photography. 8K. No text, no logos.`;

    return {
      number: String(i + 1).padStart(2, '0'),
      label:  s.label,
      directive: s.directive,
      text,
      visual_prompt,
    };
  });

  // Single unified background prompt (used by "Copy Background Prompt" button)
  const bgPrompt = dna
    ? (`/image_generation BACKGROUND — ALL SLIDES. COURSE: ${p.title}. AESTHETIC: ${dna.aesthetic}. ` +
       `PALETTE: ${dna.palette}. COMPOSITION: ${dna.composition_style}. MOOD: ${dna.mood}. ` +
       `KEYWORDS: ${(dna.nano_banana_keywords || []).join(', ')}. ` +
       `8K resolution. Clean background for carousel overlay. No text. No faces. No logos.`)
    : buildImagePrompt(p, 'storyboard');

  return { slides, bgPrompt, flavor, dna };
}

/* ── Render storyboard into DOM ──────────────────────────────────────────── */
function renderStoryboard(p) {
  const data = buildStoryboard(p);

  // ① Cache force — hard-wire to window so it's accessible from any scope
  window.imagePromptCache = window.imagePromptCache || imagePromptCache;
  window.imagePromptCache.storyboardSlides = data.slides || [];
  console.log('Final Slides Object:', data.slides);

  // ② Visibility override — force content visible, hide empty state
  document.getElementById('empty-storyboard').style.display  = 'none';
  document.getElementById('storyboard-slides').style.display = 'block';
  document.getElementById('card-storyboard').classList.add('populated');

  // Subtitle: flavor label
  const flavorLabels = {
    harvard_standard: 'Harvard Standard · 7 Slides',
    lse_macro:        'LSE Macro-Strategist · 7 Slides',
    mit_innovation:   'MIT Innovation · 7 Slides',
    stanford_bridge:  'Stanford Online · 7 Slides',
  };
  document.getElementById('subtitle-storyboard').textContent =
    flavorLabels[data.flavor] || '7-Slide Carousel';

  // Meta: visual DNA aesthetic label
  const metaEl = document.getElementById('storyboard-meta');
  if (metaEl) metaEl.textContent = data.dna ? data.dna.aesthetic : '';

  // Intent: flavor-specific storyboard description
  const intentEl = document.getElementById('intent-storyboard');
  if (intentEl) {
    const intentMap = {
      harvard_standard: 'Faculty-authority carousel. 7 slides mapping aha moment → framework → outcomes → CTA.',
      lse_macro:        'Macro-governance carousel. 7 slides mapping geopolitical force → strategic stakes → capabilities → Apply.',
      mit_innovation:   'Systems-precision carousel. 7 slides mapping root cause → systemic fix → technical build → Deploy.',
      stanford_bridge:  'Research-curiosity carousel. 7 slides mapping question → finding → Stanford method → Join community.',
    };
    intentEl.textContent = intentMap[data.flavor] || 'Visual carousel breakdown. 7 slides mapped to the active brand flavor\'s strategic intent.';
  }

  // Vibe: visual DNA mood
  document.getElementById('vibe-storyboard').textContent =
    data.dna ? `🎨 ${data.dna.mood}` : '';

  // ③ Safety loop guard — bail before touching DOM if slides are missing
  if (!data.slides || data.slides.length === 0) return;

  // Render slides — compact two-column (number + body) layout
  const slidesEl = document.getElementById('storyboard-slides');
  slidesEl.innerHTML = data.slides.map(s => {
    const vp = s.visual_prompt || '';
    const visualSummary = vp.includes('SLIDE DIRECTION:')
      ? (vp.split('SLIDE DIRECTION:')[1]?.split('.')[0]?.trim() || '')
      : vp.slice(0, 90);
    return `
    <div class="storyboard-slide">
      <div class="slide-number">${s.number}</div>
      <div class="slide-body">
        <div class="slide-label">${s.label}</div>
        <div class="slide-directive">${s.directive}</div>
        <div class="slide-content">${escHtml(s.text || '')}</div>
        <div class="slide-visual-direction">🎨 ${visualSummary}</div>
      </div>
    </div>`;
  }).join('');

  // ④ Reveal: re-assert after innerHTML write (browser may repaint between ops)
  document.getElementById('empty-storyboard').style.display  = 'none';
  document.getElementById('storyboard-slides').style.display = 'block';

  // Inject slide-prompt dropdown into the footer btn-row (replace copyimg button)
  injectSlidePromptDropdown(data.slides);

  // Design tip — flavor-specific guidance for the visual execution
  const designTips = {
    harvard_standard: 'Design Tip: Use a deep navy background with a single gold rule beneath the faculty quote on Slide 1. Let the white space carry the authority.',
    lse_macro:        'Design Tip: Keep negative space on the left across all 7 slides for a clean, editorial look. Reserve the right third for the text block.',
    mit_innovation:   'Design Tip: Use high-contrast overlays for Slide 4 to highlight the system architecture. Blueprint grid lines work well as a background texture.',
    stanford_bridge:  'Design Tip: Use warm natural light and open whitespace throughout. Slide 3 (The Counterintuitive) benefits most from an uncluttered, single-image background.',
  };
  const tipText = designTips[data.flavor] || 'Design Tip: Match the visual treatment to the brand flavor selected above.';
  let tipEl = document.getElementById('design-tip-storyboard');
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.id = 'design-tip-storyboard';
    tipEl.className = 'design-tip';
    slidesEl.after(tipEl);
  }
  tipEl.textContent = tipText;

  // Cache bg prompt for copy button
  imagePromptCache['storyboard'] = data.bgPrompt;

  // ④ UI reveal — forced last, overrides any CSS or prior display state
  document.getElementById('empty-storyboard').style.display  = 'none';
  document.getElementById('storyboard-slides').style.display = 'flex';
}

/* ── Copy all slides text ─────────────────────────────────────────────────── */
function copyStoryboard() {
  // Primary: use cached slide objects (set during renderStoryboard)
  const slides = imagePromptCache['storyboardSlides'];
  if (slides && slides.length) {
    const text = slides.map(s =>
      `[Slide ${s.number} — ${s.label}]\n${s.directive}\n\n${s.text || ''}`
    ).join('\n\n──────────\n\n');
    navigator.clipboard.writeText(text).then(() => flashBtn('copytxt-storyboard', '✓ Copied!'));
    return;
  }
  // Fallback: reconstruct from DOM (cold cache — e.g. page restored from localStorage)
  const slidesEl = document.getElementById('storyboard-slides');
  if (!slidesEl) return;
  const domSlides = [...slidesEl.querySelectorAll('.storyboard-slide')];
  if (!domSlides.length) return;
  const text = domSlides.map(el => {
    const num   = el.querySelector('.slide-number')?.textContent  || '';
    const label = el.querySelector('.slide-label')?.textContent   || '';
    const dir   = el.querySelector('.slide-directive')?.textContent || '';
    const body  = el.querySelector('.slide-content')?.textContent  || '';
    return `[Slide ${num} — ${label}]\n${dir}\n\n${body}`;
  }).join('\n\n──────────\n\n');
  navigator.clipboard.writeText(text).then(() => flashBtn('copytxt-storyboard', '✓ Copied!'));
}

/* ── Copy storyboard background prompt ───────────────────────────────────── */
function copyStoryboardImagePrompt() {
  const prompt = imagePromptCache['storyboard'];
  if (!prompt) return;
  navigator.clipboard.writeText(prompt).then(() => {
    flashBtn('copyimg-storyboard', '✓ Prompt Copied!');
  });
}

/* ── Slide Prompt Dropdown — injects a <select> into the storyboard footer ── */
function injectSlidePromptDropdown(slides) {
  // Remove any existing dropdown from a previous render
  const existing = document.getElementById('slide-prompt-select');
  if (existing) existing.remove();

  const btnRow = document.querySelector('#card-storyboard .card-footer .btn-row');
  if (!btnRow) return;

  // Build select element
  const select = document.createElement('select');
  select.id        = 'slide-prompt-select';
  select.className = 'slide-prompt-select';

  const defaultOpt = document.createElement('option');
  defaultOpt.value    = '';
  defaultOpt.textContent = '🍌 Copy Slide Prompt…';
  defaultOpt.disabled = true;
  defaultOpt.selected = true;
  select.appendChild(defaultOpt);

  slides.forEach(s => {
    if (!s.visual_prompt && !s.text) return; // skip malformed slides
    const opt = document.createElement('option');
    opt.value       = s.visual_prompt || s.text || '';
    opt.textContent = `Slide ${s.number} — ${s.label}`;
    select.appendChild(opt);
  });

  // On selection: copy the visual_prompt and reset the dropdown
  select.addEventListener('change', function () {
    if (!this.value) return;
    navigator.clipboard.writeText(this.value).then(() => {
      const label = this.options[this.selectedIndex].textContent;
      const prev  = this.options[0].textContent;
      this.options[0].textContent = `✓ ${label} Copied!`;
      setTimeout(() => {
        this.options[0].textContent = prev;
        this.selectedIndex = 0;
      }, 2200);
    });
  });

  btnRow.appendChild(select);
}

/* ═══════════════════════════════════════════════════════════════════════════
   COPY ACTIONS
   ═══════════════════════════════════════════════════════════════════════════ */
function copyText(type) {
  const hook = document.getElementById('hook-' + type)?.textContent || '';
  // body uses innerHTML — reconstruct plain text by stripping the marker span and decoding <br>
  const bodyEl   = document.getElementById('body-' + type);
  const bodyHtml = bodyEl ? bodyEl.innerHTML : '';
  const body     = bodyHtml
    .replace(/<span class="see-more-cut"><\/span>/g, '')
    .replace(/<br>/g, '\n')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
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

/* ═══════════════════════════════════════════════════════════════════════════
   HISTORY DRAWER
   ═══════════════════════════════════════════════════════════════════════════ */
function openHistoryDrawer() {
  document.getElementById('history-drawer').classList.add('open');
  document.getElementById('history-drawer-backdrop').classList.add('open');
  document.getElementById('history-btn').classList.add('active');
}
function closeHistoryDrawer() {
  document.getElementById('history-drawer').classList.remove('open');
  document.getElementById('history-drawer-backdrop').classList.remove('open');
  document.getElementById('history-btn').classList.remove('active');
}

document.getElementById('history-btn').addEventListener('click', () => {
  const isOpen = document.getElementById('history-drawer').classList.contains('open');
  isOpen ? closeHistoryDrawer() : openHistoryDrawer();
});
document.getElementById('history-drawer-backdrop').addEventListener('click', closeHistoryDrawer);
document.getElementById('drawer-close').addEventListener('click', closeHistoryDrawer);

/* ═══════════════════════════════════════════════════════════════════════════
   READABILITY GUIDE — injects 'See More' marker at ~210 chars in post body
   ═══════════════════════════════════════════════════════════════════════════ */
const SEE_MORE_CUTOFF = 210;

function setBodyWithMarker(el, text) {
  if (!text) { el.innerHTML = ''; return; }
  if (text.length <= SEE_MORE_CUTOFF) { el.innerHTML = escHtml(text); return; }
  // Find a word boundary near the cutoff
  let breakAt = text.lastIndexOf(' ', SEE_MORE_CUTOFF);
  if (breakAt < 80) breakAt = SEE_MORE_CUTOFF;
  el.innerHTML =
    escHtml(text.slice(0, breakAt)) +
    '<span class="see-more-cut"></span>' +
    escHtml(text.slice(breakAt));
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

/* ── Brand Flavor Selector ───────────────────────────────────────────────── */
// Maps button data-flavor values → styles_kb.json profile ids
const FLAVOR_TO_PROFILE = {
  harvard_standard: 'LSE_EXED_GOLD_2025',
  lse_macro:        'LSE_EXED_GOLD',
  mit_innovation:   'MIT_SLOAN_TECH',
  stanford_bridge:  'STANFORD_ONLINE_BRIDGE'
};

function getActiveFlavor() {
  const active = document.querySelector('.brand-flavor-btn.active');
  return active ? active.dataset.flavor : 'harvard_standard';
}

document.querySelectorAll('.brand-flavor-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.brand-flavor-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    const mapped = FLAVOR_TO_PROFILE[this.dataset.flavor];
    if (mapped && stylesKB[mapped]) {
      activeStyleId = mapped;
      console.log(`🎨 Brand style switched → ${mapped}`);
    }
  });
});

/* ── Init ───────────────────────────────────────────────────────────────── */
loadKB();
