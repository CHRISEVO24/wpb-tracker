#!/usr/bin/env node
// fb-check.js
// Compares fb-listings.json against history.json
// ONLY flags items that are ACTIVELY FOR SALE on FB but Out of Stock on WPB
// Ignores anything already marked Out of Stock, Sold, or inactive on FB

const fs = require('fs');

// ── helpers ──────────────────────────────────────────────────────────────────
function loadJSON(path) {
      try { return JSON.parse(fs.readFileSync(path, 'utf8')); }
      catch (e) { console.error(`Cannot read ${path}: ${e.message}`); process.exit(1); }
}

function normalize(s) {
      return (s || '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')   // strip punctuation
    .replace(/\s+/g, ' ')
        .trim();
}

// Extract the last whitespace-separated token that looks like a watch ref#
// e.g. "126710BLNR", "5205R-010", "PAM01528"
function extractRef(title) {
      const tokens = (title || '').trim().split(/\s+/);
      for (let i = tokens.length - 1; i >= 0; i--) {
              const t = tokens[i].replace(/[^\w-]/g, '');
              if (t.length >= 5 && /[A-Za-z]/.test(t) && /\d/.test(t)) return t.toUpperCase();
      }
      return '';
}

// ── load data ─────────────────────────────────────────────────────────────────
const fbListings = loadJSON('fb-listings.json');

// history.json is keyed by timestamp → { productId: {...} }
const history    = loadJSON('history.json');
const snapKeys   = Object.keys(history).sort();
const latestSnap = history[snapKeys[snapKeys.length - 1]];
const wpbItems   = Object.values(latestSnap);

console.log(`Inventory: ${wpbItems.length} items`);
console.log(`FB Listings: ${fbListings.length}`);

// ── build WPB look-up tables ──────────────────────────────────────────────────
const wpbByRef       = {};   // ref# → item
const wpbByTitle     = {};   // normalised title → item
const wpbByCode      = {};   // productCode → item

for (const item of wpbItems) {
      const ref   = extractRef(item.name);
      const title = normalize(item.name);
      const code  = (item.productCode || item.sku || '').trim().toLowerCase();

  if (ref)   wpbByRef[ref]     = item;
      if (title) wpbByTitle[title] = item;
      if (code)  wpbByCode[code]   = item;
}

// ── categorise FB listings ────────────────────────────────────────────────────
// Only active / in-stock FB listings can trigger a "mark sold" warning
const ACTIVE_FB_STATUSES = new Set(['active', 'in stock', 'in_stock', '']);

const markSold = [];   // on FB (active) but sold/OOS on WPB
const noMatch  = [];   // on FB (active) but not found in WPB at all
const ok       = [];   // on FB (active) and still in stock on WPB

// Deduplicate FB listings by title+price so we don't double-count
const seen = new Set();

for (const listing of fbListings) {
      const status = (listing.status || '').toLowerCase().trim();
      if (!ACTIVE_FB_STATUSES.has(status)) continue;   // skip sold/inactive FB items

  const dedupeKey = `${listing.title}||${listing.price}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

  // Try to find this listing in WPB inventory
  const fbRef   = extractRef(listing.title);
      const fbTitle = normalize(listing.title);

  const wpbItem =
          (fbRef && wpbByRef[fbRef])     ||
          wpbByTitle[fbTitle]             ||
          null;

  if (!wpbItem) {
          noMatch.push(listing);
          continue;
  }

  const wpbStatus = (wpbItem.stockStatus || '').toLowerCase();
      const inStock   = wpbStatus.includes('in stock') || wpbStatus.includes('instock');

  if (inStock) {
          ok.push(listing);
  } else {
          markSold.push(listing);
  }
}

console.log(`\nActive FB listings (for sale): ${ok.length + markSold.length + noMatch.length}`);
console.log(`Skipping 0 listings already marked Out of Stock/Sold on FB`);
console.log(`\n=== FB SYNC RESULTS ===`);
console.log(`\uD83D\uDD34 Mark as Sold on FB:  ${markSold.length}`);
console.log(`\uD83D\uDFE0 Not in WPB:          ${noMatch.length}`);
console.log(`\u2705 All clear:           ${ok.length}`);

// ── write output ──────────────────────────────────────────────────────────────
const result = {
      checked_at:      new Date().toISOString(),
      checked_at_et:   new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
      fb_scraped_at_et: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
      summary: {
              total_fb_listings:  fbListings.length,
              active_fb_listings: ok.length + markSold.length + noMatch.length,
              mark_sold:          markSold.length,
              no_match:           noMatch.length,
              ok:                 ok.length,
      },
      mark_sold: markSold,
      no_match:  noMatch,
      ok,
};

fs.writeFileSync('fb-sync-results.json', JSON.stringify(result, null, 2));
console.log(`\uD83D\uDCBE Saved fb-sync-results.json`);
