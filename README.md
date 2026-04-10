# SkillsPro360 — Content Cockpit

**v1.5-stable** · AI-Powered LinkedIn Content Engine

---

## What It Does

SkillsPro360 Content Cockpit generates production-ready LinkedIn post sets from a structured knowledge base of professional development courses. Select any course, choose a brand style, and the engine outputs three calibrated post variants — Prestige, Disruptor, and Practitioner — plus a 7-slide Storyboard carousel, each with a LinkedIn caption and a Nano Banana image prompt.

---

## The 4-Pillar Architecture

| Pillar | What it does |
|---|---|
| **Prestige** | Authority-building post. Leads with faculty name, institution, and the course's core aha moment. |
| **Disruptor** | Pattern-interrupting post. Opens with the enemy of progress. Challenges the status quo. |
| **Practitioner** | Stop/Start framework post. Concrete and actionable. Drives saves and shares. |
| **Storyboard** | 7-slide carousel. Maps the course narrative to the active brand style's strategic intent. |

---

## Project Structure

```
SkillsPro360Claude/
├── index.html              # Dashboard UI — single-page application
├── assets/
│   ├── css/main.css        # Full dark-mode design system
│   └── js/app.js           # Engine: KB loading, rendering, copy actions, SP360Bridge
├── data/
│   ├── certs_kb.json       # Course knowledge base (25 courses — Harvard, MIT, Maxme)
│   ├── styles_kb.json      # 4 brand style profiles + visual DNA
│   └── content_library.json # Pre-built post library (fast-path render)
├── agents/
│   └── writer_system_prompt.md  # IQ Synthesis Logic — Writer Agent system prompt
├── CLAUDE.md               # Project conventions and AI agent instructions
└── README.md               # This file
```

---

## Brand Style Profiles

Four strategic voices, each with distinct vocabulary, hook rules, narrative flow, and visual DNA:

| Profile | Voice | Visual DNA |
|---|---|---|
| **Harvard Standard** (`LSE_EXED_GOLD_2025`) | Authoritative, faculty-led | Brutalist / Editorial |
| **LSE Macro-Strategist** (`LSE_EXED_GOLD`) | Macro-economic, geopolitical | Brutalist / Editorial |
| **MIT Innovation** (`MIT_SLOAN_TECH`) | Systems-precise, technical | Blueprint / Precision |
| **Stanford Online** (`STANFORD_ONLINE_BRIDGE`) | Research-curious, optimistic | Organic / Optimistic |

---

## IQ Synthesis Logic

Every generation triangulates three inputs:

1. **Cert Facts** (`certs_kb.json`) — title, provider, faculty, price, cohort, problem, aha moment, outcomes
2. **Brand Style** (`styles_kb.json`) — vocabulary anchors, hook rules, narrative flow, visual DNA
3. **Audience Persona** — LinkedIn senior practitioners; written to their level of authority

The Writer Agent system prompt (in `agents/writer_system_prompt.md`) defines the 6-step generation protocol, contextual adaptation rules, and the DNA Filter that enforces style consistency.

---

## 3-Step Workflow

```
01 // SOURCE CONTEXT    →  Search & select a course from the knowledge base
02 // STRATEGIC LENS   →  Choose a brand style (Harvard / LSE / MIT / Stanford)
03 // DEPLOY           →  Generate the 4-pillar post set
```

---

## Copy Actions

| Button | Output |
|---|---|
| ⎘ Copy Caption | Full LinkedIn post text (hook + body + bullets + CTA + hashtags) |
| 🍌 Copy Image Prompt | Nano Banana `/image_generation` prompt for that post's visual |
| ⎘ Copy All Slides | All 7 storyboard slides formatted for carousel production |
| 🍌 Copy Background Prompt | Shared background image prompt for the carousel |
| Slide Prompt dropdown | Per-slide visual prompt — select to copy individually |

---

## Tech Stack

- **Vanilla JS** — zero build step, zero dependencies
- **Claude** (Anthropic) — AI generation via SP360Bridge agent payload
- **JetBrains Mono** — monospace type for UI labels and metadata badges
- **CSS custom properties** — Oxford Navy + Gold design system
- **JSON flat files** — `certs_kb.json`, `styles_kb.json`, `content_library.json`

---

## SP360Bridge

The bridge exposes a structured payload for external AI agents:

```js
window.SP360Bridge.getPayload()
// Returns:
{
  input1_certFacts:      { ... },   // full cert data
  input2_brandStyle:     { ... },   // active style profile
  input3_audiencePersona:{ ... },   // target persona context
  activeStyleId:         'LSE_EXED_GOLD_2025',
  _readyAt:              'ISO timestamp'
}
```

Pass this to any Claude agent with `agents/writer_system_prompt.md` as the system prompt to generate production posts.

---

## Maxme Exception

When `provider === 'Maxme'`, the engine automatically applies the **Maxme Blend** override — shifting tone from macro/institutional to micro/human regardless of selected brand style. Prices are rendered in AUD. Hook formulas shift to quiet behavioural truth the reader recognises from their own team dynamics.

---

*Built with Claude Code · SkillsPro360 · v1.5-stable*
