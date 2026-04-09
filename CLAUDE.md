# SkillsPro360 Content Factory

## Project Overview
An AI-powered content production system for the SkillsPro360 brand, built using Claude Code and MCP tooling. The goal is to automate and streamline the creation, management, and publishing of educational and professional skills content across multiple formats and platforms.

## Goals
- Generate high-quality skills and career development content at scale
- Maintain a structured content database (`data.json`) as the single source of truth
- Provide a dashboard (`index.html`) for visualizing and managing content assets
- Integrate AI-driven workflows using Claude Code and MCP servers (e.g., Gmail, Google Calendar, Firecrawl)

## Tech Stack
- **Claude Code** — AI agent for content generation, automation, and orchestration
- **MCP (Model Context Protocol)** — Connects Claude to external tools (Gmail, Google Calendar, web scraping via Firecrawl)
- **Tailwind CSS** — Utility-first CSS framework for styling the dashboard UI
- **HTML/JS** — Lightweight frontend for the content dashboard
- **JSON** — Flat-file content database (`data.json`)

## Project Structure
```
SkillsPro360Claude/
├── CLAUDE.md        # Project documentation (this file)
├── data.json        # Content database
└── index.html       # Dashboard UI
```

## Conventions
- All generated content entries go into `data.json`
- The dashboard reads from `data.json` to render content cards
- Keep content modular: one entry per skill/article/asset
