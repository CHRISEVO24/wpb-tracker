#!/usr/bin/env node
// fb-scraper.js - Scrapes FB Marketplace selling page using saved session cookies
// Runs in GitHub Actions headlessly. Outputs: fb-listings.json

const { chromium } = require('playwright');
const fs = require('fs');

const FB_COOKIES_JSON = process.env.FB_COOKIES;
if (!FB_COOKIES_JSON) {
  console.error('FB_COOKIES environment variable not set.');
  console.error('Run export-fb-cookies.js locally and add output as GitHub Secret FB_COOKIES.');
  process.exit(1);
}

async function scrapeFBListings() {
  console.log('Launching headless browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-blink-features=AutomationControlled','--disable-dev-shm-usage','--window-size=1280,800']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
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
  await page.waitForTimeout(3000);
  const url = page.url();
  if (url.includes('login') || url.includes('checkpoint')) {
    console.error('Session expired. Re-run export-fb-cookies.js and update FB_COOKIES secret.');
    await browser.close();
    process.exit(1);
  }
  console.log('Page loaded. Scrolling to load all listings...');
  let previousCount = 0;
  let scrollAttempts = 0;
  while (scrollAttempts < 20) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1500);
    const text = await page.evaluate(() => document.body.innerText);
    const count = (text.match(/Mark out of stock|Mark as sold|Mark as available/g) || []).length;
    if (count === previousCount && scrollAttempts > 3) { console.log('Loaded ' + count + ' listings'); break; }
    previousCount = count;
    scrollAttempts++;
  }
  const pageText = await page.evaluate(() => document.body.innerText);
  const listings = parseListings(pageText);
  console.log('Found ' + listings.length + ' listings');
  const output = {
    scraped_at: new Date().toISOString(),
    scraped_at_et: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
    total_listings: listings.length,
    listings
  };
  fs.writeFileSync('fb-listings.json', JSON.stringify(output, null, 2));
  console.log('Saved fb-listings.json');
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
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        if (lines[j] === 'In stock') { status = 'In stock'; }
        if (lines[j] === 'Sold') { status = 'Sold'; }
        if (lines[j] === 'Active') { status = 'Active'; }
        if (lines[j].match(/^Listed on \d+\/\d+/)) { listedDate = lines[j].replace('Listed on ', ''); }
        if (['Mark out of stock','Mark as sold','Mark as available','Boost listing'].includes(lines[j])) break;
      }
      if (status !== 'unknown' && title.length > 5 && !title.includes('$')) {
        listings.push({ title, price, status, listed_date: listedDate });
      }
    }
    i++;
  }
  return listings;
}

scrapeFBListings().catch(err => { console.error('Scraper error:', err.message); process.exit(1); });
