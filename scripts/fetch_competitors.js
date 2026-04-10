/**
 * fetch_competitors.js
 * Pulls the last 5 posts from each competitor LinkedIn page via Outx AI,
 * extracts text + timestamp, and persists them to data/intelligence/competitor_feeds.json.
 *
 * Usage: node scripts/fetch_competitors.js
 */

require('dotenv').config();
const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

/* ── Config ─────────────────────────────────────────────────────────────── */
const API_KEY      = process.env.OUTX_API_KEY;
const SUBMIT_URL   = 'https://api.outx.ai/linkedin-agent/fetch-profiles-posts';
const STATUS_URL   = 'https://api.outx.ai/linkedin-agent/get-task-status';
const FEEDS_PATH   = path.resolve(__dirname, '../data/intelligence/competitor_feeds.json');
const POST_LIMIT   = 5;
const POLL_EVERY   = 5000;   // ms between status checks
const POLL_TIMEOUT = 360000; // ms before giving up (6 min)

if (!API_KEY) {
  console.error('❌  OUTX_API_KEY not found. Check your .env file.');
  process.exit(1);
}

/* ── Competitors ─────────────────────────────────────────────────────────── */
const COMPETITORS = [
  {
    key: 'LSE',
    url: 'https://www.linkedin.com/company/lse-executive-education/',
  },
  // MIT and Stanford — uncomment when ready
  // { key: 'MIT',      url: 'https://www.linkedin.com/company/mit-sloan-executive-education/' },
  // { key: 'Stanford', url: 'https://www.linkedin.com/company/stanford-professional-development/' },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function loadFeeds() {
  try {
    return JSON.parse(fs.readFileSync(FEEDS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveFeeds(data) {
  fs.writeFileSync(FEEDS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function sift(posts) {
  return posts.slice(0, POST_LIMIT).map(post => ({
    text:      post.text       || post.content    || post.body || '',
    timestamp: post.timestamp  || post.publishedAt || post.date || null,
  }));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ── Step 1: Submit task ─────────────────────────────────────────────────── */
async function submitTask(url) {
  const res = await axios.post(
    SUBMIT_URL,
    { profile_urns: [url] },
    { headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' } }
  );
  return res.data;
}

/* ── Step 2: Poll status until completed ────────────────────────────────── */
async function pollUntilComplete(taskId) {
  const deadline = Date.now() + POLL_TIMEOUT;
  let attempt    = 0;

  while (Date.now() < deadline) {
    await sleep(POLL_EVERY);
    attempt++;

    const elapsed = Math.round((attempt * POLL_EVERY) / 1000);
    process.stdout.write(`   ⏳  Checking status (${elapsed}s elapsed)…\r`);

    const res    = await axios.get(STATUS_URL, {
      params:  { api_agent_task_id: taskId },
      headers: { 'x-api-key': API_KEY },
    });

    // Response shape: { success: true, data: { id, status, task_input, task_output } }
    const inner  = res.data?.data || res.data;
    const status = (inner.status || '').toLowerCase();

    if (status === 'completed') {
      process.stdout.write('\n');
      return inner;   // return inner so task_output is top-level
    }

    if (status === 'failed' || status === 'error') {
      process.stdout.write('\n');
      throw new Error(`Task ${taskId} failed. Response: ${JSON.stringify(inner).slice(0, 200)}`);
    }

    // Still pending / processing — keep looping
  }

  process.stdout.write('\n');
  throw new Error(`Timed out after ${POLL_TIMEOUT / 1000}s waiting for task ${taskId}`);
}

/* ── Fetch one competitor ────────────────────────────────────────────────── */
async function fetchCompetitor({ key, url }) {
  console.log(`\n🔍  ${key} — ${url}`);

  // 1. Submit
  const submitted = await submitTask(url);
  const taskId    = submitted?.api_agent_task_id;

  if (!taskId) {
    throw new Error(`No task ID in submit response: ${JSON.stringify(submitted).slice(0, 200)}`);
  }
  console.log(`   📋  Task ID: ${taskId}`);

  // 2. Poll
  const result = await pollUntilComplete(taskId);

  // 3. Sift — pull from task_output.posts per API spec
  const raw   = result?.task_output?.posts || result?.posts || result?.data || [];
  const posts = Array.isArray(raw) ? raw : [];

  if (posts.length === 0) {
    console.warn(`⚠️   No posts found in completed response. Raw:`, JSON.stringify(result).slice(0, 300));
    return { key, posts: [] };
  }

  const sifted = sift(posts);
  console.log(`✅  ${key}: ${sifted.length} post(s) extracted.`);
  return { key, posts: sifted };
}

/* ── Main ────────────────────────────────────────────────────────────────── */
async function main() {
  console.log('📡  SkillsPro360 — Competitor Feed Fetcher');
  console.log('─'.repeat(44));

  const feeds = loadFeeds();

  for (const competitor of COMPETITORS) {
    try {
      const { key, posts } = await fetchCompetitor(competitor);
      feeds[key] = {
        source:    competitor.url,
        fetchedAt: new Date().toISOString(),
        posts,
      };
    } catch (err) {
      const status  = err.response?.status;
      const message = err.response?.data
        ? JSON.stringify(err.response.data)
        : err.message;
      console.error(`\n❌  ${competitor.key} failed (HTTP ${status || 'N/A'}): ${message}`);
    }
  }

  saveFeeds(feeds);
  console.log(`\n💾  Saved → ${FEEDS_PATH}`);
  console.log('─'.repeat(44));
  console.log('Done.\n');
}

main();
