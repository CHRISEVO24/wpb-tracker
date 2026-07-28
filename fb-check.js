#!/usr/bin/env node
// fb-check.js - Compares FB listings against WPB inventory

const fs = require('fs');

function loadJSON(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch(e) { console.error('Could not load ' + file + ': ' + e.message); return null; }
}

const fbListings = loadJSON('fb-listings.json');
const history = loadJSON('history.json');

if (!fbListings || !history) { console.error('Missing required files'); process.exit(1); }

// Get latest snapshot of WPB inventory
const snapshots = Object.keys(history).sort();
if (!snapshots.length) { console.error('No snapshots in history.json'); process.exit(1); }
const latest = history[snapshots[snapshots.length - 1]] || {};
const wpbItems = Object.values(latest);

console.log('Inventory: ' + wpbItems.length + ' items | FB Listings: ' + fbListings.length);

// Only look at active FB listings
const activeFB = fbListings.filter(l => {
    const s = (l.status || '').toLowerCase();
    return s === 'active' || s === 'in stock' || s === '';
});
console.log('Active FB listings (for sale): ' + activeFB.length);

// Build WPB title index
const wpbTitles = new Set(wpbItems.map(w => (w.name || '').toLowerCase().trim()));
const wpbInStock = new Set(
    wpbItems.filter(w => (w.stockStatus || '').toLowerCase().includes('in stock'))
           .map(w => (w.name || '').toLowerCase().trim())
  );

const markSold = [];
const noMatch = [];
const ok = [];

for (const listing of activeFB) {
    const title = (listing.title || '').toLowerCase().trim();
    if (!title) continue;
    if (wpbInStock.has(title)) {
          ok.push(listing);
    } else if (wpbTitles.has(title)) {
          markSold.push(listing);
    } else {
          noMatch.push(listing);
    }
}

console.log('=== FB SYNC RESULTS ===');
console.log('Mark as Sold on FB: ' + markSold.length);
console.log('Not in WPB: ' + noMatch.length);
console.log('All clear: ' + ok.length);

const result = {
    checked_at: new Date().toISOString(),
    checked_at_et: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
    fb_scraped_at_et: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
    summary: {
          total_fb_listings: fbListings.length,
          active_fb_listings: activeFB.length,
          mark_sold: markSold.length,
          no_match: noMatch.length,
          ok: ok.length
    },
    mark_sold: markSold,
    no_match: noMatch,
    ok: ok
};

fs.writeFileSync('fb-sync-results.json', JSON.stringify(result, null, 2));
console.log('Saved fb-sync-results.json');
