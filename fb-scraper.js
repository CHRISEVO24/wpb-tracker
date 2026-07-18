#!/usr/bin/env node
// fb-scraper.js - Scrapes FB Marketplace selling page using saved session cookies
// Runs in GitHub Actions headlessly. Outputs: fb-listings.json

const { chromium } = require('playwright');
const fs = require('fs');

const FB_COOKIES_JSON = process.env.FB_COOKIES;
if (!FB_COOKIES_JSON) {
  console.error('FB_COOKIES environment variable not set.');
  process.exit(1);
}

async function scrapeFBListings() {
  console.log('Launching headless browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-blink-features=AutomationControlled','--disable-dev-shm-usage','--window-size=1280,900']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York'
  });

  const cookies = JSON.parse(FB_COOKIES_JSON);
  await context.addCookies(cookies);
  console.log('Injected ' + cookies.length + ' cookies');

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  console.log('Loading FB Marketplace selling page...');
  await page.goto('https://www.facebook.com/marketplace/you/selling', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  const url = page.url();
  if (url.includes('login') || url.includes('checkpoint')) {
    console.error('Session expired — re-run export-fb-cookies.js and update FB_COOKIES secret.');
    await browser.close();
    process.exit(1);
  }

  console.log('Page loaded. Scrolling to load all listings...');

  // Scroll aggressively — FB lazy-loads listings
  // Count by looking for price patterns ($X,XXX) which appear on every listing
  let previousCount = 0;
  let stableRounds = 0;
  let scrollAttempts = 0;

  while (scrollAttempts < 40) {
    // Scroll by larger amounts to trigger lazy loading
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(2000);

    const text = await page.evaluate(() => document.body.innerText);
    // Count listings by price patterns and action buttons — FB uses several different button labels
    const priceMatches = (text.match(/\$[\d,]+/g) || []).length;
    const actionMatches = (text.match(/Mark as sold|Boost listing|Share|Mark out of stock|Mark as available/g) || []).length;
    const count = Math.max(priceMatches, Math.floor(actionMatches / 2));

    console.log(`Scroll ${scrollAttempts + 1}: ~${priceMatches} prices, ${actionMatches} actions`);

    if (count <= previousCount) {
      stableRounds++;
      if (stableRounds >= 4) {
        console.log('List stable after ' + scrollAttempts + ' scrolls');
        break;
      }
    } else {
      stableRounds = 0;
    }
    previousCount = count;
    scrollAttempts++;
  }

  // Also try scrolling the inner listings container if it exists
  await page.evaluate(() => {
    const containers = Array.from(document.querySelectorAll('div')).filter(d => {
      const s = window.getComputedStyle(d);
      return (s.overflowY === 'scroll' || s.overflowY === 'auto') && d.scrollHeight > 1000;
    });
    containers.forEach(c => c.scrollTop = c.scrollHeight);
  });
  await page.waitForTimeout(2000);

  const pageText = await page.evaluate(() => document.body.innerText);
  const listings = parseListings(pageText);
  console.log('Found ' + listings.length + ' listings total');

  // Load fb_url_mapping.json if it exists (for persistent FB URLs)
  let urlMapping = {};
  if (fs.existsSync('fb_url_mapping.json')) {
    try {
      const mapping = JSON.parse(fs.readFileSync('fb_url_mapping.json', 'utf8'));
      mapping.forEach(m => {
        const key = m.title.toLowerCase().trim();
        urlMapping[key] = { fb_url: m.fb_url, share_url: m.share_url, item_id: m.item_id };
      });
      console.log('Loaded ' + mapping.length + ' URL mappings from fb_url_mapping.json');
    } catch(e) {
      console.log('Could not load fb_url_mapping.json: ' + e.message);
    }
  }

  // Enrich listings with FB URLs from mapping
  listings.forEach(listing => {
    const key = listing.title.toLowerCase().trim();
    const match = urlMapping[key];
    if (match) {
      listing.fb_url = match.fb_url;
      listing.share_url = match.share_url;
      listing.item_id = match.item_id;
    }
  });

  const output = {
    scraped_at: new Date().toISOString(),
    scraped_at_et: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
    total_listings: listings.length,
    listings
  };

  fs.writeFileSync('fb-listings.json', JSON.stringify(output, null, 2));
  console.log('Saved fb-listings.json with ' + listings.length + ' listings');
  await browser.close();
}

function parseListings(text) {
  const listings = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let i = 0;
  while (i < lines.length) {
    if (lines[i].match(/^\$[\d,]+$/) && i > 0) {
      const title = lines[i - 1];
      const price = lines[i];
      let status = 'unknown';
      let listedDate = '';

      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const line = lines[j];
        if (line === 'In stock') { status = 'In stock'; }
        else if (line === 'Sold') { status = 'Sold'; }
        else if (line === 'Active') { status = 'Active'; }
        else if (line === 'Out of stock') { status = 'Out of stock'; }
        else if (line === 'Pending') { status = 'Pending'; }
        if (line.match(/^Listed on \d+\/\d+/)) { listedDate = line.replace('Listed on ', ''); }
        // Stop when we hit the next listing's action buttons
        if (['Mark out of stock','Mark as sold','Mark as available','Boost listing','Mark as pending'].includes(line)) break;
      }

      if (status !== 'unknown' && title.length > 5 && !title.includes('$')) {
        listings.push({ title, price, status, listed_date: listedDate, fb_url: '', share_url: '', item_id: '' });
      }
    }
    i++;
  }
  return listings;
}

scrapeFBListings().catch(err => { console.error('Scraper error:', err.message); process.exit(1); });
