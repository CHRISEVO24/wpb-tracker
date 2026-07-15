#!/usr/bin/env node
// fb-check.js - Compares fb-listings.json against history.json
// history.json structure: { "timestamp": { "product_id": { product data } } }
// Outputs fb-sync-results.json for the dashboard FB Sync tab

const fs = require('fs');

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchListing(fbTitle, inventory) {
  const fbNorm = normalize(fbTitle);
  const refs = fbTitle.match(/\b([A-Z]{2,}[\d]+[A-Z]*[\d]*|[\d]{4,6}[A-Z]{0,4})\b/g) || [];

  // 1. Try reference number match
  for (const ref of refs) {
    const match = inventory.find(item =>
      item.referenceNumber && normalize(String(item.referenceNumber)).includes(normalize(ref))
    );
    if (match) return match;
  }

  // 2. Try name word overlap
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

  // history.json = { "timestamp": { "product_id": { ...product } } }
  // Get the most recent snapshot
  const timestamps = Object.keys(history).sort();
  const latestTimestamp = timestamps[timestamps.length - 1];
  const latestSnapshot = history[latestTimestamp];
  const inventory = Object.values(latestSnapshot);

  console.log(`Snapshot: ${latestTimestamp} | Products: ${inventory.length} | FB Listings: ${fbData.listings.length}`);

  const markSold = [], verifySold = [], noMatch = [], duplicates = [], ok = [];
  const seen = {};

  for (const fb of fbData.listings) {
    const normTitle = normalize(fb.title);
    if (seen[normTitle]) {
      duplicates.push({ fb_title: fb.title, fb_status: fb.status, fb_price: fb.price, note: 'Duplicate FB listing' });
      continue;
    }
    seen[normTitle] = true;

    const match = matchListing(fb.title, inventory);
    if (!match) {
      noMatch.push({ fb_title: fb.title, fb_status: fb.status, fb_price: fb.price, note: 'Not found in WPB inventory' });
      continue;
    }

    const isOOS = !match.inStock || match.stockStatus === 'outofstock';
    const isFBActive = ['In stock', 'Active'].includes(fb.status);
    const isFBSold = fb.status === 'Sold';

    const item = {
      fb_title: fb.title,
      fb_status: fb.status,
      fb_price: fb.price,
      fb_listed: fb.listed_date,
      wpb_name: match.name,
      product_code: match.productCode,
      reference_number: match.referenceNumber,
      wpb_stock: isOOS ? 'Out of Stock' : 'In Stock'
    };

    if (isFBActive && isOOS) markSold.push({ ...item, action: 'MARK_SOLD' });
    else if (isFBSold && !isOOS) verifySold.push({ ...item, action: 'VERIFY_SOLD' });
    else ok.push({ ...item, action: 'OK' });
  }

  const output = {
    checked_at: new Date().toISOString(),
    checked_at_et: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
    fb_scraped_at_et: fbData.scraped_at_et,
    summary: {
      total_fb_listings: fbData.listings.length,
      mark_sold: markSold.length,
      verify_sold: verifySold.length,
      no_match: noMatch.length,
      duplicates: duplicates.length,
      ok: ok.length
    },
    mark_sold: markSold,
    verify_sold: verifySold,
    no_match: noMatch,
    duplicates,
    ok
  };

  fs.writeFileSync('fb-sync-results.json', JSON.stringify(output, null, 2));

  console.log('');
  console.log('=== FB SYNC RESULTS ===');
  console.log(`🔴 Mark as Sold:     ${markSold.length}`);
  console.log(`🟡 Verify (FB sold): ${verifySold.length}`);
  console.log(`🟠 Not in WPB:       ${noMatch.length}`);
  console.log(`🟠 Duplicates:       ${duplicates.length}`);
  console.log(`✅ All clear:        ${ok.length}`);

  if (markSold.length > 0) {
    console.log('\n🔴 ITEMS TO MARK SOLD ON FACEBOOK:');
    markSold.forEach(i => console.log(`   • ${i.fb_title} — ${i.fb_price} (${i.product_code})`));
  }

  console.log('\n💾 Saved fb-sync-results.json');
}

runCheck().catch(err => { console.error('Error:', err.message); process.exit(1); });
