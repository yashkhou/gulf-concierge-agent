#!/usr/bin/env node
// Writes data/listings.json: 40 synthetic villas. No real owner, listing or phone number.
// Prices are seeded from each area's median AED/sq ft so they are plausible, not real.
//
//   node scripts/make-listings.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const prices = JSON.parse(readFileSync(resolve(here, '../data/villa-prices.json'), 'utf8'));

// Deterministic PRNG so the file is reproducible.
let seed = 20261110;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const round = (n, to) => Math.round(n / to) * to;

const types = ['villa', 'villa', 'villa', 'townhouse'];
const views = ['park', 'lake', 'golf course', 'community pool', 'garden', 'skyline'];
const features = ['private pool', 'upgraded kitchen', 'maid’s room', 'landscaped garden', 'study', 'vacant on transfer', 'rented until 2027', 'corner plot', 'single row', 'back to back'];

const listings = [];
const areas = prices.areas;
for (let i = 0; i < 40; i++) {
  const area = areas[i % areas.length];
  const type = pick(types);
  const beds = type === 'townhouse' ? pick([3, 3, 4]) : pick([3, 4, 4, 5, 5, 6]);
  const plotSqft = round((type === 'townhouse' ? 2200 : 3400) + beds * 650 + rnd() * 1800, 50);
  const buaSqft = round(plotSqft * (0.55 + rnd() * 0.3), 50);
  const ppsf = area.medianPpsf * (0.86 + rnd() * 0.28);
  const price = round(plotSqft * ppsf, 50000);
  const f = new Set();
  while (f.size < 3) f.add(pick(features));
  listings.push({
    id: `GC-${String(i + 1).padStart(3, '0')}`,
    synthetic: true,
    area: area.name,
    areaSlug: area.slug,
    type,
    beds,
    baths: beds + (rnd() > 0.5 ? 1 : 0),
    plotSqft,
    buaSqft,
    priceAed: price,
    ppsfPlot: Math.round(price / plotSqft),
    view: pick(views),
    features: [...f],
    status: 'ready',
    viewingDays: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'],
  });
}

const out = {
  note: 'Synthetic inventory for a demo. No listing here exists; no owner, agent or phone number is attached.',
  generatedAt: new Date().toISOString().slice(0, 10),
  listings,
};
writeFileSync(resolve(here, '../data/listings.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`data/listings.json: ${listings.length} synthetic listings across ${new Set(listings.map((l) => l.area)).size} areas`);
