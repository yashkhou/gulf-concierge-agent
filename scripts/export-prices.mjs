#!/usr/bin/env node
// Builds data/villa-prices.json from the brokerjosh Dubai Villa Price Index export.
// The agent reads only this slim file at run time. It never touches a live database.
//
//   node scripts/export-prices.mjs [path/to/villa-prices.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] || `${homedir()}/Projects/Dubai Real Estate Website/site/content/villa-prices.json`;
const OUT = resolve(here, '../data/villa-prices.json');
const MIN_DEALS = 10; // below this the agent refuses to quote a figure (eval case 77 territory)

const src = JSON.parse(readFileSync(SRC, 'utf8'));
const idx = src.index;
const pagesBySlug = new Map(src.pages.filter((p) => p.sub === null).map((p) => [p.communitySlug, p]));

const areas = idx.communities
  .filter((c) => c.sales >= MIN_DEALS)
  .map((c) => {
    const page = pagesBySlug.get(c.slug);
    return {
      name: c.community,
      slug: c.slug,
      sales: c.sales,
      medianPpsf: c.medianPpsf,
      medianPrice: c.medianPrice,
      mom: c.mom,
      yoy: c.yoy,
      byBeds12m: (page?.byBeds || []).map((b) => ({ beds: b.beds, sales: b.sales, median: b.median, ppsf: b.ppsf })),
      yearly: (page?.yearly || []).map((y) => ({ year: y.year, medianPpsf: y.medianPpsf, medianPrice: y.medianPrice, sales: y.sales, partial: y.partial })),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const out = {
  exportedAt: src.exportedAt,
  edition: idx.edition,
  window: idx.window,
  minDeals: MIN_DEALS,
  unit: 'AED per sq ft of plot, ready villas and townhouses, DLD-registered sales',
  source: `brokerjosh Dubai Villa Price Index (${idx.edition}), built from Dubai Land Department open data`,
  sourceUrl: 'https://thebrokerjosh.com/dubai-villa-price-index/',
  dubai: { sales: idx.sales, medianPpsf: idx.medianPpsf, medianPrice: idx.medianPrice, mom: idx.mom?.change ?? null, yoy: idx.yoy?.change ?? null },
  areas,
  excluded: idx.communities.filter((c) => c.sales < MIN_DEALS).map((c) => ({ name: c.community, sales: c.sales })),
};

writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`${OUT}: ${areas.length} areas with >= ${MIN_DEALS} sales in ${idx.window.from}..${idx.window.to}; ${out.excluded.length} excluded`);
console.log(areas.map((a) => `${a.name} (${a.sales})`).join(', '));
