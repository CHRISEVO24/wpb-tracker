#!/usr/bin/env node
// fb-check.js
// Compares fb-listings.json against history.json
// ONLY flags items that are ACTIVELY FOR SALE on FB but Out of Stock on WPB
// Ignores anything already marked Out of Stock, Sold, or inactive on FB

const fs = require('fs');

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchListing(fbTitle, inventory) {
  const fbNorm = normalize(fbTitle);
  const refs = fbTitle.match(/\b([A-Z]{2,}[\d]+[A-Z]*[\d]*|[\d]{4,6}[A-Z]{0,4})\b/g) || [];

  // 1. Reference number match
  for (const ref of refs) {
    const match = inventory.find(item =>
      item.referenceNumber &&
      normalize(String(item.referenceNumber)).includes(normalize(ref))
    );
    if (match) return match;
  }

  // 2. Word overlap match
  const fbWords = fbNorm.split(' ').filter(w => w.length > 4);
  let bestMatch = null, bestScore = 0;
  for (const item of inventory) {
    const itemNorm = normalize(item.name || '');
    const score = fbWords.filter(w => itemNorm.includes(w)).length / fbWords.length;
    if (score > bestScore && score >= 0.5) { bestScore = score; bestMatch = item; }
  }
  return bestMatch;
}

async function runCheck() {
  if (!fs.existsSync('fb-listings.json')) {
    console.error('fb-listings.json not found'); process.exit(1);
  }
  if (!fs.existsSync('history.json')) {
    console.error('history.json not found'); process.exit(1);
  }

  const fbData = JSON.parse(fs.readFileSync('fb-listings.json', 'utf8'));
  const history = JSON.parse(fs.readFileSync('history.json', 'utf8'));

  // Get latest snapshot
  const timestamps = Object.keys(history).sort();
  const latestSnapshot = history[timestamps[timestamps.length - 1]];
  const inventory = Object.values(latestSnapshot);

  console.log(`Inventory: ${inventory.length} items | FB Listings: ${fbData.listings.length}`);

  // ── ONLY look at listings actively for sale on FB ──────────────────────────
  // "Active" = listed in groups/marketplace, "In stock" = standard active listing
  // Everything else (Out of Stock, Sold, inactive) is already handled — skip it
  const activeListings = fbData.listings.filter(fb =>
    ['Active', 'In stock'].includes(fb.status)
  );

  console.log(`Active FB listings (for sale): ${activeListings.length}`);
  console.log(`Skipping ${fbData.listings.length - activeListings.length} listings already marked Out of Stock/Sold on FB`);

  const markSold = [];    // Active on FB + Out of Stock on WPB = needs to be marked sold
  const noMatch = [];     // Active on FB but not found in WPB inventory
  const ok = [];          // Active on FB + In Stock on WPB = all good
  const seen = {};

  for (const fb of activeListings) {
    // Deduplicate
    const normTitle = normalize(fb.title);
    if (seen[normTitle]) continue;
    seen[normTitle] = true;

    const match = matchListing(fb.title, inventory);

    if (!match) {
      noMatch.push({
        fb_title: fb.title,
        fb_status: fb.status,
        fb_price: fb.price,
        fb_listed: fb.listed_date,
        note: 'Not found in WPB inventory — may be consignment or missing product code'
      });
      continue;
    }

    const isOOS = !match.inStock || match.stockStatus === 'outofstock';

    const item = {
      fb_title: fb.title,
      fb_status: fb.status,
      fb_price: fb.price,
      fb_listed: fb.listed_date,
      wpb_name: match.name,
      product_code: match.productCode,
      reference_number: match.referenceNumber,
      wpb_stock: isOOS ? 'Out of Stock' : 'In Stock',
      wpb_url: match.url || ''
    };

    if (isOOS) {
      // Active on FB but already sold on WPB website — needs to be marked sold on FB
      markSold.push({ ...item, action: 'MARK_SOLD' });
    } else {
      // Active on FB and In Stock on WPB — all good
      ok.push({ ...item, action: 'OK' });
    }
  }

  const output = {
    checked_at: new Date().toISOString(),
    checked_at_et: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
    fb_scraped_at_et: fbData.scraped_at_et,
    summary: {
      total_fb_listings: fbData.listings.length,
      active_fb_listings: activeListings.length,
      mark_sold: markSold.length,
      no_match: noMatch.length,
      ok: ok.length
    },
    mark_sold: markSold,
    no_match: noMatch,
    ok
  };

  fs.writeFileSync('fb-sync-results.json', JSON.stringify(output, null, 2));

  console.log('');
  console.log('=== FB SYNC RESULTS ===');
  console.log(`🔴 Mark as Sold on FB:  ${markSold.length}`);
  console.log(`🟠 Not in WPB:          ${noMatch.length}`);
  console.log(`✅ All clear:           ${ok.length}`);

  if (markSold.length > 0) {
    console.log('\n🔴 MARK THESE AS SOLD ON FACEBOOK:');
    markSold.forEach(i => console.log(`   • ${i.fb_title} (${i.product_code}) — ${i.fb_price}`));
  }

  console.log('\n💾 Saved fb-sync-results.json');
}

runCheck().catch(err => { console.error('Error:', err.message); process.exit(1); });
