#!/usr/bin/env node
// The agent's four tools as a tiny MCP server over stdio (JSON-RPC, newline-delimited).
// No dependencies. `claude -p` starts one of these per turn.
//
// Env from the relay:
//   CONCIERGE_DATA_DIR      folder with villa-prices.json and listings.json
//   CONCIERGE_TURN_LOG      file this process appends every tool call to (JSON lines)
//   CONCIERGE_THREAD_STATE  JSON: { state: 'open'|'hold', hold: { slot, listingId } | null }
//   CONCIERGE_NOW           ISO time override for tests
//
// No tool sends a message, moves money or edits the price data.
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.CONCIERGE_DATA_DIR || resolve(here, '../data');
const TURN_LOG = process.env.CONCIERGE_TURN_LOG || '';
const THREAD = safeJson(process.env.CONCIERGE_THREAD_STATE) || { state: 'open', hold: null };
const NOW = process.env.CONCIERGE_NOW ? new Date(process.env.CONCIERGE_NOW) : new Date();

const prices = JSON.parse(readFileSync(resolve(DATA_DIR, 'villa-prices.json'), 'utf8'));
const listings = JSON.parse(readFileSync(resolve(DATA_DIR, 'listings.json'), 'utf8')).listings;
const aliases = safeJson(tryRead(resolve(DATA_DIR, 'area-aliases.json'))) || {};

// ---------- tools ----------

const TOOLS = [
  {
    name: 'areaPrices',
    description:
      'Registered villa sale prices for one Dubai community over the last three full months, from Dubai Land Department data. Use it for every price question. Returns AED per sq ft, median price, number of registered deals, month-on-month and year-on-year change, bedroom breakdown and the source line. Refuses areas with too few deals. Pass the community name in English if you can (e.g. "Arabian Ranches", "The Springs", "DAMAC Hills 2").',
    inputSchema: { type: 'object', properties: { area: { type: 'string', description: 'Community name, English or Arabic' } }, required: ['area'] },
  },
  {
    name: 'listings',
    description:
      'Search the available villas and townhouses (synthetic demo inventory). Filter by area, bedrooms and maximum price in AED. Returns up to 5 with id, area, type, beds, plot and built-up size, price, view and features.',
    inputSchema: {
      type: 'object',
      properties: {
        area: { type: 'string' },
        beds: { type: 'integer', minimum: 1 },
        maxPrice: { type: 'number', description: 'AED' },
        limit: { type: 'integer', minimum: 1, maximum: 5 },
      },
    },
  },
  {
    name: 'holdViewing',
    description:
      'Viewing appointments. action "slots" lists the next available slots (Dubai time). action "hold" holds one slot for the visitor; it is NOT booked until the visitor says yes and you call action "confirm". action "release" frees a held slot. Never confirm without an explicit yes from the visitor in their latest message.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['slots', 'hold', 'confirm', 'release'] },
        slot: { type: 'string', description: 'ISO 8601 start time from "slots", e.g. 2026-11-14T10:00:00+04:00' },
        listingId: { type: 'string', description: 'Listing id such as GC-012, if the viewing is for one listing' },
      },
      required: ['action'],
    },
  },
  {
    name: 'handOff',
    description:
      'Stop the conversation and pass it to Josh, a licensed broker. Use for: valuation (the visitor wants a price or estimate for THEIR OWN property), contract (legal, contract, deposit, mortgage, fees or dispute questions), complaint (the visitor is unhappy with a person or service), out_of_scope (the visitor insists on a human or asks for something outside Dubai villas). After this tool you tell the visitor Josh replies within a working day, and you stop answering substantively.',
    inputSchema: {
      type: 'object',
      properties: {
        reason: { type: 'string', enum: ['valuation', 'contract', 'complaint', 'out_of_scope'] },
        summary: { type: 'string', description: 'One or two sentences for Josh: what the visitor wants. No names or phone numbers.' },
      },
      required: ['reason', 'summary'],
    },
  },
];

const norm = (s) => String(s || '').toLowerCase().replace(/^(the|al|ال)\s+/u, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function findArea(q) {
  const n = norm(q);
  if (!n) return { area: null, suggestions: [] };
  const byAlias = aliases[n] || aliases[norm(q).replace(/\s+/g, '')];
  const target = byAlias ? norm(byAlias) : n;
  let hit = prices.areas.find((a) => norm(a.name) === target);
  if (!hit) hit = prices.areas.find((a) => norm(a.name).startsWith(target) || target.startsWith(norm(a.name)));
  if (!hit) {
    const toks = target.split(' ').filter((t) => t.length > 2);
    const scored = prices.areas
      .map((a) => ({ a, s: toks.filter((t) => norm(a.name).includes(t)).length }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s);
    if (scored.length === 1 || (scored.length > 1 && scored[0].s > scored[1].s)) hit = scored[0].a;
    else return { area: null, suggestions: scored.slice(0, 4).map((x) => x.a.name) };
  }
  return { area: hit, suggestions: [] };
}

function areaPrices({ area }) {
  const excluded = prices.excluded.find((e) => norm(e.name) === norm(area) || norm(aliases[norm(area)] || '') === norm(e.name));
  const { area: hit, suggestions } = findArea(area);
  if (!hit) {
    if (excluded) return { error: 'too_few_deals', area: excluded.name, deals: excluded.sales, minDeals: prices.minDeals, say: 'Not enough registered sales in the last three months to quote a reliable figure.' };
    return { error: 'unknown_area', asked: area, suggestions, knownAreas: prices.areas.map((a) => a.name) };
  }
  return {
    area: hit.name,
    window: prices.window,
    deals: hit.sales,
    medianAedPerSqft: hit.medianPpsf,
    medianPriceAed: hit.medianPrice,
    changeMonthOnMonthPct: hit.mom,
    changeYearOnYearPct: hit.yoy,
    byBedroomLast12Months: hit.byBeds12m,
    unit: prices.unit,
    source: prices.source,
    sourceUrl: prices.sourceUrl,
    sayTheSource: true,
  };
}

function searchListings({ area, beds, maxPrice, limit }) {
  let rows = listings;
  let areaName = null;
  if (area) {
    const { area: hit, suggestions } = findArea(area);
    if (!hit) return { error: 'unknown_area', asked: area, suggestions };
    areaName = hit.name;
    rows = rows.filter((l) => l.area === hit.name);
  }
  if (beds) rows = rows.filter((l) => l.beds === Number(beds));
  if (maxPrice) rows = rows.filter((l) => l.priceAed <= Number(maxPrice));
  rows = [...rows].sort((a, b) => a.priceAed - b.priceAed).slice(0, Math.min(Number(limit) || 5, 5));
  return {
    area: areaName,
    count: rows.length,
    note: 'Demo inventory. Every listing is synthetic.',
    listings: rows.map(({ id, area, type, beds, baths, plotSqft, buaSqft, priceAed, view, features }) => ({ id, area, type, beds, baths, plotSqft, buaSqft, priceAed, view, features })),
  };
}

function dubaiSlots(from) {
  // Next 7 days, Sat–Thu, 10:00 / 12:00 / 16:00 Asia/Dubai (UTC+4, no DST), never today.
  const out = [];
  const base = new Date(from.getTime() + 4 * 3600e3); // shift to Dubai wall clock
  for (let d = 1; d <= 7 && out.length < 6; d++) {
    const day = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + d));
    if (day.getUTCDay() === 5) continue; // Friday
    for (const h of [10, 12, 16]) {
      if (out.length >= 6) break;
      const iso = `${day.toISOString().slice(0, 10)}T${String(h).padStart(2, '0')}:00:00+04:00`;
      out.push({ slot: iso, label: `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.getUTCDay()]} ${day.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][day.getUTCMonth()]}, ${h}:00` });
    }
  }
  return out;
}

function holdViewing({ action, slot, listingId }) {
  const slots = dubaiSlots(NOW);
  if (action === 'slots') return { timezone: 'Asia/Dubai', slots, held: THREAD.hold || null };
  if (action === 'hold') {
    const s = slots.find((x) => x.slot === slot);
    if (!s) return { error: 'slot_unavailable', slots };
    if (listingId && !listings.find((l) => l.id === listingId)) return { error: 'unknown_listing' };
    return { held: { slot: s.slot, label: s.label, listingId: listingId || null }, booked: false, next: 'Tell the visitor the slot is held and ask them to confirm. Do not call confirm until they say yes.' };
  }
  if (action === 'confirm') {
    const target = slot || THREAD.hold?.slot;
    if (!target) return { error: 'nothing_held', say: 'Offer slots first and hold one.' };
    const s = slots.find((x) => x.slot === target) || { slot: target, label: target };
    return { booked: { slot: s.slot, label: s.label, listingId: listingId || THREAD.hold?.listingId || null }, next: 'Confirm the booking back to the visitor in one line. Josh will meet them there.' };
  }
  if (action === 'release') return { released: THREAD.hold || null };
  return { error: 'bad_action' };
}

function handOff({ reason, summary }) {
  return {
    handedOff: true,
    reason,
    summary: String(summary || '').slice(0, 400),
    say: 'Tell the visitor you have passed this to Josh and he replies within a working day. Do not answer the question yourself.',
  };
}

const IMPL = { areaPrices, listings: searchListings, holdViewing, handOff };

// ---------- JSON-RPC over stdio ----------

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.method === 'initialize') {
    return reply(msg.id, {
      protocolVersion: msg.params?.protocolVersion || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'gulf-concierge-tools', version: '1.0.0' },
    });
  }
  if (msg.method === 'notifications/initialized' || msg.method?.startsWith('notifications/')) return;
  if (msg.method === 'ping') return reply(msg.id, {});
  if (msg.method === 'tools/list') return reply(msg.id, { tools: TOOLS });
  if (msg.method === 'tools/call') {
    const name = msg.params?.name;
    const args = msg.params?.arguments || {};
    const fn = IMPL[name];
    if (!fn) return reply(msg.id, { content: [{ type: 'text', text: `Unknown tool ${name}` }], isError: true });
    let result;
    try {
      result = fn(args);
    } catch (e) {
      result = { error: 'tool_failed', message: String(e?.message || e) };
    }
    log({ t: new Date().toISOString(), tool: name, args, result });
    return reply(msg.id, { content: [{ type: 'text', text: JSON.stringify(result) }], isError: Boolean(result?.error) && result.error === 'tool_failed' });
  }
  if (msg.id !== undefined) reply(msg.id, undefined, { code: -32601, message: `Method not found: ${msg.method}` });
});

function reply(id, result, error) {
  const out = { jsonrpc: '2.0', id };
  if (error) out.error = error;
  else out.result = result;
  process.stdout.write(JSON.stringify(out) + '\n');
}
function log(entry) {
  if (!TURN_LOG) return;
  try {
    appendFileSync(TURN_LOG, JSON.stringify(entry) + '\n');
  } catch {}
}
function safeJson(s) {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
function tryRead(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}
